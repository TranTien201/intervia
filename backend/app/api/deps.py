from typing import Annotated

from fastapi import Depends, Request
from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from app.api.errors import AppError
from app.config import Settings
from app.domain import auth
from app.schemas.user import DEFAULT_USER_EMAIL, DEFAULT_USER_ID, User

DEFAULT_USER = User(id=DEFAULT_USER_ID, email=DEFAULT_USER_EMAIL)


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_client(request: Request) -> AsyncMongoClient:
    return request.app.state.mongo_client


def get_db(request: Request) -> AsyncDatabase:
    return request.app.state.db


async def optional_user(
    request: Request, settings: Annotated[Settings, Depends(get_settings)]
) -> User | None:
    """The logged-in user, or None. With login off, always the default user."""
    if not settings.auth_enabled:
        return DEFAULT_USER
    token = request.cookies.get(settings.auth_cookie_name)
    if not token:
        return None
    user = await auth.user_for_token(get_db(request), token)
    return user.to_public() if user else None


async def current_user(user: Annotated[User | None, Depends(optional_user)]) -> User:
    """Who is calling. Every endpoint outside /auth/* depends on this, so it answers 401."""
    if user is None:
        raise AppError("unauthenticated", 401, "Chưa đăng nhập.")
    return user
