"""Background CV / JD analysis and its progress (docs/tasks/backend-cv-jd.md BE-4.7).

One process, plain asyncio tasks: no external queue in MVP-1. A job is tied to one attempt
(`analysis.attempt_id`); every status write is conditional on that attempt still being the
current one, so a stale job never overwrites a newer one. A job never stays `running`: every
error path writes `failed`, and a process that stops mid-job is caught at the next startup
(`recover`), which marks its unfinished analyses `failed` without re-running them (no
unexpected provider cost).

Deletion runs concurrently and without transactions, so the job checks the CV / JD is still
there before saving a version, and checks again after: a version saved while the deletion
was running is removed by the job itself.
"""

import asyncio
import logging
import traceback
import uuid
from collections.abc import Awaitable, Callable, Coroutine
from typing import Any, Literal

from pydantic import ValidationError
from pymongo.asynchronous.database import AsyncDatabase

from app.api.errors import AppError
from app.db import cvs, jds, llm_calls
from app.db.mongo import utcnow
from app.domain import library
from app.domain.extraction import extract_cv, extract_jd
from app.domain.jd_analysis import build_requirements, parse_jd_extraction
from app.domain.profiling import build_profile, parse_cv_extraction
from app.providers.extract.base import DocumentExtractor, ExtractorError
from app.schemas.analysis import (
    AnalysisError,
    AnalysisProgress,
    AnalysisState,
    AnalysisStep,
    ExtractionMode,
)
from app.schemas.cv import CvRecord, CvVersionRecord
from app.schemas.jd import JdRecord, JdVersionRecord

log = logging.getLogger(__name__)

Kind = Literal["cv", "jd"]

# Same keys and labels as the web's mock API (web/src/mocks/db.ts).
STEPS: dict[Kind, list[tuple[str, str]]] = {
    "cv": [("upload", "Đã tải CV"), ("extract", "Đang đọc CV"), ("profile", "Trích xuất hồ sơ")],
    "jd": [("receive", "Đã nhận JD"), ("analyze", "Phân tích JD")],
}

NO_TEXT = AnalysisError(
    code="no_text_in_file",
    message="Không đọc được chữ trong file. Hãy dùng file PDF/DOCX có chữ (không phải ảnh chụp).",
)
FAILED = AnalysisError(
    code="llm_error", message="Phân tích chưa thành công. Hãy thử phân tích lại."
)
INTERRUPTED = AnalysisError(code="llm_error", message="Phân tích bị gián đoạn, hãy phân tích lại.")

_SAVE_ATTEMPTS = 3  # a user edit saved at the same moment takes the version number: retry


def progress(kind: Kind, analysis: AnalysisState) -> AnalysisProgress:
    """Steps before the current one are done, the current one is running (pending while the
    job waits for a slot, failed when the analysis failed), later ones pending."""
    keys = [key for key, _ in STEPS[kind]]
    current = keys.index(analysis.step) if analysis.step in keys else 0
    current_status = {"pending": "pending", "running": "running", "failed": "failed"}.get(
        analysis.status, "done"
    )

    def status(i: int) -> str:
        if analysis.status == "done" or i < current:
            return "done"
        return current_status if i == current else "pending"

    return AnalysisProgress(
        status=analysis.status,
        steps=[
            AnalysisStep(key=key, label=label, status=status(i))  # type: ignore[arg-type]
            for i, (key, label) in enumerate(STEPS[kind])
        ],
        error=analysis.error if analysis.status == "failed" else None,
    )


def is_active(analysis: AnalysisState) -> bool:
    return analysis.status in ("pending", "running")


async def recover(db: AsyncDatabase) -> None:
    """At startup, before serving requests. Assumes a single API process: a second process
    starting would mark the first one's running jobs as interrupted."""
    failed = await cvs.fail_unfinished(db, INTERRUPTED) + await jds.fail_unfinished(db, INTERRUPTED)
    deleted = await library.resume_deletions(db)
    if failed or deleted:
        log.info(
            "Startup recovery: %d interrupted analyses, %d deletions finished", failed, deleted
        )


class _Stop(Exception):
    """The attempt was replaced, or the CV / JD deleted: stop without writing anything."""


class AnalysisRunner:
    """Runs analyses as background tasks, at most `max_concurrency` at a time."""

    def __init__(self, db: AsyncDatabase, extractor: DocumentExtractor, max_concurrency: int):
        self.db = db
        self.extractor = extractor
        self._slots = asyncio.Semaphore(max_concurrency)
        self._tasks: set[asyncio.Task[None]] = set()  # keeps running tasks referenced

    async def start_cv(self, cv: CvRecord, mode: ExtractionMode | None = None) -> AnalysisState:
        """Start a new attempt replacing `cv.analysis`. If another request started one first,
        returns that one instead (no second job)."""
        state = _new_attempt("upload", mode or cv.analysis.mode)
        if await cvs.restart_analysis(self.db, cv.id, cv.analysis.attempt_id, state):
            self._spawn(self._run_cv(cv.user_id, cv.id, state), cv.id)
            return state
        return await self._current("cv", cv.user_id, cv.id)

    async def start_jd(self, jd: JdRecord, mode: ExtractionMode | None = None) -> AnalysisState:
        """Same as `start_cv`."""
        state = _new_attempt("receive", mode or jd.analysis.mode)
        if await jds.restart_analysis(self.db, jd.id, jd.analysis.attempt_id, state):
            self._spawn(self._run_jd(jd.user_id, jd.id, state), jd.id)
            return state
        return await self._current("jd", jd.user_id, jd.id)

    async def join(self) -> None:
        """Wait until every job started so far has finished (tests)."""
        while self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

    async def aclose(self) -> None:
        """At shutdown: cancel running jobs; the next startup marks them interrupted."""
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)

    # ---- internals ----

    async def _current(self, kind: Kind, user_id: str, ref_id: str) -> AnalysisState:
        record = await (cvs.get_cv if kind == "cv" else jds.get_jd)(self.db, user_id, ref_id)
        if record is None:
            what = "CV" if kind == "cv" else "JD"
            raise AppError("not_found", 404, f"Không tìm thấy {what}.")
        return record.analysis

    def _spawn(self, job: Coroutine[Any, Any, None], ref_id: str) -> None:
        task = asyncio.create_task(job, name=f"analysis:{ref_id}")
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _run_cv(self, user_id: str, cv_id: str, state: AnalysisState) -> None:
        async def write(**fields: Any) -> None:
            if not await cvs.set_analysis(self.db, cv_id, state.attempt_id, **fields):
                raise _Stop

        async def live() -> CvRecord:
            cv = await cvs.get_cv(self.db, user_id, cv_id)
            if cv is None:
                raise _Stop
            if cv.analysis.attempt_id != state.attempt_id:
                raise _Stop
            return cv

        async def job() -> None:
            await write(status="running", step="extract")
            cv = await live()
            content = await cvs.read_file(self.db, cv.file_id)
            outcome = await extract_cv(
                self.db,
                self.extractor,
                user_id=user_id,
                cv_id=cv_id,
                attempt_id=state.attempt_id,
                mode=state.mode,
                filename=cv.file_name,
                content=content,
                content_type=cv.content_type,
            )
            await write(step="profile")
            result = outcome.result
            extraction = parse_cv_extraction(result.data)
            profile, stats = build_profile(extraction, result.citations, result.document_text)
            log.info("CV %s profile built: %s", cv_id, stats)

            for _ in range(_SAVE_ATTEMPTS):
                await live()
                latest = await cvs.latest_version(self.db, cv_id)
                record = CvVersionRecord(
                    id=str(uuid.uuid4()),
                    cv_id=cv_id,
                    user_id=user_id,
                    version=(latest or 0) + 1,
                    origin="analysis" if latest is None else "reanalysis",
                    mode=state.mode,
                    profile=profile,
                    extraction=extraction.model_dump(mode="json"),
                    citations={k: [c.model_dump() for c in v] for k, v in result.citations.items()},
                    extractor=outcome.extractor_info(),
                    created_at=utcnow(),
                )
                try:
                    await cvs.insert_version(self.db, record)
                    break
                except AppError as e:
                    if e.code != "version_conflict":
                        raise
            else:
                raise RuntimeError("could not save the analysis version")
            await live()  # deleted while saving: removes the version just saved
            await write(status="done", finished_at=utcnow())
            log.info("CV %s analysed: version %d", cv_id, record.version)

        await self._guarded("cv", user_id, cv_id, job, write)

    async def _run_jd(self, user_id: str, jd_id: str, state: AnalysisState) -> None:
        async def write(**fields: Any) -> None:
            if not await jds.set_analysis(self.db, jd_id, state.attempt_id, **fields):
                raise _Stop

        async def live() -> JdRecord:
            jd = await jds.get_jd(self.db, user_id, jd_id)
            if jd is None:
                raise _Stop
            if jd.analysis.attempt_id != state.attempt_id:
                raise _Stop
            return jd

        async def job() -> None:
            await write(status="running", step="analyze")
            jd = await live()
            outcome = await extract_jd(
                self.db,
                self.extractor,
                user_id=user_id,
                jd_id=jd_id,
                attempt_id=state.attempt_id,
                mode=state.mode,
                text=jd.text,
            )
            result = outcome.result
            extraction = parse_jd_extraction(result.data)
            requirements, meta = build_requirements(extraction, jd.text)
            log.info(
                "JD %s requirements built: %d kept, %d empty, %d merged, %d over limit, "
                "%d quotes not found",
                jd_id,
                meta.requirement_count,
                meta.empty,
                meta.merged,
                meta.over_limit,
                meta.quotes_not_found,
            )

            for _ in range(_SAVE_ATTEMPTS):
                await live()
                latest = await jds.latest_version(self.db, jd_id)
                record = JdVersionRecord(
                    id=str(uuid.uuid4()),
                    jd_id=jd_id,
                    user_id=user_id,
                    version=(latest or 0) + 1,
                    origin="analysis" if latest is None else "reanalysis",
                    mode=state.mode,
                    requirements=requirements,
                    extraction=extraction.model_dump(mode="json"),
                    citations={k: [c.model_dump() for c in v] for k, v in result.citations.items()},
                    extractor=outcome.extractor_info(),
                    created_at=utcnow(),
                )
                try:
                    await jds.insert_version(self.db, record)
                    break
                except AppError as e:
                    if e.code != "version_conflict":
                        raise
            else:
                raise RuntimeError("could not save the analysis version")
            await jds.set_meta(self.db, jd_id, meta.company, meta.position)
            await live()
            await write(status="done", finished_at=utcnow())
            log.info("JD %s analysed: version %d", jd_id, record.version)

        await self._guarded("jd", user_id, jd_id, job, write)

    async def _guarded(
        self,
        kind: Kind,
        user_id: str,
        ref_id: str,
        job: Callable[[], Awaitable[None]],
        write: Callable[..., Awaitable[None]],
    ) -> None:
        """Run the job in a slot; turn every failure into `failed` so it never stays running."""
        try:
            async with self._slots:
                try:
                    await job()
                finally:
                    await asyncio.shield(self._clean_up_if_deleted(kind, user_id, ref_id))
        except _Stop:
            log.info("%s %s analysis stopped: replaced or deleted", kind.upper(), ref_id)
        except ExtractorError as e:
            log.warning("%s %s analysis failed: extractor %s", kind.upper(), ref_id, e.code)
            await self._fail(write, NO_TEXT if e.code == "no_text" else FAILED)
        except ValidationError as e:
            # Output not in the schema; the error lists field paths and types, not CV content.
            log.warning(
                "%s %s analysis failed: output not in schema (%d errors)",
                kind.upper(),
                ref_id,
                e.error_count(),
            )
            await self._fail(write, FAILED)
        except Exception as e:
            # Type and stack only: the exception message could quote CV / JD content.
            log.error(
                "%s %s analysis failed unexpectedly: %s\n%s",
                kind.upper(),
                ref_id,
                type(e).__name__,
                "".join(traceback.format_tb(e.__traceback__)),
            )
            await self._fail(write, FAILED)

    async def _fail(self, write: Callable[..., Awaitable[None]], error: AnalysisError) -> None:
        try:
            await write(status="failed", error=error.model_dump(), finished_at=utcnow())
        except _Stop:
            pass
        except Exception:
            # The database itself is failing; the next startup marks the job interrupted.
            log.exception("Could not record the analysis failure")

    async def _clean_up_if_deleted(self, kind: Kind, user_id: str, ref_id: str) -> None:
        """If the CV / JD was deleted (or is being deleted) during the job, remove what the job
        may have written after the deletion passed: a version, its `llm_calls` record."""
        get = cvs.get_cv if kind == "cv" else jds.get_jd
        if await get(self.db, user_id, ref_id) is not None:
            return
        if kind == "cv":
            await cvs.delete_versions(self.db, ref_id)
        else:
            await jds.delete_versions(self.db, ref_id)
        await llm_calls.delete_for_ref(self.db, kind, ref_id)


def _new_attempt(first_step: str, mode: ExtractionMode) -> AnalysisState:
    return AnalysisState(
        status="pending",
        step=first_step,
        mode=mode,
        attempt_id=str(uuid.uuid4()),
        started_at=utcnow(),
    )
