"""`cvs`, `cv_versions` collections and GridFS bucket `cv_files`.

- `cvs`: one document per CV in the library. `deleting = true` hides it from every read while
  `domain.library.delete_cv` removes its data (no transactions, so deletion is re-runnable).
- `cv_versions`: immutable profile versions. The source of truth for the latest version is
  max(version) here; `cvs.latest_version` is a copy for listing, raised after each insert, so
  it may lag one write behind after a crash and is fixed by the next insert.
- `cv_files`: the uploaded file, `_id` = `cvs.file_id`, metadata `{user_id, cv_id}`.
"""

import uuid
from typing import Any

from gridfs import AsyncGridFSBucket, NoFile
from gridfs.asynchronous.grid_file import AsyncGridOut
from pymongo import DESCENDING, ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.api.errors import AppError
from app.db.mongo import utcnow
from app.schemas.analysis import AnalysisState, ExtractionMode, VersionInfo
from app.schemas.cv import CvRecord, CvVersionRecord

COLLECTION = "cvs"
VERSIONS = "cv_versions"
BUCKET = "cv_files"

_LIVE = {"deleting": {"$ne": True}}


async def setup_indexes(db: AsyncDatabase) -> None:
    cvs = db[COLLECTION]
    await cvs.create_index([("user_id", 1), ("updated_at", DESCENDING)], name="user_updated")
    # Restart recovery looks up unfinished analyses (BE-4.7).
    await cvs.create_index("analysis.status", name="analysis_status")
    versions = db[VERSIONS]
    await versions.create_index(
        [("cv_id", 1), ("version", 1)], unique=True, name="cv_version_unique"
    )
    await versions.create_index("user_id", name="user_id")


def _bucket(db: AsyncDatabase) -> AsyncGridFSBucket:
    return AsyncGridFSBucket(db, bucket_name=BUCKET)


def _to_record(doc: dict[str, Any]) -> CvRecord:
    return CvRecord(id=doc.pop("_id"), **doc)


def _to_version(doc: dict[str, Any]) -> CvVersionRecord:
    return CvVersionRecord(id=doc.pop("_id"), **doc)


async def create_cv(
    db: AsyncDatabase,
    user_id: str,
    name: str,
    file_name: str,
    content_type: str,
    data: bytes,
    mode: ExtractionMode = "standard",
) -> CvRecord:
    """Store the file, then the `cvs` document (analysis pending).

    A crash between the two steps leaves an orphan file in GridFS, with no document pointing
    to it; accepted, cleaned up by user data cleanup (BE-8) via its metadata.
    """
    cv_id = str(uuid.uuid4())
    file_id = str(uuid.uuid4())
    await _bucket(db).upload_from_stream_with_id(
        file_id, file_name, data, metadata={"user_id": user_id, "cv_id": cv_id}
    )
    now = utcnow()
    record = CvRecord(
        id=cv_id,
        user_id=user_id,
        name=name,
        file_name=file_name,
        file_id=file_id,
        content_type=content_type,
        size=len(data),
        analysis=AnalysisState(step="upload", mode=mode, attempt_id=str(uuid.uuid4())),
        created_at=now,
        updated_at=now,
    )
    await db[COLLECTION].insert_one({"_id": record.id, **record.model_dump(exclude={"id"})})
    return record


async def get_cv(db: AsyncDatabase, user_id: str, cv_id: str) -> CvRecord | None:
    """The CV if it belongs to this user and is not being deleted."""
    doc = await db[COLLECTION].find_one({"_id": cv_id, "user_id": user_id, **_LIVE})
    return _to_record(doc) if doc else None


async def list_cvs(db: AsyncDatabase, user_id: str) -> list[CvRecord]:
    cursor = db[COLLECTION].find({"user_id": user_id, **_LIVE}).sort("updated_at", DESCENDING)
    return [_to_record(doc) async for doc in cursor]


async def rename_cv(db: AsyncDatabase, user_id: str, cv_id: str, name: str) -> CvRecord | None:
    doc = await db[COLLECTION].find_one_and_update(
        {"_id": cv_id, "user_id": user_id, **_LIVE},
        {"$set": {"name": name, "updated_at": utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    return _to_record(doc) if doc else None


async def open_file(db: AsyncDatabase, file_id: str) -> AsyncGridOut:
    """Stream the stored file. Raises `not_found` if it is gone."""
    try:
        return await _bucket(db).open_download_stream(file_id)
    except NoFile:
        raise AppError("not_found", 404, "Không tìm thấy file CV.") from None


async def latest_version(db: AsyncDatabase, cv_id: str) -> int | None:
    """max(version) read from cv_versions (not the `cvs.latest_version` copy)."""
    doc = await db[VERSIONS].find_one(
        {"cv_id": cv_id}, {"version": 1}, sort=[("version", DESCENDING)]
    )
    return doc["version"] if doc else None


async def insert_version(db: AsyncDatabase, record: CvVersionRecord) -> None:
    """Insert a version, then raise `cvs.latest_version` to it (never lowers it).

    Two inserts of the same (cv_id, version) race on the unique index: one wins, the other
    gets `version_conflict` (409).
    """
    doc = {"_id": record.id, **record.model_dump(exclude={"id"})}
    try:
        await db[VERSIONS].insert_one(doc)
    except DuplicateKeyError:
        raise AppError(
            "version_conflict", 409, "Hồ sơ đã được sửa ở nơi khác, hãy tải lại."
        ) from None
    await db[COLLECTION].update_one(
        {"_id": record.cv_id},
        {"$max": {"latest_version": record.version}, "$set": {"updated_at": utcnow()}},
    )


async def get_version(
    db: AsyncDatabase, user_id: str, cv_id: str, version: int
) -> CvVersionRecord | None:
    doc = await db[VERSIONS].find_one({"cv_id": cv_id, "user_id": user_id, "version": version})
    return _to_version(doc) if doc else None


async def list_versions(db: AsyncDatabase, user_id: str, cv_id: str) -> list[VersionInfo]:
    """Newest first."""
    cursor = (
        db[VERSIONS]
        .find(
            {"cv_id": cv_id, "user_id": user_id},
            {"version": 1, "created_at": 1, "origin": 1},
        )
        .sort("version", DESCENDING)
    )
    return [VersionInfo(**doc) async for doc in cursor]


async def set_analysis(db: AsyncDatabase, cv_id: str, attempt_id: str, **fields: Any) -> bool:
    """Update `analysis.<field>` only while `attempt_id` is still the current attempt.

    Returns False when a newer attempt replaced this one (the caller should stop).
    """
    result = await db[COLLECTION].update_one(
        {"_id": cv_id, "analysis.attempt_id": attempt_id},
        {"$set": {f"analysis.{key}": value for key, value in fields.items()}},
    )
    return result.matched_count == 1


# ---- Deletion steps, in order (see domain.library.delete_cv) ----


async def mark_deleting(db: AsyncDatabase, user_id: str, cv_id: str) -> CvRecord | None:
    """Step 1. Also finds a CV already marked, so an interrupted deletion can be resumed."""
    doc = await db[COLLECTION].find_one_and_update(
        {"_id": cv_id, "user_id": user_id},
        {"$set": {"deleting": True}},
        return_document=ReturnDocument.AFTER,
    )
    return _to_record(doc) if doc else None


async def delete_versions(db: AsyncDatabase, cv_id: str) -> None:
    await db[VERSIONS].delete_many({"cv_id": cv_id})


async def delete_file(db: AsyncDatabase, file_id: str) -> None:
    try:
        await _bucket(db).delete(file_id)
    except NoFile:
        pass  # already deleted by an earlier, interrupted run


async def delete_cv_document(db: AsyncDatabase, cv_id: str) -> None:
    """Last step: once this is gone nothing points at the CV any more."""
    await db[COLLECTION].delete_one({"_id": cv_id})
