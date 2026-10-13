"""`jds`, `jd_versions` collections. Same rules as `app/db/cvs.py`, without a stored file:
a JD is kept as text only (pasted, or read from an uploaded file in BE-4.6).
"""

import uuid
from typing import Any

from pymongo import DESCENDING, ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.api.errors import AppError
from app.db.mongo import utcnow
from app.schemas.analysis import AnalysisState, ExtractionMode, VersionInfo
from app.schemas.jd import JdRecord, JdVersionRecord

COLLECTION = "jds"
VERSIONS = "jd_versions"

_LIVE = {"deleting": {"$ne": True}}


async def setup_indexes(db: AsyncDatabase) -> None:
    jds = db[COLLECTION]
    await jds.create_index([("user_id", 1), ("updated_at", DESCENDING)], name="user_updated")
    await jds.create_index("analysis.status", name="analysis_status")
    versions = db[VERSIONS]
    await versions.create_index(
        [("jd_id", 1), ("version", 1)], unique=True, name="jd_version_unique"
    )
    await versions.create_index("user_id", name="user_id")


def _to_record(doc: dict[str, Any]) -> JdRecord:
    return JdRecord(id=doc.pop("_id"), **doc)


def _to_version(doc: dict[str, Any]) -> JdVersionRecord:
    return JdVersionRecord(id=doc.pop("_id"), **doc)


async def create_jd(
    db: AsyncDatabase, user_id: str, name: str, text: str, mode: ExtractionMode = "standard"
) -> JdRecord:
    now = utcnow()
    record = JdRecord(
        id=str(uuid.uuid4()),
        user_id=user_id,
        name=name,
        text=text,
        analysis=AnalysisState(step="receive", mode=mode, attempt_id=str(uuid.uuid4())),
        created_at=now,
        updated_at=now,
    )
    await db[COLLECTION].insert_one({"_id": record.id, **record.model_dump(exclude={"id"})})
    return record


async def get_jd(db: AsyncDatabase, user_id: str, jd_id: str) -> JdRecord | None:
    """The JD if it belongs to this user and is not being deleted."""
    doc = await db[COLLECTION].find_one({"_id": jd_id, "user_id": user_id, **_LIVE})
    return _to_record(doc) if doc else None


async def list_jds(db: AsyncDatabase, user_id: str) -> list[JdRecord]:
    cursor = db[COLLECTION].find({"user_id": user_id, **_LIVE}).sort("updated_at", DESCENDING)
    return [_to_record(doc) async for doc in cursor]


async def rename_jd(db: AsyncDatabase, user_id: str, jd_id: str, name: str) -> JdRecord | None:
    doc = await db[COLLECTION].find_one_and_update(
        {"_id": jd_id, "user_id": user_id, **_LIVE},
        {"$set": {"name": name, "updated_at": utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    return _to_record(doc) if doc else None


async def latest_version(db: AsyncDatabase, jd_id: str) -> int | None:
    """max(version) read from jd_versions (not the `jds.latest_version` copy)."""
    doc = await db[VERSIONS].find_one(
        {"jd_id": jd_id}, {"version": 1}, sort=[("version", DESCENDING)]
    )
    return doc["version"] if doc else None


async def insert_version(db: AsyncDatabase, record: JdVersionRecord) -> None:
    """Insert a version, then copy its version number and requirement count to `jds`.

    The copy only moves forward (like `$max`): it is skipped when `jds` already shows the same
    or a newer version. Duplicate (jd_id, version) → `version_conflict` (409).
    """
    doc = {"_id": record.id, **record.model_dump(exclude={"id"})}
    try:
        await db[VERSIONS].insert_one(doc)
    except DuplicateKeyError:
        raise AppError(
            "version_conflict", 409, "Yêu cầu JD đã được sửa ở nơi khác, hãy tải lại."
        ) from None
    await db[COLLECTION].update_one(
        {
            "_id": record.jd_id,
            "$or": [{"latest_version": None}, {"latest_version": {"$lt": record.version}}],
        },
        {
            "$set": {
                "latest_version": record.version,
                "requirement_count": len(record.requirements.requirements),
                "updated_at": utcnow(),
            }
        },
    )


async def get_version(
    db: AsyncDatabase, user_id: str, jd_id: str, version: int
) -> JdVersionRecord | None:
    doc = await db[VERSIONS].find_one({"jd_id": jd_id, "user_id": user_id, "version": version})
    return _to_version(doc) if doc else None


async def list_versions(db: AsyncDatabase, user_id: str, jd_id: str) -> list[VersionInfo]:
    """Newest first."""
    cursor = (
        db[VERSIONS]
        .find(
            {"jd_id": jd_id, "user_id": user_id},
            {"version": 1, "created_at": 1, "origin": 1},
        )
        .sort("version", DESCENDING)
    )
    return [VersionInfo(**doc) async for doc in cursor]


async def set_analysis(db: AsyncDatabase, jd_id: str, attempt_id: str, **fields: Any) -> bool:
    """Update `analysis.<field>` only while `attempt_id` is still the current attempt."""
    result = await db[COLLECTION].update_one(
        {"_id": jd_id, "analysis.attempt_id": attempt_id},
        {"$set": {f"analysis.{key}": value for key, value in fields.items()}},
    )
    return result.matched_count == 1


# ---- Deletion steps, in order (see domain.library.delete_jd) ----


async def mark_deleting(db: AsyncDatabase, user_id: str, jd_id: str) -> JdRecord | None:
    """Step 1. Also finds a JD already marked, so an interrupted deletion can be resumed."""
    doc = await db[COLLECTION].find_one_and_update(
        {"_id": jd_id, "user_id": user_id},
        {"$set": {"deleting": True}},
        return_document=ReturnDocument.AFTER,
    )
    return _to_record(doc) if doc else None


async def delete_versions(db: AsyncDatabase, jd_id: str) -> None:
    await db[VERSIONS].delete_many({"jd_id": jd_id})


async def delete_jd_document(db: AsyncDatabase, jd_id: str) -> None:
    await db[COLLECTION].delete_one({"_id": jd_id})
