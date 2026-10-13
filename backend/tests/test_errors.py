import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import current_user
from app.api.errors import AppError
from app.config import Settings
from app.main import create_app
from app.schemas.user import DEFAULT_USER_ID, User


class Payload(BaseModel):
    name: str


def _client() -> httpx.AsyncClient:
    app = create_app(Settings(app_env="test", auth_enabled=False))
    router = APIRouter()

    @router.post("/echo")
    async def echo(body: Payload) -> dict:
        return {"name": body.name}

    @router.get("/locked")
    async def locked() -> None:
        raise AppError("session_locked", 409, "Phiên đã bắt đầu.")

    @router.get("/me")
    async def me(user: User = Depends(current_user)) -> User:  # noqa: B008
        return user

    app.include_router(router, prefix="/api")
    # ASGITransport skips lifespan, so these tests need no MongoDB.
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


async def test_validation_error_shape():
    async with _client() as c:
        r = await c.post("/api/echo", json={})
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "validation_error"
    assert "name" in err["fields"]


async def test_app_error_shape():
    async with _client() as c:
        r = await c.get("/api/locked")
    assert r.status_code == 409
    assert r.json() == {"error": {"code": "session_locked", "message": "Phiên đã bắt đầu."}}


async def test_unknown_route_is_not_found():
    async with _client() as c:
        r = await c.get("/api/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


async def test_current_user_is_default_user():
    async with _client() as c:
        r = await c.get("/api/me")
    assert r.json()["id"] == DEFAULT_USER_ID
