import asyncio
import uuid

import pytest

from app.api.errors import AppError
from app.db import cvs
from app.db.mongo import ensure_indexes, utcnow
from app.schemas.cv import CandidateProfile, CvVersionRecord, Skill

USER_A = "user-a"
USER_B = "user-b"
PDF = b"%PDF-1.7\n fake pdf body"


@pytest.fixture
async def cv_db(db):
    await ensure_indexes(db)
    return db


def _version(cv_id: str, version: int, user_id: str = USER_A) -> CvVersionRecord:
    return CvVersionRecord(
        id=str(uuid.uuid4()),
        cv_id=cv_id,
        user_id=user_id,
        version=version,
        origin="user_edit",
        profile=CandidateProfile(skills=[Skill(id="s1", name=f"Python v{version}")]),
        created_at=utcnow(),
    )


async def _read_file(db, file_id: str) -> bytes:
    stream = await cvs.open_file(db, file_id)
    return await stream.read()


async def test_create_and_get_cv_with_file(cv_db):
    cv = await cvs.create_cv(cv_db, USER_A, "CV Backend", "cv.pdf", "application/pdf", PDF)
    assert cv.analysis.status == "pending"
    assert cv.analysis.step == "upload"
    assert cv.latest_version is None
    assert cv.size == len(PDF)

    assert await cvs.get_cv(cv_db, USER_A, cv.id) == cv
    assert await _read_file(cv_db, cv.file_id) == PDF
    meta = await cv_db["cv_files.files"].find_one({"_id": cv.file_id})
    assert meta["metadata"] == {"user_id": USER_A, "cv_id": cv.id}


async def test_other_user_cannot_read(cv_db):
    cv = await cvs.create_cv(cv_db, USER_A, "CV", "cv.pdf", "application/pdf", PDF)
    assert await cvs.get_cv(cv_db, USER_B, cv.id) is None
    assert await cvs.list_cvs(cv_db, USER_B) == []
    assert await cvs.rename_cv(cv_db, USER_B, cv.id, "x") is None


async def test_list_newest_updated_first(cv_db):
    first = await cvs.create_cv(cv_db, USER_A, "1", "a.pdf", "application/pdf", PDF)
    await asyncio.sleep(0.002)
    second = await cvs.create_cv(cv_db, USER_A, "2", "b.pdf", "application/pdf", PDF)
    assert [c.id for c in await cvs.list_cvs(cv_db, USER_A)] == [second.id, first.id]

    await asyncio.sleep(0.002)
    await cvs.rename_cv(cv_db, USER_A, first.id, "1b")
    assert [c.id for c in await cvs.list_cvs(cv_db, USER_A)] == [first.id, second.id]


async def test_duplicate_version_is_conflict(cv_db):
    cv = await cvs.create_cv(cv_db, USER_A, "CV", "cv.pdf", "application/pdf", PDF)
    await cvs.insert_version(cv_db, _version(cv.id, 1))
    with pytest.raises(AppError) as exc:
        await cvs.insert_version(cv_db, _version(cv.id, 1))
    assert exc.value.code == "version_conflict"
    assert exc.value.status == 409


async def test_latest_version_after_three_inserts(cv_db):
    cv = await cvs.create_cv(cv_db, USER_A, "CV", "cv.pdf", "application/pdf", PDF)
    assert await cvs.latest_version(cv_db, cv.id) is None
    for v in (1, 2, 3):
        await cvs.insert_version(cv_db, _version(cv.id, v))
    assert await cvs.latest_version(cv_db, cv.id) == 3
    assert (await cvs.get_cv(cv_db, USER_A, cv.id)).latest_version == 3
    assert [v.version for v in await cvs.list_versions(cv_db, USER_A, cv.id)] == [3, 2, 1]

    v2 = await cvs.get_version(cv_db, USER_A, cv.id, 2)
    assert v2.profile.skills[0].name == "Python v2"
    assert await cvs.get_version(cv_db, USER_B, cv.id, 2) is None


async def test_latest_version_copy_never_goes_down(cv_db):
    cv = await cvs.create_cv(cv_db, USER_A, "CV", "cv.pdf", "application/pdf", PDF)
    await cvs.insert_version(cv_db, _version(cv.id, 2))
    await cvs.insert_version(cv_db, _version(cv.id, 1))
    assert (await cvs.get_cv(cv_db, USER_A, cv.id)).latest_version == 2


async def test_deleting_cv_is_hidden(cv_db):
    cv = await cvs.create_cv(cv_db, USER_A, "CV", "cv.pdf", "application/pdf", PDF)
    marked = await cvs.mark_deleting(cv_db, USER_A, cv.id)
    assert marked.deleting is True
    assert await cvs.get_cv(cv_db, USER_A, cv.id) is None
    assert await cvs.list_cvs(cv_db, USER_A) == []
    assert await cvs.rename_cv(cv_db, USER_A, cv.id, "x") is None
    # Still reachable for resuming the deletion.
    assert (await cvs.mark_deleting(cv_db, USER_A, cv.id)).id == cv.id


async def test_set_analysis_requires_current_attempt(cv_db):
    cv = await cvs.create_cv(cv_db, USER_A, "CV", "cv.pdf", "application/pdf", PDF)
    assert not await cvs.set_analysis(cv_db, cv.id, "stale-attempt", status="running")
    assert (await cvs.get_cv(cv_db, USER_A, cv.id)).analysis.status == "pending"

    assert await cvs.set_analysis(cv_db, cv.id, cv.analysis.attempt_id, status="running")
    assert (await cvs.get_cv(cv_db, USER_A, cv.id)).analysis.status == "running"
