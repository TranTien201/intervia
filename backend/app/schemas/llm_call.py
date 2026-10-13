"""`llm_calls`: one record per call to an AI provider, failures included (CLAUDE.md "Hệ thống
agent"), to rerun, compare providers and audit cost. Shared by every AI role."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

LlmRole = Literal["A1_cv_profiler", "A2_jd_analyzer"]


class LlmCallRef(BaseModel):
    """What the call worked on; deleting that object deletes its calls."""

    kind: Literal["cv", "jd"]
    id: str
    attempt_id: str | None = None  # the analysis attempt (`AnalysisState.attempt_id`)


class LlmCallRecord(BaseModel):
    id: str
    user_id: str
    role: LlmRole
    ref: LlmCallRef
    provider: str
    model: str | None  # model, or extraction plan (tier)
    prompt_version: str
    output_schema_version: str  # version of the structured output asked for, e.g. "cv-1"
    status: Literal["ok", "error"]
    error_code: str | None = None
    retries: int = 0
    latency_ms: int = 0
    usage: dict[str, float] = Field(default_factory=dict)
    # Role-specific call settings, e.g. extraction `mode`, `method`, `fallback`.
    params: dict[str, Any] = Field(default_factory=dict)
    # Same key = same input with the same settings, so a later call may reuse this output.
    reuse_key: str | None = None
    output: dict[str, Any] | None = None  # personal data: deleted with its CV / JD
    created_at: datetime
    schema_version: int = 1  # shape of this document, as in every collection
