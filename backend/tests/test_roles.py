from contextlib import asynccontextmanager

import httpx

from app.config import Settings
from app.domain.roles import ROLES
from app.main import create_app


@asynccontextmanager
async def _client(settings: Settings):
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            yield c


async def test_list_roles(db, settings: Settings):
    async with _client(settings) as c:
        r = await c.get("/api/roles")
    assert r.status_code == 200
    # Same list and order as the web mock (web/src/mocks/seed.ts).
    assert r.json() == [
        {"id": "backend_engineer", "name": "Backend Engineer"},
        {"id": "ai_engineer", "name": "AI Engineer"},
        {"id": "frontend_engineer", "name": "Frontend Engineer"},
        {"id": "data_engineer", "name": "Data Engineer"},
    ]


def test_role_ids_unique():
    ids = [role.id for role in ROLES]
    assert len(ids) == len(set(ids))


async def test_roles_requires_login_when_auth_enabled(db, settings: Settings):
    async with _client(settings.model_copy(update={"auth_enabled": True})) as c:
        r = await c.get("/api/roles")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthenticated"
