"""Run one CV / JD extraction: turn the user's mode into a provider call, reuse an identical
earlier extraction, record the call in `llm_calls` (docs/design/extraction.md section 8).

Returns the provider's raw output; turning it into a profile / requirement list is the
caller's job (BE-4.5, BE-4.6).
"""

import asyncio
import hashlib
import uuid
from dataclasses import dataclass
from functools import cache
from typing import Any

from pydantic import BaseModel
from pymongo.asynchronous.database import AsyncDatabase

from app.db import llm_calls
from app.db.mongo import utcnow
from app.documents import read_text
from app.prompts import Prompt, load_prompt
from app.providers.extract.base import (
    DocumentExtractor,
    ExtractionResult,
    ExtractorError,
    Quality,
)
from app.schemas.analysis import ExtractionMethod, ExtractionMode, ExtractorInfo
from app.schemas.extraction import (
    CV_SCHEMA_VERSION,
    JD_SCHEMA_VERSION,
    cv_json_schema,
    jd_json_schema,
)
from app.schemas.llm_call import LlmCallRecord, LlmCallRef, LlmRole


@dataclass(frozen=True)
class ExtractionTask:
    """What is extracted: the same for every mode, so results compare across modes."""

    role: LlmRole
    prompt: Prompt
    schema: dict[str, Any]
    schema_version: str


@cache
def cv_task() -> ExtractionTask:
    return ExtractionTask(
        "A1_cv_profiler", load_prompt("cv_extract"), cv_json_schema(), CV_SCHEMA_VERSION
    )


@cache
def jd_task() -> ExtractionTask:
    return ExtractionTask(
        "A2_jd_analyzer", load_prompt("jd_extract"), jd_json_schema(), JD_SCHEMA_VERSION
    )


@dataclass(frozen=True)
class ExtractionPlan:
    method: ExtractionMethod
    quality: Quality
    text: str | None  # what is sent when method == "text"
    fallback: bool = False


def _quality(mode: ExtractionMode) -> Quality:
    return "high" if mode == "precise" else "economy"


async def plan_file(mode: ExtractionMode, content: bytes, content_type: str) -> ExtractionPlan:
    """CV: `standard` sends the text read locally, or the file when it cannot be read;
    `layout` and `precise` send the file."""
    if mode != "standard":
        return ExtractionPlan("file", _quality(mode), text=None)
    document = await asyncio.to_thread(read_text, content, content_type)
    if document.looks_readable:
        return ExtractionPlan("text", "economy", text=document.text)
    return ExtractionPlan("file", "economy", text=None, fallback=True)


def plan_text(mode: ExtractionMode, text: str) -> ExtractionPlan:
    """JD: always text (pasted, or read from the file on upload), so no `layout`."""
    if mode == "layout":
        raise ValueError("`layout` reads a file's layout; a JD is text")
    return ExtractionPlan("text", _quality(mode), text=text)


class ExtractionOutcome(BaseModel):
    result: ExtractionResult
    call: LlmCallRecord  # this run's `llm_calls` record
    method: ExtractionMethod
    fallback: bool
    reused: bool  # output copied from an earlier identical extraction, no provider call

    def extractor_info(self) -> ExtractorInfo:
        return ExtractorInfo(
            provider=self.call.provider,
            tier=self.call.model,
            schema_version=self.call.output_schema_version,
            prompt_version=self.call.prompt_version,
            method=self.method,
            fallback=self.fallback,
            credits=self.call.usage.get("credits"),
            llm_call_id=self.call.id,
        )


async def extract_cv(
    db: AsyncDatabase,
    extractor: DocumentExtractor,
    *,
    user_id: str,
    cv_id: str,
    attempt_id: str,
    mode: ExtractionMode,
    filename: str,
    content: bytes,
    content_type: str,
) -> ExtractionOutcome:
    """Raises `ExtractorError` (recorded in `llm_calls` first)."""
    return await _run(
        db,
        extractor,
        cv_task(),
        user_id=user_id,
        ref=LlmCallRef(kind="cv", id=cv_id, attempt_id=attempt_id),
        mode=mode,
        plan=await plan_file(mode, content, content_type),
        filename=filename,
        content=content,
    )


async def extract_jd(
    db: AsyncDatabase,
    extractor: DocumentExtractor,
    *,
    user_id: str,
    jd_id: str,
    attempt_id: str,
    mode: ExtractionMode,
    text: str,
) -> ExtractionOutcome:
    """Raises `ExtractorError` (recorded in `llm_calls` first)."""
    return await _run(
        db,
        extractor,
        jd_task(),
        user_id=user_id,
        ref=LlmCallRef(kind="jd", id=jd_id, attempt_id=attempt_id),
        mode=mode,
        plan=plan_text(mode, text),
        filename="jd.txt",
        content=text.encode(),
    )


def _reuse_key(
    content: bytes, task: ExtractionTask, mode: ExtractionMode, tier: str | None, provider: str
) -> str:
    """Same document, same mode and same settings → same key (and the same result)."""
    settings = f"{task.role}|{mode}|{task.prompt.version}|{task.schema_version}|{provider}|{tier}"
    digest = hashlib.sha256(content).hexdigest()
    return hashlib.sha256(f"{settings}|{digest}".encode()).hexdigest()


async def _run(
    db: AsyncDatabase,
    extractor: DocumentExtractor,
    task: ExtractionTask,
    *,
    user_id: str,
    ref: LlmCallRef,
    mode: ExtractionMode,
    plan: ExtractionPlan,
    filename: str,
    content: bytes,
) -> ExtractionOutcome:
    tier = extractor.tier_for(plan.quality)
    key = _reuse_key(content, task, mode, tier, extractor.name)
    call = LlmCallRecord(
        id=str(uuid.uuid4()),
        user_id=user_id,
        role=task.role,
        ref=ref,
        provider=extractor.name,
        model=tier,
        prompt_version=task.prompt.version,
        output_schema_version=task.schema_version,
        status="ok",
        params={"mode": mode, "method": plan.method, "fallback": plan.fallback},
        reuse_key=key,
        created_at=utcnow(),
    )

    earlier = await llm_calls.find_reusable(db, user_id, task.role, key)
    if earlier is not None and earlier.output is not None:
        # Its own record, so the output stays when the earlier CV / JD is deleted.
        call = call.model_copy(
            update={"output": earlier.output, "params": {**call.params, "reused_from": earlier.id}}
        )
        await llm_calls.insert_call(db, call)
        result = ExtractionResult.model_validate(earlier.output)
        return ExtractionOutcome(
            result=result, call=call, method=plan.method, fallback=plan.fallback, reused=True
        )

    try:
        result = await extractor.extract(
            text=plan.text,
            content=content if plan.method == "file" else None,
            filename=filename,
            quality=plan.quality,
            schema=task.schema,
            system_prompt=task.prompt.text,
        )
    except ExtractorError as e:
        failed = call.model_copy(
            update={"status": "error", "error_code": e.code, "retries": e.retries}
        )
        await llm_calls.insert_call(db, failed)
        raise
    call = call.model_copy(
        update={
            "retries": result.retries,
            "latency_ms": result.latency_ms,
            "usage": result.usage,
            "output": result.model_dump(),
        }
    )
    await llm_calls.insert_call(db, call)
    return ExtractionOutcome(
        result=result, call=call, method=plan.method, fallback=plan.fallback, reused=False
    )
