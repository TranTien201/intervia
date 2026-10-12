"""`users` collection: one document per account. Every other collection points here by `user_id`.

Email uniqueness is enforced by a unique index, not by "find then insert": two signups with the
same email at the same moment would both pass a find, but only one insert can pass the index.
"""

import uuid
from datetime import UTC, datetime

from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.api.errors import AppError
from app.schemas.user import UserRecord

COLLECTION = "users"


async def setup_indexes(db: AsyncDatabase) -> None:
    await db[COLLECTION].create_index("email", unique=True, name="email_unique")


def normalize_email(email: str) -> str:
    """Emails compare case-insensitively (api.md), so they are stored lowercase."""
    return email.strip().lower()


def _to_record(doc: dict) -> UserRecord:
    return UserRecord(id=doc.pop("_id"), **doc)


async def create_user(db: AsyncDatabase, email: str, password_hash: str) -> UserRecord:
    """Insert a new user. Raises `email_taken` (409) if the email already exists."""
    # MongoDB stores milliseconds; truncate so the returned record equals the stored one.
    now = datetime.now(UTC)
    now = now.replace(microsecond=now.microsecond // 1000 * 1000)
    record = UserRecord(
        id=str(uuid.uuid4()),
        email=normalize_email(email),
        password_hash=password_hash,
        created_at=now,
        updated_at=now,
    )
    doc = record.model_dump(exclude={"id"})
    try:
        await db[COLLECTION].insert_one({"_id": record.id, **doc})
    except DuplicateKeyError:
        raise AppError("email_taken", 409, "Email này đã được đăng ký.") from None
    return record


async def get_user(db: AsyncDatabase, user_id: str) -> UserRecord | None:
    doc = await db[COLLECTION].find_one({"_id": user_id})
    return _to_record(doc) if doc else None


async def get_user_by_email(db: AsyncDatabase, email: str) -> UserRecord | None:
    doc = await db[COLLECTION].find_one({"email": normalize_email(email)})
    return _to_record(doc) if doc else None
