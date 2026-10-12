import httpx

from app.config import Settings
from app.main import create_app


async def test_db_roundtrip(db):
    await db.smoke.insert_one({"_id": "a", "value": 1})
    doc = await db.smoke.find_one({"_id": "a"})
    assert doc == {"_id": "a", "value": 1}


async def test_health_with_db(mongo_client, settings: Settings):
    app = create_app(settings)
    # Run the real startup (lifespan) against MongoDB.
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            r = await c.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "db": "ok"}
