import httpx
import pytest
from pymongo import AsyncMongoClient

from app.config import Settings
from app.db.mongo import create_client
from app.main import create_app

TEST_DB = "intervia_test"


@pytest.fixture(scope="session")
def settings() -> Settings:
    # Same URI as dev, separate database that tests may drop freely.
    # Login off by default whatever .env says; tests that need it turn it on explicitly.
    return Settings(app_env="test", mongodb_db=TEST_DB, mongodb_timeout_ms=2000, auth_enabled=False)


@pytest.fixture(scope="session")
async def mongo_client(settings: Settings):
    # Same client options as the app (tz-aware datetimes, UUID representation).
    client = create_client(settings)
    try:
        await client.admin.command("ping")
    except Exception:
        await client.close()
        pytest.skip(f"MongoDB not reachable at {settings.mongodb_uri}")
    yield client
    await client.close()


@pytest.fixture
async def db(mongo_client: AsyncMongoClient):
    await mongo_client.drop_database(TEST_DB)
    yield mongo_client[TEST_DB]
    await mongo_client.drop_database(TEST_DB)


@pytest.fixture
async def client(db, settings: Settings):
    """HTTP client against the real app (startup included), login off."""
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            yield c
