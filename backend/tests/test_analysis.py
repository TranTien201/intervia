"""Background analysis (BE-4.7): jobs, progress, re-analysis, deletion, restart, concurrency."""

import asyncio
import uuid
from collections.abc import Callable

import httpx
import pytest

from app.config import Settings
from app.db import cvs, jds
from app.domain.analysis import INTERRUPTED, progress
from app.domain.files import PDF
from app.main import create_app
from app.providers.extract.base import ExtractionResult, ExtractorError
from app.providers.extract.fake import FakeExtractor
from app.schemas.analysis import AnalysisError, AnalysisState
from app.schemas.user import DEFAULT_USER_ID
from tests.samples import LINE, make_pdf

PDF_BYTES = make_pdf([LINE] * 8)
JD_TEXT = "Công ty XYZ tuyển Backend Engineer.\nYêu cầu: 3 năm Python, PostgreSQL."


class Harness:
    def __init__(self, app, client: httpx.AsyncClient):
        self.app = app
        self.client = client

    @property
    def runner(self):
        return self.app.state.analysis

    def use(self, extractor: FakeExtractor) -> FakeExtractor:
        self.runner.extractor = extractor
        return extractor

    async def upload_cv(self, data: bytes = PDF_BYTES, **form) -> str:
        r = await self.client.post(
            "/api/cvs",
            data={"name": "CV", **form},
            files={"file": ("cv.pdf", data, "application/pdf")},
        )
        assert r.status_code == 201, r.text
        return r.json()["id"]

    async def add_jd(self, text: str = JD_TEXT) -> str:
        r = await self.client.post("/api/jds", json={"name": "JD", "text": text})
        assert r.status_code == 201, r.text
        return r.json()["id"]

    async def analysis(self, kind: str, ref_id: str) -> dict:
        r = await self.client.get(f"/api/{kind}s/{ref_id}/analysis")
        assert r.status_code == 200, r.text
        return r.json()


async def _start(settings: Settings):
    app = create_app(settings)
    lifespan = app.router.lifespan_context(app)
    await lifespan.__aenter__()
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
    return app, lifespan, client


@pytest.fixture
def h(app, client) -> Harness:
    return Harness(app, client)


async def wait_until(condition: Callable[[], bool], timeout_s: float = 2) -> None:
    async with asyncio.timeout(timeout_s):
        while not condition():  # noqa: ASYNC110 (polls state set by another task)
            await asyncio.sleep(0.01)


def _statuses(body: dict) -> list[str]:
    return [step["status"] for step in body["steps"]]


# ---- progress (pure) ----


def _state(**fields) -> AnalysisState:
    return AnalysisState(attempt_id="a", **fields)


def test_progress_steps_follow_step_and_status():
    assert _statuses(progress("cv", _state(status="pending", step="upload")).model_dump()) == [
        "pending",
        "pending",
        "pending",
    ]
    running = progress("cv", _state(status="running", step="extract"))
    assert _statuses(running.model_dump()) == ["done", "running", "pending"]
    assert running.error is None
    failed = progress(
        "cv", _state(status="failed", step="profile", error=AnalysisError(code="x", message="y"))
    )
    assert _statuses(failed.model_dump()) == ["done", "done", "failed"]
    assert failed.error is not None
    done = progress("jd", _state(status="done", step="analyze"))
    assert [(s.key, s.label, s.status) for s in done.steps] == [
        ("receive", "Đã nhận JD", "done"),
        ("analyze", "Phân tích JD", "done"),
    ]


# ---- CV ----


async def test_cv_upload_runs_analysis(h: Harness, db):
    gate = asyncio.Event()
    fake = h.use(FakeExtractor(gate=gate))
    cv_id = await h.upload_cv()

    await wait_until(lambda: fake.running == 1)
    body = await h.analysis("cv", cv_id)
    assert body["status"] == "running"
    assert [s["key"] for s in body["steps"]] == ["upload", "extract", "profile"]
    assert _statuses(body) == ["done", "running", "pending"]
    assert body["error"] is None

    gate.set()
    await h.runner.join()
    body = await h.analysis("cv", cv_id)
    assert body["status"] == "done"
    assert _statuses(body) == ["done", "done", "done"]

    r = await h.client.get(f"/api/cvs/{cv_id}/versions/latest")
    assert r.status_code == 200
    version = r.json()
    assert (version["version"], version["origin"], version["mode"]) == (1, "analysis", "standard")
    assert version["profile"]["skills"]
    stored = await db.cv_versions.find_one({"cv_id": cv_id})
    assert stored["extraction"]["skills"]
    assert stored["extractor"]["provider"] == "fake"
    cv = await db.cvs.find_one({"_id": cv_id})
    assert cv["latest_version"] == 1
    assert cv["analysis"]["finished_at"] is not None
    r = await h.client.get(f"/api/cvs/{cv_id}")
    assert r.json()["analysis_status"] == "done"


async def test_cv_no_text_fails_on_extract_step(h: Harness, db):
    h.use(FakeExtractor(error=ExtractorError("no_text")))
    cv_id = await h.upload_cv()
    await h.runner.join()

    body = await h.analysis("cv", cv_id)
    assert body["status"] == "failed"
    assert _statuses(body) == ["done", "failed", "pending"]
    assert body["error"]["code"] == "no_text_in_file"
    assert "PDF/DOCX có chữ" in body["error"]["message"]
    assert await db.cv_versions.count_documents({"cv_id": cv_id}) == 0


@pytest.mark.parametrize("code", ["provider_error", "timeout"])
async def test_cv_provider_error_is_llm_error(h: Harness, code):
    h.use(FakeExtractor(error=ExtractorError(code)))
    cv_id = await h.upload_cv()
    await h.runner.join()

    body = await h.analysis("cv", cv_id)
    assert body["status"] == "failed"
    assert body["error"]["code"] == "llm_error"
    assert body["error"]["message"] == "Phân tích chưa thành công. Hãy thử phân tích lại."


async def test_cv_output_not_in_schema_is_llm_error(h: Harness, db):
    bad = ExtractionResult(
        data={"skills": "not a list"},
        citations={},
        document_text=None,
        provider="fake",
        tier="economy",
        latency_ms=0,
        retries=0,
        usage={},
    )
    h.use(FakeExtractor(result=bad))
    cv_id = await h.upload_cv()
    await h.runner.join()

    body = await h.analysis("cv", cv_id)
    assert (body["status"], body["error"]["code"]) == ("failed", "llm_error")
    assert _statuses(body) == ["done", "done", "failed"]
    assert await db.cv_versions.count_documents({"cv_id": cv_id}) == 0


async def test_cv_missing_file_is_llm_error(h: Harness, db):
    h.use(FakeExtractor())
    cv_id = await h.upload_cv()
    await h.runner.join()  # analysis 1 done; now break the stored file
    cv = await db.cvs.find_one({"_id": cv_id})
    await cvs.delete_file(db, cv["file_id"])

    r = await h.client.post(f"/api/cvs/{cv_id}/reanalyze")
    assert r.status_code == 202
    await h.runner.join()
    body = await h.analysis("cv", cv_id)
    assert (body["status"], body["error"]["code"]) == ("failed", "llm_error")


async def test_cv_reanalyze(h: Harness, db):
    fake = h.use(FakeExtractor())
    cv_id = await h.upload_cv(mode="layout")
    await h.runner.join()

    r = await h.client.post(f"/api/cvs/{cv_id}/reanalyze")
    assert r.status_code == 202
    assert r.json()["status"] == "pending"
    await h.runner.join()

    r = await h.client.get(f"/api/cvs/{cv_id}/versions")
    assert [(v["version"], v["origin"]) for v in r.json()] == [(2, "reanalysis"), (1, "analysis")]
    second = await cvs.get_version(db, DEFAULT_USER_ID, cv_id, 2)
    assert second is not None and second.mode == "layout"  # previous mode kept
    assert (await db.cvs.find_one({"_id": cv_id}))["latest_version"] == 2
    # Same file, same mode: the second run reuses the first output, no provider call.
    assert len(fake.calls) == 1

    r = await h.client.post(f"/api/cvs/{cv_id}/reanalyze", json={"mode": "precise"})
    assert r.status_code == 202
    await h.runner.join()
    third = await cvs.get_version(db, DEFAULT_USER_ID, cv_id, 3)
    assert third is not None and third.mode == "precise"
    assert fake.calls[-1].quality == "high"

    r = await h.client.get(f"/api/cvs/{cv_id}/versions")
    assert [v["mode"] for v in r.json()] == ["precise", "layout", "layout"]


async def test_cv_reanalyze_while_running_starts_no_second_job(h: Harness, db):
    gate = asyncio.Event()
    fake = h.use(FakeExtractor(gate=gate))
    cv_id = await h.upload_cv()
    await wait_until(lambda: fake.running == 1)
    attempt = (await db.cvs.find_one({"_id": cv_id}))["analysis"]["attempt_id"]

    r = await h.client.post(f"/api/cvs/{cv_id}/reanalyze")
    assert r.status_code == 202
    assert r.json()["status"] == "running"
    assert (await db.cvs.find_one({"_id": cv_id}))["analysis"]["attempt_id"] == attempt

    gate.set()
    await h.runner.join()
    assert len(fake.calls) == 1
    assert await db.cv_versions.count_documents({"cv_id": cv_id}) == 1


async def test_reanalyze_checks_mode_and_owner(h: Harness):
    h.use(FakeExtractor())
    cv_id = await h.upload_cv()
    jd_id = await h.add_jd()
    await h.runner.join()

    r = await h.client.post(f"/api/cvs/{cv_id}/reanalyze", json={"mode": "fast"})
    assert r.status_code == 422
    assert "mode" in r.json()["error"]["fields"]
    r = await h.client.post(f"/api/jds/{jd_id}/reanalyze", json={"mode": "layout"})
    assert r.status_code == 422
    r = await h.client.post(f"/api/cvs/{uuid.uuid4()}/reanalyze")
    assert r.status_code == 404
    r = await h.client.get(f"/api/jds/{uuid.uuid4()}/analysis")
    assert r.status_code == 404


async def test_delete_cv_while_running_leaves_nothing(h: Harness, db):
    gate = asyncio.Event()
    fake = h.use(FakeExtractor(gate=gate))
    cv_id = await h.upload_cv()
    await wait_until(lambda: fake.running == 1)

    r = await h.client.delete(f"/api/cvs/{cv_id}")
    assert r.status_code == 204
    gate.set()
    await h.runner.join()

    assert await db.cvs.count_documents({"_id": cv_id}) == 0
    assert await db.cv_versions.count_documents({"cv_id": cv_id}) == 0
    # The extraction finished after the deletion: its record (CV content) is removed too.
    assert await db.llm_calls.count_documents({"ref.id": cv_id}) == 0


async def test_cv_marked_deleting_mid_job_removes_saved_version(h: Harness, db):
    """Deletion started (hidden) but not finished when the job saves: the job cleans up."""
    gate = asyncio.Event()
    fake = h.use(FakeExtractor(gate=gate))
    cv_id = await h.upload_cv()
    await wait_until(lambda: fake.running == 1)
    await cvs.mark_deleting(db, DEFAULT_USER_ID, cv_id)
    gate.set()
    await h.runner.join()

    assert await db.cv_versions.count_documents({"cv_id": cv_id}) == 0
    assert await db.llm_calls.count_documents({"ref.id": cv_id}) == 0


async def test_concurrency_limit(db, settings: Settings):
    app, lifespan, client = await _start(
        settings.model_copy(update={"analysis_max_concurrency": 2})
    )
    try:
        h = Harness(app, client)
        gate = asyncio.Event()
        fake = h.use(FakeExtractor(gate=gate))
        # Different files, so no run reuses another's output.
        ids = [await h.upload_cv(make_pdf([f"{LINE} {i}"] * 8)) for i in range(4)]
        await wait_until(lambda: fake.running == 2)
        await asyncio.sleep(0.05)
        assert fake.running == 2
        waiting = [await h.analysis("cv", cv_id) for cv_id in ids]
        assert sorted(b["status"] for b in waiting) == ["pending", "pending", "running", "running"]

        gate.set()
        await h.runner.join()
        assert fake.max_running == 2
        assert [(await h.analysis("cv", cv_id))["status"] for cv_id in ids] == ["done"] * 4
    finally:
        await client.aclose()
        await lifespan.__aexit__(None, None, None)


# ---- JD ----


async def test_jd_analysis_updates_library_fields(h: Harness, db):
    h.use(FakeExtractor())
    jd_id = await h.add_jd()
    await h.runner.join()

    body = await h.analysis("jd", jd_id)
    assert body["status"] == "done"
    assert [s["key"] for s in body["steps"]] == ["receive", "analyze"]
    r = await h.client.get(f"/api/jds/{jd_id}")
    jd = r.json()
    assert (jd["company"], jd["position"], jd["latest_version"]) == (
        "Công ty XYZ",
        "Backend Engineer",
        1,
    )
    assert jd["requirement_count"] == 4
    r = await h.client.get(f"/api/jds/{jd_id}/versions/latest")
    assert (r.json()["origin"], len(r.json()["requirements"]["requirements"])) == ("analysis", 4)


async def test_jd_provider_error_and_reanalyze(h: Harness):
    h.use(FakeExtractor(error=ExtractorError("provider_error")))
    jd_id = await h.add_jd()
    await h.runner.join()
    body = await h.analysis("jd", jd_id)
    assert (body["status"], body["error"]["code"]) == ("failed", "llm_error")
    assert _statuses(body) == ["done", "failed"]

    h.use(FakeExtractor())
    r = await h.client.post(f"/api/jds/{jd_id}/reanalyze", json={"mode": "precise"})
    assert r.status_code == 202
    await h.runner.join()
    assert (await h.analysis("jd", jd_id))["status"] == "done"
    r = await h.client.get(f"/api/jds/{jd_id}/versions/latest")
    # First version saved, even though it came from a re-run.
    assert (r.json()["version"], r.json()["origin"], r.json()["mode"]) == (
        1,
        "analysis",
        "precise",
    )


# ---- restart ----


async def test_restart_marks_unfinished_failed_and_finishes_deletions(db, settings: Settings):
    running = await cvs.create_cv(db, DEFAULT_USER_ID, "CV", "cv.pdf", PDF, PDF_BYTES)
    await cvs.set_analysis(db, running.id, running.analysis.attempt_id, status="running")
    pending = await jds.create_jd(db, DEFAULT_USER_ID, "JD", JD_TEXT)
    deleting = await cvs.create_cv(db, DEFAULT_USER_ID, "CV 2", "cv.pdf", PDF, PDF_BYTES)
    await cvs.mark_deleting(db, DEFAULT_USER_ID, deleting.id)

    app, lifespan, client = await _start(settings)
    try:
        h = Harness(app, client)
        for kind, ref_id, step in (("cv", running.id, "upload"), ("jd", pending.id, "receive")):
            body = await h.analysis(kind, ref_id)
            assert body["status"] == "failed"
            assert body["steps"][0] == {
                "key": step,
                "label": body["steps"][0]["label"],
                "status": "failed",
            }
            assert body["error"] == INTERRUPTED.model_dump()
        assert await db.cvs.count_documents({"_id": deleting.id}) == 0
        assert await db["cv_files.files"].count_documents({"metadata.cv_id": deleting.id}) == 0

        # Not re-run on its own; the user re-runs it.
        h.use(FakeExtractor())
        r = await client.post(f"/api/cvs/{running.id}/reanalyze")
        assert r.status_code == 202
        await h.runner.join()
        assert (await h.analysis("cv", running.id))["status"] == "done"
    finally:
        await client.aclose()
        await lifespan.__aexit__(None, None, None)


async def test_shutdown_cancels_running_jobs(db, settings: Settings):
    app, lifespan, client = await _start(settings)
    h = Harness(app, client)
    fake = h.use(FakeExtractor(gate=asyncio.Event()))  # never released
    cv_id = await h.upload_cv()
    await wait_until(lambda: fake.running == 1)
    await client.aclose()
    await lifespan.__aexit__(None, None, None)
    assert fake.running == 0
    # Left running in the database: the next startup marks it interrupted.
    assert (await db.cvs.find_one({"_id": cv_id}))["analysis"]["status"] == "running"
