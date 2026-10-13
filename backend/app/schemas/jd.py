"""JD library: API types (docs/design/api.md "JD") and the documents behind them."""

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

JD_TEXT_MAX = 20_000


class Requirement(BaseModel):
    id: Text
    name: Text
    kind: Literal["required", "preferred"]
    importance: Literal[1, 2, 3]
    source_quote: Text | None = None


class JdRequirements(BaseModel):
    requirements: list[Requirement] = Field(default_factory=list, max_length=100)


class JdSummary(BaseModel):
    id: str
    name: str
    company: str | None
    position: str | None
    latest_version: int | None
    analysis_status: AnalysisStatus
    requirement_count: int
    session_count: int
    created_at: datetime
    updated_at: datetime


class JdDetail(JdSummary):
    text: str


class JdVersion(BaseModel):
    jd_id: str
    version: int
    created_at: datetime
    origin: VersionOrigin
    mode: ExtractionMode | None
    requirements: JdRequirements


class JdRecord(BaseModel):
    """A document in `jds`. No original file is kept, only the text (api.md "JD")."""

    id: str
    user_id: str
    name: str
    text: str
    company: str | None = None
    position: str | None = None
    requirement_count: int = 0
    analysis: AnalysisState
    # Copy of max(version) in jd_versions for fast listing; may lag one write behind.
    latest_version: int | None = None
    deleting: bool = False
    created_at: datetime
    updated_at: datetime
    schema_version: int = 1

    def to_summary(self, session_count: int = 0) -> JdSummary:
        return JdSummary(
            id=self.id,
            name=self.name,
            company=self.company,
            position=self.position,
            latest_version=self.latest_version,
            analysis_status=self.analysis.status,
            requirement_count=self.requirement_count,
            session_count=session_count,
            created_at=self.created_at,
            updated_at=self.updated_at,
        )

    def to_detail(self, session_count: int = 0) -> JdDetail:
        return JdDetail(**self.to_summary(session_count).model_dump(), text=self.text)


class JdVersionRecord(BaseModel):
    """A document in `jd_versions`. Immutable: an edit inserts a new version."""

    id: str
    jd_id: str
    user_id: str
    version: int
    origin: VersionOrigin
    mode: ExtractionMode | None = None  # None for user_edit
    requirements: JdRequirements
    # Raw extractor output (JdExtraction) and citations; only on analysis / reanalysis.
    extraction: dict[str, Any] | None = None
    citations: dict[str, Any] | None = None
    extractor: ExtractorInfo | None = None
    created_at: datetime
    schema_version: int = 1

    def to_api(self) -> JdVersion:
        return JdVersion(
            jd_id=self.jd_id,
            version=self.version,
            created_at=self.created_at,
            origin=self.origin,
            mode=self.mode,
            requirements=self.requirements,
        )
