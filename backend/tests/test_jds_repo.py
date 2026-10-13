import asyncio
import uuid

import pytest

from app.api.errors import AppError
from app.db import jds
from app.db.mongo import ensure_indexes, utcnow
from app.schemas.jd import JdRequirements, JdVersionRecord, Requirement

USER_A = "user-a"
USER_B = "user-b"


@pytest.fixture
async def jd_db(db):
    await ensure_indexes(db)
    return db


def _version(jd_id: str, version: int, count: int = 1) -> JdVersionRecord:
    reqs = [
        Requirement(id=f"r{i}", name=f"Req {i}", kind="required", importance=2)
        for i in range(count)
    ]
    return JdVersionRecord(
        id=str(uuid.uuid4()),
        jd_id=jd_id,
        user_id=USER_A,
        version=version,
        origin="user_edit",
        requirements=JdRequirements(requirements=reqs),
        created_at=utcnow(),
    )


async def test_create_and_get_jd(jd_db):
    jd = await jds.create_jd(jd_db, USER_A, "JD Backend", "Yêu cầu: Python", mode="precise")
    assert jd.analysis.status == "pending"
    assert jd.analysis.step == "receive"
    assert jd.analysis.mode == "precise"
    assert (jd.company, jd.position, jd.requirement_count) == (None, None, 0)
    assert await jds.get_jd(jd_db, USER_A, jd.id) == jd
    assert await jds.get_jd(jd_db, USER_B, jd.id) is None


async def test_list_newest_updated_first(jd_db):
    first = await jds.create_jd(jd_db, USER_A, "1", "a")
    await asyncio.sleep(0.002)
    second = await jds.create_jd(jd_db, USER_A, "2", "b")
    assert [j.id for j in await jds.list_jds(jd_db, USER_A)] == [second.id, first.id]
    assert await jds.list_jds(jd_db, USER_B) == []


async def test_versions_update_latest_and_requirement_count(jd_db):
    jd = await jds.create_jd(jd_db, USER_A, "JD", "text")
    await jds.insert_version(jd_db, _version(jd.id, 1, count=3))
    await jds.insert_version(jd_db, _version(jd.id, 2, count=5))
    assert await jds.latest_version(jd_db, jd.id) == 2
    stored = await jds.get_jd(jd_db, USER_A, jd.id)
    assert (stored.latest_version, stored.requirement_count) == (2, 5)

    # An older version arriving late does not overwrite the copy.
    await jds.insert_version(jd_db, _version(jd.id, 0, count=9))
    stored = await jds.get_jd(jd_db, USER_A, jd.id)
    assert (stored.latest_version, stored.requirement_count) == (2, 5)

    with pytest.raises(AppError) as exc:
        await jds.insert_version(jd_db, _version(jd.id, 2))
    assert exc.value.code == "version_conflict"


async def test_deleting_jd_is_hidden(jd_db):
    jd = await jds.create_jd(jd_db, USER_A, "JD", "text")
    await jds.mark_deleting(jd_db, USER_A, jd.id)
    assert await jds.get_jd(jd_db, USER_A, jd.id) is None
    assert await jds.list_jds(jd_db, USER_A) == []


async def test_set_analysis_requires_current_attempt(jd_db):
    jd = await jds.create_jd(jd_db, USER_A, "JD", "text")
    assert not await jds.set_analysis(jd_db, jd.id, "stale", status="running")
    assert await jds.set_analysis(jd_db, jd.id, jd.analysis.attempt_id, status="running")
    assert (await jds.get_jd(jd_db, USER_A, jd.id)).analysis.status == "running"
