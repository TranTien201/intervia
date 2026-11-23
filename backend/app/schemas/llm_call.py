"""`llm_calls`: one record per call to an AI provider, failures included (CLAUDE.md "Hệ thống
agent"), to rerun, compare providers and audit cost. Shared by every AI role."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

LlmRole = Literal[
    "A1_cv_profiler",
    "A2_jd_analyzer",
    "A3_blueprint",
    "A4_intent",
    "A5_turn_planner",
    "A6_speaker",
]


class LlmCallRef(BaseModel):
    """What the call worked on; deleting that object deletes its calls."""

    kind: Literal["cv", "jd", "session"]
    id: str
    attempt_id: str | None = None  # the analysis attempt (`AnalysisState.attempt_id`)


class LlmCallRecord(BaseModel):
    """Fields added with A3–A6 (BE-3.2) have defaults, so A1/A2 records written before them
    still read back; those older records have `schema_version` 1."""

    id: str
    user_id: str
    role: LlmRole
    ref: LlmCallRef
    endpoint: str | None = None  # name in `llm.yaml`; None for A1/A2
    provider: str  # adapter kind for A3–A6, e.g. "openai_compat"
    model: str | None  # model, or extraction plan (tier)
    prompt_version: str
    # Version of the structured output asked for, e.g. "cv-1"; A3–A6: the schema class name,
    # None for a text stream.
    output_schema_version: str | None
    status: Literal["ok", "error", "timeout", "cancelled"]
    error_code: str | None = None
    retries: int = 0  # A3–A6: off-schema outputs sent back to the model
    transient_retries: int = 0  # rate limits, outages, dropped connections (A1/A2: in `retries`)
    latency_ms: int = 0
    first_token_ms: int | None = None  # streams only
    usage: dict[str, float] = Field(default_factory=dict)  # A3–A6: input_tokens, output_tokens
    billing: Literal["per_token", "gpu_time", "free"] | None = None
    est_cost_usd: float | None = None  # only for per_token endpoints with a price set
    # Role-specific call settings, e.g. extraction `mode`, `method`, `fallback`.
    params: dict[str, Any] = Field(default_factory=dict)
    # Same key = same input with the same settings, so a later call may reuse this output.
    reuse_key: str | None = None
    # A3–A6: system + messages as sent (decision D6). Personal data, like `output`.
    input: dict[str, Any] | None = None
    # Parsed object, or {"text": ...} for a stream / an off-schema reply. Personal data:
    # deleted with what `ref` points to.
    output: dict[str, Any] | None = None
    created_at: datetime
    schema_version: int = 2  # shape of this document, as in every collection
