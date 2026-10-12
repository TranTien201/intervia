from contextlib import asynccontextmanager

import httpx

from app.config import Settings
from app.main import create_app

PASSWORD = "matkhau-dai-123"


@asynccontextmanager
async def _client(settings: Settings, **overrides):
    # http://test is not HTTPS, so the test cookie jar needs non-Secure cookies.
    app = create_app(
        settings.model_copy(update={"auth_enabled": True, "auth_cookie_secure": False, **overrides})
    )
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            yield c


async def test_auth_disabled_returns_default_user(db, settings: Settings):
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            me = (await c.get("/api/auth/me")).json()
            signup = await c.post(
                "/api/auth/signup", json={"email": "a@b.co", "password": PASSWORD}
            )
    assert me["auth_enabled"] is False
    assert me["user"]["id"] == "00000000-0000-0000-0000-000000000001"
    assert signup.status_code == 404


async def test_signup_logs_in_then_logout(db, settings: Settings):
    async with _client(settings) as c:
        r = await c.get("/api/auth/me")
        assert r.json() == {"auth_enabled": True, "user": None}

        r = await c.post("/api/auth/signup", json={"email": "An@Example.com", "password": PASSWORD})
        assert r.status_code == 201
        user = r.json()["user"]
        assert user["email"] == "an@example.com"
        cookie = r.headers["set-cookie"].lower()
        assert "httponly" in cookie and "samesite=lax" in cookie

        assert (await c.get("/api/auth/me")).json()["user"] == user

        r = await c.post("/api/auth/logout")
        assert r.status_code == 204
        assert (await c.get("/api/auth/me")).json()["user"] is None

    # The token is stored hashed, never as the raw cookie value.
    assert await db.auth_sessions.count_documents({}) == 0
    stored = await db.users.find_one({"email": "an@example.com"})
    assert stored["password_hash"].startswith("$argon2")


async def test_signup_validation_and_email_taken(db, settings: Settings):
    async with _client(settings) as c:
        r = await c.post("/api/auth/signup", json={"email": "not-an-email", "password": "short"})
        assert r.status_code == 422
        assert set(r.json()["error"]["fields"]) == {"email", "password"}

        await c.post("/api/auth/signup", json={"email": "an@example.com", "password": PASSWORD})
        r = await c.post("/api/auth/signup", json={"email": "AN@example.com", "password": PASSWORD})
        assert r.status_code == 409
        assert r.json()["error"]["code"] == "email_taken"


async def test_login_wrong_password_and_lockout(db, settings: Settings):
    async with _client(settings, login_max_failures=3) as c:
        await c.post("/api/auth/signup", json={"email": "an@example.com", "password": PASSWORD})
        await c.post("/api/auth/logout")

        bad = {"email": "an@example.com", "password": "sai-mat-khau-1"}
        unknown = {"email": "nobody@example.com", "password": PASSWORD}
        r1, r2 = (
            await c.post("/api/auth/login", json=bad),
            await c.post("/api/auth/login", json=unknown),
        )
        # Wrong password and unknown email look the same.
        assert r1.status_code == r2.status_code == 401
        assert r1.json() == r2.json()
        assert r1.json()["error"]["code"] == "invalid_credentials"

        good = {"email": "AN@example.com", "password": PASSWORD}
        r = await c.post("/api/auth/login", json=good)
        assert r.status_code == 200
        assert r.json()["user"]["email"] == "an@example.com"

        # Success resets the counter; three failures in a row then lock the email.
        for _ in range(3):
            await c.post("/api/auth/login", json=bad)
        r = await c.post("/api/auth/login", json=good)
        assert r.status_code == 429
        assert r.json()["error"]["code"] == "too_many_attempts"


async def test_signup_limited_per_ip(db, settings: Settings):
    async with _client(settings, signup_max_per_ip_hour=2) as c:
        for i in range(2):
            r = await c.post(
                "/api/auth/signup", json={"email": f"u{i}@ex.com", "password": PASSWORD}
            )
            assert r.status_code == 201
        r = await c.post("/api/auth/signup", json={"email": "u9@ex.com", "password": PASSWORD})
        assert r.status_code == 429


async def test_protected_endpoint_needs_login(db, settings: Settings):
    from fastapi import Depends

    from app.api.deps import current_user
    from app.schemas.user import User

    async with _client(settings) as c:
        app = c._transport.app  # type: ignore[attr-defined]

        @app.get("/api/whoami")
        async def whoami(user: User = Depends(current_user)) -> User:  # noqa: B008
            return user

        r = await c.get("/api/whoami")
        assert r.status_code == 401
        assert r.json()["error"]["code"] == "unauthenticated"

        await c.post("/api/auth/signup", json={"email": "an@example.com", "password": PASSWORD})
        r = await c.get("/api/whoami")
        assert r.status_code == 200
        assert r.json()["email"] == "an@example.com"

        # A forged cookie is not a session.
        c.cookies.set("intervia_session", "forged")
        assert (await c.get("/api/whoami")).status_code == 401
