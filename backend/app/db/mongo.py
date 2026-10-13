"""MongoDB connection. Collections and their indexes are registered here.

There are no migrations: indexes are created at startup (idempotent), and documents
carry a `schema_version` field when their shape needs to change.
IDs are UUID strings stored in `_id` (the API contract uses UUID strings).
"""

import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from app.config import Settings

log = logging.getLogger(__name__)

IndexSetup = Callable[[AsyncDatabase], Awaitable[None]]

# Filled in app/db/__init__.py: one index setup function per collection.
INDEX_SETUPS: list[IndexSetup] = []


def create_client(settings: Settings) -> AsyncMongoClient:
    return AsyncMongoClient(
        settings.mongodb_uri,
        tz_aware=True,
        uuidRepresentation="standard",
        serverSelectionTimeoutMS=settings.mongodb_timeout_ms,
    )


def utcnow() -> datetime:
    """Now in UTC, cut to milliseconds (all MongoDB stores), so a returned record equals the
    stored one."""
    now = datetime.now(UTC)
    return now.replace(microsecond=now.microsecond // 1000 * 1000)


async def ensure_indexes(db: AsyncDatabase) -> None:
    for setup in INDEX_SETUPS:
        await setup(db)
    log.info("MongoDB indexes ensured (%d setups)", len(INDEX_SETUPS))


async def ping(client: AsyncMongoClient) -> bool:
    try:
        await client.admin.command("ping")
        return True
    except Exception:
        log.warning("MongoDB ping failed", exc_info=True)
        return False
