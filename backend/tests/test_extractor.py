"""LlamaCloud adapter against a fake LlamaCloud HTTP API (the real SDK, no network), plus the
fake adapter and settings. One opt-in test calls the real service."""

import json
import os
from dataclasses import dataclass, field
from typing import Any

import httpx
import pytest
from pydantic import ValidationError

from app.config import Settings
from app.domain.extraction import jd_task
from app.providers.extract import create_extractor
from app.providers.extract.base import Citation, ExtractorError
from app.providers.extract.fake import FakeExtractor
from app.providers.extract.llamacloud import LlamaCloudExtractor, to_citations

NOW = "2026-10-13T00:00:00Z"
DATA = {"company": "XYZ", "requirements": [{"name": "Python"}]}
SCHEMA = {"type": "object", "properties": {"company": {"type": "string"}}}

# Shape of `extract_metadata.field_metadata.document_metadata` seen in spike BE-4.3.
CITATION_TREE = {
    "company": {"citation": [{"page": 1, "matching_text": "XYZ"}]},
    "requirements": [
        {"name": {"citation": [{"page": 2, "matching_text": "Python"}]}},
        {"name": {"citation": [{"page": 2}]}},  # no text: dropped
    ],
}


@dataclass
class FakeLlamaCloud:
    """Answers the endpoints the adapter uses. `extract_errors`: HTTP statuses returned by the
    next job creations, in order. Everything created and deleted is recorded."""

    extract_errors: list[int] = field(default_factory=list)
    job_status: str = "COMPLETED"
    result: dict[str, Any] | None = field(default_factory=lambda: DATA)
    parse_job: bool = False
    parsed_text: str = "Công ty XYZ\nYêu cầu: Python"
    uploads: list[tuple[str, str]] = field(default_factory=list)  # (file name, content type)
    jobs_created: list[dict[str, Any]] = field(default_factory=list)
    deleted: list[str] = field(default_factory=list)

    def handle(self, request: httpx.Request) -> httpx.Response:
        method, path = request.method, request.url.path
        if method == "DELETE":
            self.deleted.append(path)
            return httpx.Response(200, json={})
        if (method, path) == ("POST", "/api/v1/beta/files"):
            self.uploads.append(_uploaded_file(request))
            return httpx.Response(200, json={"id": "file-1", "name": "f", "project_id": "p"})
        if (method, path) == ("POST", "/api/v2/extract"):
            if self.extract_errors:
                return httpx.Response(self.extract_errors.pop(0), json={"detail": "error"})
            self.jobs_created.append(json.loads(request.content))
            return httpx.Response(200, json=self._job("PENDING"))
        if (method, path) == ("GET", "/api/v2/extract/job-1"):
            return httpx.Response(200, json=self._job(self.job_status, done=True))
        if (method, path) == ("GET", "/api/v2/parse/parse-1"):
            pages = [{"page_number": 1, "text": self.parsed_text}]
            job = {"id": "parse-1", "project_id": "p", "status": "COMPLETED"}
            return httpx.Response(200, json={"job": job, "text": {"pages": pages}})
        return httpx.Response(404, json={"detail": f"unexpected {method} {path}"})

    def _job(self, status: str, done: bool = False) -> dict[str, Any]:
        job: dict[str, Any] = {
            "id": "job-1",
            "status": status,
            "file_input": "file-1",
            "project_id": "p",
            "created_at": NOW,
            "updated_at": NOW,
        }
        if done and status == "COMPLETED":
            job["extract_result"] = self.result
            job["usage"] = {"credits": 25, "extract_credits": 25, "parse_credits": None}
            job["extract_metadata"] = {
                "field_metadata": {"document_metadata": CITATION_TREE},
                "parse_job_id": "parse-1" if self.parse_job else None,
            }
        return job


def _uploaded_file(request: httpx.Request) -> tuple[str, str]:
    """(file name, content type) of the multipart `file` part."""
    part = next(p for p in request.content.split(b"--") if b'name="file"' in p)
    headers = part.split(b"\r\n\r\n", 1)[0].decode()
    name = headers.split('filename="', 1)[1].split('"', 1)[0]
    content_type = (
        headers.split("Content-Type: ", 1)[1].strip() if "Content-Type" in headers else ""
    )
    return name, content_type


def make_extractor(server: FakeLlamaCloud, timeout_s: float = 5) -> LlamaCloudExtractor:
    return LlamaCloudExtractor(
        api_key="test-key",
        tiers={"economy": "cost_effective", "high": "agentic"},
        max_pages=6,
        timeout_s=timeout_s,
        poll_interval_s=0,
        retry_delays_s=(0, 0),
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(server.handle)),
    )


async def extract_text(extractor: LlamaCloudExtractor, quality: str = "economy"):
    return await extractor.extract(
        text="Công ty XYZ\nYêu cầu: Python",
        filename="jd.pdf",
        quality=quality,  # type: ignore[arg-type]
        schema=SCHEMA,
        system_prompt="Extract.",
    )


async def test_text_is_sent_as_txt_with_the_configured_plan():
    server = FakeLlamaCloud()
    result = await extract_text(make_extractor(server))

    assert server.uploads == [("jd.txt", "text/plain")]
    config = server.jobs_created[0]["configuration"]
    assert config["tier"] == "cost_effective"
    assert config["disable_cache"] is True
    assert config["max_pages"] == 6
    assert config["system_prompt"] == "Extract."
    assert result.data == DATA
    assert result.document_text == "Công ty XYZ\nYêu cầu: Python"  # the text sent
    assert result.tier == "cost_effective"
    assert result.usage == {"credits": 25.0, "extract_credits": 25.0}
    assert result.retries == 0
    # Personal data: the job and the file are deleted on LlamaCloud.
    assert sorted(server.deleted) == ["/api/v1/beta/files/file-1", "/api/v2/extract/job-1"]


async def test_file_uses_the_parsed_text_and_deletes_the_parse_job():
    server = FakeLlamaCloud(parse_job=True)
    result = await make_extractor(server).extract(
        content=b"%PDF-1.7 ...",
        filename="cv.pdf",
        quality="high",
        schema=SCHEMA,
        system_prompt="Extract.",
    )
    assert server.uploads[0][0] == "cv.pdf"
    assert server.jobs_created[0]["configuration"]["tier"] == "agentic"
    assert result.document_text == server.parsed_text
    assert "/api/v2/parse/parse-1" in server.deleted


async def test_file_with_no_text_is_no_text():
    server = FakeLlamaCloud(parse_job=True, parsed_text="  \n ")
    with pytest.raises(ExtractorError) as error:
        await make_extractor(server).extract(
            content=b"%PDF", filename="scan.pdf", quality="economy", schema={}, system_prompt=""
        )
    assert error.value.code == "no_text"
    assert len(server.deleted) == 3  # cleaned up on failure too


async def test_two_server_errors_then_success():
    server = FakeLlamaCloud(extract_errors=[503, 500])
    result = await extract_text(make_extractor(server))
    assert result.data == DATA
    assert result.retries == 2
    assert len(server.uploads) == 3  # each attempt starts over
    assert server.deleted.count("/api/v1/beta/files/file-1") == 3


async def test_rate_limit_is_retried():
    server = FakeLlamaCloud(extract_errors=[429])
    assert (await extract_text(make_extractor(server))).retries == 1


async def test_three_server_errors_give_provider_error():
    server = FakeLlamaCloud(extract_errors=[500, 502, 503])
    with pytest.raises(ExtractorError) as error:
        await extract_text(make_extractor(server))
    assert error.value.code == "provider_error"
    assert error.value.retries == 2


async def test_client_error_is_not_retried():
    server = FakeLlamaCloud(extract_errors=[400])
    with pytest.raises(ExtractorError) as error:
        await extract_text(make_extractor(server))
    assert error.value.code == "provider_error"
    assert error.value.retries == 0
    assert len(server.uploads) == 1


async def test_failed_job_is_not_retried():
    server = FakeLlamaCloud(job_status="FAILED")
    with pytest.raises(ExtractorError) as error:
        await extract_text(make_extractor(server))
    assert error.value.code == "provider_error"
    assert len(server.uploads) == 1


async def test_job_that_never_finishes_times_out():
    server = FakeLlamaCloud(job_status="RUNNING")
    with pytest.raises(ExtractorError) as error:
        await extract_text(make_extractor(server, timeout_s=0.05))
    assert error.value.code == "timeout"
    assert error.value.retries == 2
    assert server.deleted.count("/api/v2/extract/job-1") == 3


def test_citations_are_flattened_to_field_paths():
    assert to_citations(CITATION_TREE) == {
        "company": [Citation(page=1, text="XYZ")],
        "requirements[0].name": [Citation(page=2, text="Python")],
    }
    assert to_citations(None) == {}


async def test_exactly_one_input_is_required():
    extractor = make_extractor(FakeLlamaCloud())
    with pytest.raises(ValueError):
        await extractor.extract(
            text="a", content=b"a", filename="x", quality="economy", schema={}, system_prompt=""
        )


def test_llamacloud_without_key_does_not_start():
    with pytest.raises(ValidationError, match="LLAMA_CLOUD_API_KEY"):
        Settings(extractor_provider="llamacloud", llama_cloud_api_key=None)


def test_settings_pick_the_adapter():
    assert isinstance(create_extractor(Settings(extractor_provider="fake")), FakeExtractor)
    extractor = create_extractor(
        Settings(extractor_provider="llamacloud", llama_cloud_api_key="k", llama_tier_high="x")
    )
    assert isinstance(extractor, LlamaCloudExtractor)
    assert extractor.tier_for("high") == "x"


async def test_fake_answers_cv_or_jd_from_the_schema():
    fake = FakeExtractor()
    jd = await fake.extract(
        text="JD", filename="jd.txt", quality="economy", schema=jd_task().schema, system_prompt=""
    )
    assert jd.data["company"] == "Công ty XYZ"
    assert jd.document_text == "JD"  # echoes the text sent
    cv = await fake.extract(
        content=b"%PDF",
        filename="cv.pdf",
        quality="high",
        schema={"properties": {"skills": {}}},
        system_prompt="",
    )
    assert cv.data["skills"]
    assert "Python" in (cv.document_text or "")
    assert [c.quality for c in fake.calls] == ["economy", "high"]


@pytest.mark.llamacloud
@pytest.mark.skipif(
    os.environ.get("RUN_LLAMACLOUD_TESTS") != "1", reason="costs credits: RUN_LLAMACLOUD_TESTS=1"
)
async def test_real_llamacloud_extracts_a_short_jd():
    settings = Settings(extractor_provider="llamacloud")  # key from backend/.env
    extractor = create_extractor(settings)
    task = jd_task()
    try:
        result = await extractor.extract(
            text="Công ty XYZ tuyển Backend Engineer.\nYêu cầu:\n- Thành thạo Python",
            filename="jd.txt",
            quality="economy",
            schema=task.schema,
            system_prompt=task.prompt.text,
        )
    finally:
        await extractor.aclose()
    assert any("Python" in r["name"] for r in result.data["requirements"])
    assert result.usage.get("credits")
