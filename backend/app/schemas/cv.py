"""CV library: API types (docs/design/api.md "CV") and the documents behind them."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.analysis import (
    AnalysisState,
    AnalysisStatus,
    ExtractionMode,
    ExtractorInfo,
    Text,
    VersionOrigin,
)


class Skill(BaseModel):
    id: Text
    name: Text
    years: float | None = None
    source_quote: Text | None = None


class Experience(BaseModel):
    id: Text
    organization: Text
    role: Text
    period: Text
    technologies: list[Text] = Field(default_factory=list, max_length=100)
    source_quote: Text | None = None


class Claim(BaseModel):
    id: Text
    statement: Text
    metric: Text | None = None
    subject: Text | None = None
    verifiable: bool
    source_quote: Text | None = None
    quote_status: Literal["found", "not_found", "user_added"]


class CandidateProfile(BaseModel):
    skills: list[Skill] = Field(default_factory=list, max_length=200)
    experiences: list[Experience] = Field(default_factory=list, max_length=50)
    claims: list[Claim] = Field(default_factory=list, max_length=100)


class CvSummary(BaseModel):
    id: str
    name: str
    file_name: str
    latest_version: int | None
    analysis_status: AnalysisStatus
    session_count: int
    created_at: datetime
    updated_at: datetime


class CvVersion(BaseModel):
    cv_id: str
    version: int
    created_at: datetime
    origin: VersionOrigin
    mode: ExtractionMode | None
    profile: CandidateProfile


class CvRecord(BaseModel):
    """A document in `cvs`. The file itself is in GridFS bucket `cv_files` under `file_id`."""

    id: str
    user_id: str
    name: str
    file_name: str
    file_id: str
    content_type: str
    size: int
    analysis: AnalysisState
    # Copy of max(version) in cv_versions for fast listing; may lag one write behind.
    latest_version: int | None = None
    deleting: bool = False
    created_at: datetime
    updated_at: datetime
    schema_version: int = 1

    def to_summary(self, session_count: int = 0) -> CvSummary:
        return CvSummary(
            id=self.id,
            name=self.name,
            file_name=self.file_name,
            latest_version=self.latest_version,
            analysis_status=self.analysis.status,
            session_count=session_count,
            created_at=self.created_at,
            updated_at=self.updated_at,
        )


class CvVersionRecord(BaseModel):
    """A document in `cv_versions`. Immutable: an edit inserts a new version."""

    id: str
    cv_id: str
    user_id: str
    version: int
    origin: VersionOrigin
    mode: ExtractionMode | None = None  # None for user_edit
    profile: CandidateProfile
    # Raw extractor output (CvExtraction) and citations; only on analysis / reanalysis.
    extraction: dict[str, Any] | None = None
    citations: dict[str, Any] | None = None
    extractor: ExtractorInfo | None = None
    created_at: datetime
    schema_version: int = 1

    def to_api(self) -> CvVersion:
        return CvVersion(
            cv_id=self.cv_id,
            version=self.version,
            created_at=self.created_at,
            origin=self.origin,
            mode=self.mode,
            profile=self.profile,
        )
