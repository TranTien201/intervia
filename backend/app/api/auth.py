"""Login endpoints, contract in docs/design/api.md section "Đăng nhập"."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel
from pymongo.asynchronous.database import AsyncDatabase

from app.api.deps import get_db, get_settings, optional_user
from app.api.errors import AppError
from app.config import Settings
from app.domain import auth
from app.schemas.user import User

router = APIRouter(prefix="/auth", tags=["auth"])

Db = Annotated[AsyncDatabase, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]


class Credentials(BaseModel):
    email: str
    password: str


class AuthState(BaseModel):
    auth_enabled: bool
    user: User | None


class UserOut(BaseModel):
    user: User


def _require_enabled(settings: Settings) -> None:
    if not settings.auth_enabled:
        raise AppError("not_found", 404, "Chưa bật đăng nhập.")


def _client_ip(request: Request) -> str:
    # Direct peer only. Behind a reverse proxy this needs a trusted X-Forwarded-For setup.
    return request.client.host if request.client else "unknown"


def _set_cookie(response: Response, settings: Settings, token: str) -> None:
    response.set_cookie(
        settings.auth_cookie_name,
        token,
        max_age=settings.auth_session_days * 24 * 3600,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )


@router.get("/me")
async def me(
    settings: AppSettings, user: Annotated[User | None, Depends(optional_user)]
) -> AuthState:
    return AuthState(auth_enabled=settings.auth_enabled, user=user)


@router.post("/signup", status_code=201)
async def signup(
    body: Credentials, request: Request, response: Response, db: Db, settings: AppSettings
) -> UserOut:
    _require_enabled(settings)
    user, token = await auth.signup(db, settings, body.email, body.password, _client_ip(request))
    _set_cookie(response, settings, token)
    return UserOut(user=user.to_public())


@router.post("/login")
async def login(
    body: Credentials, request: Request, response: Response, db: Db, settings: AppSettings
) -> UserOut:
    _require_enabled(settings)
    user, token = await auth.login(db, settings, body.email, body.password, _client_ip(request))
    _set_cookie(response, settings, token)
    return UserOut(user=user.to_public())


@router.post("/logout", status_code=204)
async def logout(request: Request, db: Db, settings: AppSettings) -> Response:
    await auth.logout(db, request.cookies.get(settings.auth_cookie_name))
    response = Response(status_code=204)
    response.delete_cookie(
        settings.auth_cookie_name,
        path="/",
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
    )
    return response
