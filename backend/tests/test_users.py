import pytest

from app.api.errors import AppError
from app.db.mongo import ensure_indexes
from app.db.users import create_user, get_user, get_user_by_email


@pytest.fixture
async def users_db(db):
    await ensure_indexes(db)
    return db


async def test_create_and_get_user(users_db):
    user = await create_user(users_db, "  An@Example.COM ", "hash")
    assert user.email == "an@example.com"

    assert (await get_user(users_db, user.id)) == user
    assert (await get_user_by_email(users_db, "AN@example.com")) == user
    assert await get_user(users_db, "missing") is None


async def test_duplicate_email_is_rejected_case_insensitively(users_db):
    await create_user(users_db, "an@example.com", "hash")
    with pytest.raises(AppError) as exc:
        await create_user(users_db, "AN@Example.com", "other")
    assert exc.value.code == "email_taken"
    assert exc.value.status == 409


async def test_email_index_is_unique(users_db):
    indexes = await users_db.users.index_information()
    assert indexes["email_unique"]["unique"] is True
