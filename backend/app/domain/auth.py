"""Signup, login and logout rules (BE-9). Routes in app/api/auth.py only map HTTP to these."""

import re
from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from pymongo.asynchronous.database import AsyncDatabase

from app.api.errors import AppError
from app.config import Settings
from app.db import auth_sessions, rate_limits, users
from app.schemas.user import UserRecord

PASSWORD_MIN_CHARS = 10
PASSWORD_MAX_CHARS = 256  # hashing is deliberately slow; cap the input
EMAIL_MAX_CHARS = 254
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

_hasher = PasswordHasher()
# Verified against when the email does not exist, so a wrong email takes as long as a wrong
# password and response time does not reveal which emails have accounts.
_DUMMY_HASH = _hasher.hash("intervia-dummy-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def _validate_signup(email: str, password: str) -> None:
    fields: dict[str, str] = {}
    email = users.normalize_email(email)
    if len(email) > EMAIL_MAX_CHARS or not _EMAIL_RE.match(email):
        fields["email"] = "Email không hợp lệ."
    if len(password) < PASSWORD_MIN_CHARS:
        fields["password"] = f"Mật khẩu cần ít nhất {PASSWORD_MIN_CHARS} ký tự."
    elif len(password) > PASSWORD_MAX_CHARS:
        fields["password"] = f"Mật khẩu dài tối đa {PASSWORD_MAX_CHARS} ký tự."
    if fields:
        raise AppError("validation_error", 422, "Dữ liệu chưa hợp lệ.", fields)


async def signup(
    db: AsyncDatabase, settings: Settings, email: str, password: str, ip: str
) -> tuple[UserRecord, str]:
    """Create an account and log it in. Returns the user and the session token."""
    _validate_signup(email, password)
    ip_key = f"signup:ip:{ip}"
    if await rate_limits.get_count(db, ip_key) >= settings.signup_max_per_ip_hour:
        raise AppError("too_many_attempts", 429, "Đăng ký quá nhiều lần, hãy thử lại sau.")
    user = await users.create_user(db, email, hash_password(password))
    await rate_limits.hit(db, ip_key, timedelta(hours=1))
    token = await _start_session(db, settings, user.id)
    return user, token


async def login(
    db: AsyncDatabase, settings: Settings, email: str, password: str, ip: str
) -> tuple[UserRecord, str]:
    """Check credentials and start a session. Wrong email and wrong password look the same."""
    email_key = f"login:email:{users.normalize_email(email)}"
    ip_key = f"login:ip:{ip}"
    if (
        await rate_limits.get_count(db, email_key) >= settings.login_max_failures
        or await rate_limits.get_count(db, ip_key) >= settings.login_max_failures_per_ip
    ):
        raise AppError("too_many_attempts", 429, "Đăng nhập sai quá nhiều lần, hãy thử lại sau.")

    user = await users.get_user_by_email(db, email)
    ok = len(password) <= PASSWORD_MAX_CHARS and verify_password(
        user.password_hash if user else _DUMMY_HASH, password
    )
    if not (user and ok):
        window = timedelta(minutes=settings.login_lock_minutes)
        await rate_limits.hit(db, email_key, window)
        await rate_limits.hit(db, ip_key, window)
        raise AppError("invalid_credentials", 401, "Email hoặc mật khẩu không đúng.")

    await rate_limits.reset(db, email_key)
    token = await _start_session(db, settings, user.id)
    return user, token


async def logout(db: AsyncDatabase, token: str | None) -> None:
    if token:
        await auth_sessions.delete_session(db, token)


async def user_for_token(db: AsyncDatabase, token: str) -> UserRecord | None:
    user_id = await auth_sessions.get_session_user_id(db, token)
    return await users.get_user(db, user_id) if user_id else None


async def _start_session(db: AsyncDatabase, settings: Settings, user_id: str) -> str:
    return await auth_sessions.create_session(
        db, user_id, timedelta(days=settings.auth_session_days)
    )
