"""Types shared by the CV and JD library: analysis state, versions, size limits.

API types follow docs/design/api.md field by field.
"""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

AnalysisStatus = Literal["pending", "running", "done", "failed"]
ExtractionMode = Literal["standard", "layout", "precise"]
ExtractionMethod = Literal["text", "file"]  # what was sent: text read locally, or the file
VersionOrigin = Literal["analysis", "user_edit", "reanalysis"]
StepStatus = Literal["done", "running", "pending", "failed"]

# Every string in a profile / requirement list; blocks oversized documents from the web.
Text = Annotated[str, Field(max_length=1000)]

NAME_MAX = 120  # CV / JD name in the library


class AnalysisError(BaseModel):
    code: str
    message: str


class AnalysisState(BaseModel):
    """`analysis` sub-document of `cvs` / `jds`: the latest analysis attempt.

    `attempt_id` changes on every (re)analysis; a background job only writes while its
    attempt_id still matches, so a stale job can never overwrite a newer one (BE-4.7).
    `step` is `upload | extract | profile` for CVs, `receive | analyze` for JDs.
    """

    status: AnalysisStatus = "pending"
    step: str
    mode: ExtractionMode = "standard"
    attempt_id: str
    error: AnalysisError | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None


class ExtractorInfo(BaseModel):
    """What produced an analysis version, so it can be re-run and compared.

    The user's `mode` is on the version itself; this is how it actually ran.
    """

    provider: str
    tier: str | None
    schema_version: str
    prompt_version: str
    method: ExtractionMethod
    fallback: bool  # `standard` could not read the text and sent the file instead
    credits: float | None
    llm_call_id: str  # the `llm_calls` record holding the raw output


class VersionInfo(BaseModel):
    """One line of `GET /api/cvs/{id}/versions` (also JD)."""

    version: int
    created_at: datetime
    origin: VersionOrigin


class AnalysisStep(BaseModel):
    key: str
    label: str
    status: StepStatus


class AnalysisProgress(BaseModel):
    status: AnalysisStatus
    steps: list[AnalysisStep]
    error: AnalysisError | None = None
