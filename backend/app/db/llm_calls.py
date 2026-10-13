"""`llm_calls` collection (records: `app.schemas.llm_call`).

`output` holds personal data (CV content), so calls are deleted with the CV / JD they
refer to, through `ref`.
"""

from typing import Any

from pymongo import DESCENDING
from pymongo.asynchronous.database import AsyncDatabase

from app.schemas.llm_call import LlmCallRecord, LlmRole

COLLECTION = "llm_calls"


async def setup_indexes(db: AsyncDatabase) -> None:
    calls = db[COLLECTION]
    # Reuse lookup; its `user_id` prefix also serves account deletion.
    await calls.create_index([("user_id", 1), ("reuse_key", 1)], name="user_reuse_key")
    await calls.create_index([("ref.kind", 1), ("ref.id", 1)], name="ref")


def _to_record(doc: dict[str, Any]) -> LlmCallRecord:
    return LlmCallRecord(id=doc.pop("_id"), **doc)


async def insert_call(db: AsyncDatabase, record: LlmCallRecord) -> None:
    await db[COLLECTION].insert_one({"_id": record.id, **record.model_dump(exclude={"id"})})


async def find_reusable(
    db: AsyncDatabase, user_id: str, role: LlmRole, reuse_key: str
) -> LlmCallRecord | None:
    """The newest successful call with this key. Never crosses users: another user's output
    is their personal data."""
    doc = await db[COLLECTION].find_one(
        {"user_id": user_id, "reuse_key": reuse_key, "role": role, "status": "ok"},
        sort=[("created_at", DESCENDING)],
    )
    return _to_record(doc) if doc else None


async def delete_for_ref(db: AsyncDatabase, kind: str, ref_id: str) -> None:
    await db[COLLECTION].delete_many({"ref.kind": kind, "ref.id": ref_id})
