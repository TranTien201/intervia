"""`auth_sessions` collection: one document per logged-in browser (the login cookie).

`_id` is the SHA-256 of the cookie token, not the token itself: someone who reads the database
still cannot log in as anyone. Expired sessions are removed by a TTL index on `expires_at`
(MongoDB sweeps about once a minute, so reads also check `expires_at`).
"""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from pymongo.asynchronous.database import AsyncDatabase

COLLECTION = "auth_sessions"


async def setup_indexes(db: AsyncDatabase) -> None:
    sessions = db[COLLECTION]
    # "Log out everywhere" and account deletion look sessions up by user.
    await sessions.create_index("user_id", name="user_id")
    await sessions.create_index("expires_at", expireAfterSeconds=0, name="expires_at_ttl")


def _token_id(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_session(db: AsyncDatabase, user_id: str, ttl: timedelta) -> str:
    """Store a new session and return the raw token for the cookie."""
    token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    await db[COLLECTION].insert_one(
        {"_id": _token_id(token), "user_id": user_id, "created_at": now, "expires_at": now + ttl}
    )
    return token


async def get_session_user_id(db: AsyncDatabase, token: str) -> str | None:
    doc = await db[COLLECTION].find_one(
        {"_id": _token_id(token), "expires_at": {"$gt": datetime.now(UTC)}}
    )
    return doc["user_id"] if doc else None


async def delete_session(db: AsyncDatabase, token: str) -> None:
    await db[COLLECTION].delete_one({"_id": _token_id(token)})


async def delete_user_sessions(db: AsyncDatabase, user_id: str) -> None:
    await db[COLLECTION].delete_many({"user_id": user_id})
