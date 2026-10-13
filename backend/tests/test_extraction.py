"""domain.extraction: mode → provider call, reuse of identical extractions, `llm_calls`."""

import pytest

from app.db import llm_calls
from app.domain.extraction import ExtractionPlan, extract_cv, extract_jd, plan_file, plan_text
from app.domain.files import DOCX, PDF
from app.providers.extract.base import ExtractorError
from app.providers.extract.fake import FakeExtractor
from tests.samples import LINE, make_docx

READABLE_DOCX = make_docx([LINE] * 3)
SCANNED_PDF = b"%PDF-1.7 image only"  # pypdf reads no text from it


async def test_plans_for_each_mode():
    standard = await plan_file("standard", READABLE_DOCX, DOCX)
    assert (standard.method, standard.quality, standard.fallback) == ("text", "economy", False)
    assert LINE in (standard.text or "")

    assert await plan_file("standard", SCANNED_PDF, PDF) == ExtractionPlan(
        "file", "economy", text=None, fallback=True
    )
    assert await plan_file("layout", READABLE_DOCX, DOCX) == ExtractionPlan(
        "file", "economy", text=None
    )
    assert await plan_file("precise", READABLE_DOCX, DOCX) == ExtractionPlan(
        "file", "high", text=None
    )
    assert plan_text("standard", "JD") == ExtractionPlan("text", "economy", text="JD")
    assert plan_text("precise", "JD") == ExtractionPlan("text", "high", text="JD")
    with pytest.raises(ValueError):
        plan_text("layout", "JD")


async def _extract_cv(db, extractor, *, user_id="u1", cv_id="cv1", mode="standard", content=None):
    return await extract_cv(
        db,
        extractor,
        user_id=user_id,
        cv_id=cv_id,
        attempt_id="a1",
        mode=mode,
        filename="cv.docx",
        content=content or READABLE_DOCX,
        content_type=DOCX,
    )


async def test_cv_sends_text_and_records_the_call(db):
    fake = FakeExtractor()
    outcome = await _extract_cv(db, fake)

    assert fake.calls[0].content is None and LINE in (fake.calls[0].text or "")
    assert outcome.method == "text" and not outcome.reused
    assert outcome.result.data["skills"]

    stored = await db.llm_calls.find_one({"_id": outcome.call.id})
    assert stored["role"] == "A1_cv_profiler"
    assert stored["ref"] == {"kind": "cv", "id": "cv1", "attempt_id": "a1"}
    assert stored["status"] == "ok"
    assert stored["prompt_version"] == "cv_extract_v1"
    assert stored["output_schema_version"] == "cv-1"
    assert stored["params"] == {"mode": "standard", "method": "text", "fallback": False}
    assert stored["output"]["data"] == outcome.result.data

    info = outcome.extractor_info()
    assert (info.method, info.fallback, info.llm_call_id) == ("text", False, outcome.call.id)


async def test_unreadable_cv_falls_back_to_the_file(db):
    fake = FakeExtractor()
    outcome = await _extract_cv(db, fake, content=SCANNED_PDF)
    assert fake.calls[0].content == SCANNED_PDF and fake.calls[0].text is None
    assert (outcome.method, outcome.fallback) == ("file", True)


async def test_same_file_and_mode_is_not_extracted_again(db):
    fake = FakeExtractor()
    first = await _extract_cv(db, fake, cv_id="cv1")
    second = await _extract_cv(db, fake, cv_id="cv2")

    assert len(fake.calls) == 1
    assert second.reused
    assert second.result == first.result
    # Its own record, pointing at the new CV, so deleting cv1 does not lose it.
    assert second.call.ref.id == "cv2"
    assert second.call.params["reused_from"] == first.call.id
    await llm_calls.delete_for_ref(db, "cv", "cv1")
    assert await llm_calls.find_reusable(db, "u1", "A1_cv_profiler", first.call.reuse_key or "")


async def test_reuse_needs_same_mode_and_same_user(db):
    fake = FakeExtractor()
    await _extract_cv(db, fake)
    await _extract_cv(db, fake, mode="precise")  # other mode
    await _extract_cv(db, fake, user_id="u2")  # other user: never shares outputs
    assert len(fake.calls) == 3


async def test_failure_is_recorded_and_raised(db):
    fake = FakeExtractor(error=ExtractorError("timeout", retries=2))
    with pytest.raises(ExtractorError):
        await _extract_cv(db, fake)
    stored = await db.llm_calls.find_one({"ref.id": "cv1"})
    assert (stored["status"], stored["error_code"], stored["retries"]) == ("error", "timeout", 2)
    assert stored["output"] is None

    # A failed call is never reused: the next run calls the provider again.
    fake.error = None
    assert not (await _extract_cv(db, fake)).reused


async def test_jd_is_always_text(db):
    fake = FakeExtractor()
    outcome = await extract_jd(
        db, fake, user_id="u1", jd_id="jd1", attempt_id="a1", mode="precise", text="JD text"
    )
    assert (fake.calls[0].text, fake.calls[0].quality) == ("JD text", "high")
    assert outcome.call.role == "A2_jd_analyzer"
    assert outcome.call.ref.kind == "jd"
