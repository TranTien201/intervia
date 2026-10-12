"""`rate_limits` collection: fixed-window counters (failed logins, signups per IP).

One document per key (e.g. `login:email:an@example.com`), removed by a TTL index when its
window ends. Counting is approximate under heavy concurrency, which is fine for this purpose.
"""

from datetime import UTC, datetime, timedelta

from pymongo.asynchronous.database import AsyncDatabase

COLLECTION = "rate_limits"


async def setup_indexes(db: AsyncDatabase) -> None:
    await db[COLLECTION].create_index("expires_at", expireAfterSeconds=0, name="expires_at_ttl")


async def get_count(db: AsyncDatabase, key: str) -> int:
    doc = await db[COLLECTION].find_one({"_id": key, "expires_at": {"$gt": datetime.now(UTC)}})
    return doc["count"] if doc else 0


async def hit(db: AsyncDatabase, key: str, window: timedelta) -> None:
    """Add one to the counter; the window starts at the first hit."""
    now = datetime.now(UTC)
    coll = db[COLLECTION]
    result = await coll.update_one({"_id": key, "expires_at": {"$gt": now}}, {"$inc": {"count": 1}})
    if result.matched_count == 0:
        await coll.replace_one({"_id": key}, {"count": 1, "expires_at": now + window}, upsert=True)


async def reset(db: AsyncDatabase, key: str) -> None:
    await db[COLLECTION].delete_one({"_id": key})
