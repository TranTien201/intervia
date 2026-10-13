"""Saving a user-edited profile / requirement list as a new immutable version.

The server does not trust what the web sends: ids must be unique, and a quote only keeps its
"found in the document" status when the exact same quote was already in the base version
(so a user cannot mark their own sentence as coming from the CV).
"""

import uuid
from typing import Literal

from pymongo.asynchronous.database import AsyncDatabase

from app.api.errors import AppError
from app.db import cvs, jds
from app.db.mongo import utcnow
from app.schemas.analysis import NAME_MAX
from app.schemas.cv import CandidateProfile, Claim, CvVersionRecord
from app.schemas.jd import JdRequirements, JdVersionRecord, Requirement

_INVALID = "Dữ liệu chưa hợp lệ."


def _check_unique_ids(ids: list[str], field: str, fields: dict[str, str]) -> None:
    if len(ids) != len(set(ids)):
        fields[field] = "Có mục bị trùng id."


def check_profile(profile: CandidateProfile, base: CandidateProfile) -> CandidateProfile:
    fields: dict[str, str] = {}
    _check_unique_ids([x.id for x in profile.skills], "profile.skills", fields)
    _check_unique_ids([x.id for x in profile.experiences], "profile.experiences", fields)
    _check_unique_ids([x.id for x in profile.claims], "profile.claims", fields)
    if fields:
        raise AppError("validation_error", 422, _INVALID, fields)

    base_status = {
        c.source_quote: c.quote_status
        for c in base.claims
        if c.source_quote is not None and c.quote_status != "user_added"
    }

    def fix(claim: Claim) -> Claim:
        status = base_status.get(claim.source_quote) if claim.source_quote else None
        if status is None:
            return claim.model_copy(update={"quote_status": "user_added", "source_quote": None})
        return claim.model_copy(update={"quote_status": status})

    return profile.model_copy(update={"claims": [fix(c) for c in profile.claims]})


def check_requirements(reqs: JdRequirements, base: JdRequirements) -> JdRequirements:
    fields: dict[str, str] = {}
    _check_unique_ids([x.id for x in reqs.requirements], "requirements", fields)
    cleaned: list[Requirement] = []
    for req in reqs.requirements:
        name = req.name.strip()
        if not 1 <= len(name) <= NAME_MAX:
            fields["requirements"] = f"Tên yêu cầu phải dài từ 1 đến {NAME_MAX} ký tự."
        cleaned.append(req.model_copy(update={"name": name}))
    if fields:
        raise AppError("validation_error", 422, _INVALID, fields)

    # Same rule as claim quotes: a quote is kept only if the analysis had it.
    base_quotes = {r.source_quote for r in base.requirements if r.source_quote is not None}
    cleaned = [
        r if r.source_quote in base_quotes else r.model_copy(update={"source_quote": None})
        for r in cleaned
    ]
    return JdRequirements(requirements=cleaned)


def _conflict(what: str) -> AppError:
    return AppError("version_conflict", 409, f"{what} đã được sửa ở nơi khác, hãy tải lại.")


async def save_cv_version(
    db: AsyncDatabase, user_id: str, cv_id: str, base_version: int, profile: CandidateProfile
) -> CvVersionRecord:
    """Insert `base_version + 1`. The caller has checked the CV exists for this user.

    Order: read latest → check → insert (unique index decides a race) → `cvs` copy updated by
    `insert_version`.
    """
    latest = await cvs.latest_version(db, cv_id)
    if latest is None or base_version != latest:
        raise _conflict("Hồ sơ")
    base = await cvs.get_version(db, user_id, cv_id, latest)
    if base is None:
        raise _conflict("Hồ sơ")
    record = CvVersionRecord(
        id=str(uuid.uuid4()),
        cv_id=cv_id,
        user_id=user_id,
        version=latest + 1,
        origin="user_edit",
        profile=check_profile(profile, base.profile),
        created_at=utcnow(),
    )
    await cvs.insert_version(db, record)
    return record


async def save_jd_version(
    db: AsyncDatabase, user_id: str, jd_id: str, base_version: int, requirements: JdRequirements
) -> JdVersionRecord:
    """Same as `save_cv_version`, for a JD's requirement list."""
    latest = await jds.latest_version(db, jd_id)
    if latest is None or base_version != latest:
        raise _conflict("Yêu cầu JD")
    base = await jds.get_version(db, user_id, jd_id, latest)
    if base is None:
        raise _conflict("Yêu cầu JD")
    record = JdVersionRecord(
        id=str(uuid.uuid4()),
        jd_id=jd_id,
        user_id=user_id,
        version=latest + 1,
        origin="user_edit",
        requirements=check_requirements(requirements, base.requirements),
        created_at=utcnow(),
    )
    await jds.insert_version(db, record)
    return record


def parse_version(raw: str) -> int | Literal["latest"] | None:
    """Path value `{v}`: an integer >= 1 or `latest`. None if neither."""
    if raw == "latest":
        return "latest"
    return int(raw) if raw.isdigit() and int(raw) >= 1 else None
