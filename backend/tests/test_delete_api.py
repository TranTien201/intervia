import uuid

from app.db import cvs, jds
from app.db.mongo import utcnow
from app.domain.files import PDF
from app.schemas.cv import CandidateProfile, CvVersionRecord
from app.schemas.jd import JdRequirements, JdVersionRecord
from app.schemas.user import DEFAULT_USER_ID

PDF_BYTES = b"%PDF-1.7\n" + b"x" * 1000


async def _cv_with_versions(db, n: int = 2) -> str:
    cv = await cvs.create_cv(db, DEFAULT_USER_ID, "CV", "cv.pdf", PDF, PDF_BYTES)
    for v in range(1, n + 1):
        await cvs.insert_version(
            db,
            CvVersionRecord(
                id=str(uuid.uuid4()),
                cv_id=cv.id,
                user_id=DEFAULT_USER_ID,
                version=v,
                origin="user_edit",
                profile=CandidateProfile(),
                created_at=utcnow(),
            ),
        )
    return cv.id


async def _counts(db, cv_id: str) -> tuple[int, int, int, int]:
    return (
        await db.cvs.count_documents({"_id": cv_id}),
        await db.cv_versions.count_documents({"cv_id": cv_id}),
        await db["cv_files.files"].count_documents({"metadata.cv_id": cv_id}),
        await db["cv_files.chunks"].count_documents({}),
    )


async def test_delete_cv_removes_everything(client, db):
    cv_id = await _cv_with_versions(db)
    keep_id = await _cv_with_versions(db, n=1)
    assert (await _counts(db, cv_id))[:3] == (1, 2, 1)

    r = await client.delete(f"/api/cvs/{cv_id}")
    assert r.status_code == 204
    assert (await _counts(db, cv_id))[:3] == (0, 0, 0)
    # Only the other CV's file chunks remain.
    assert (await _counts(db, keep_id)) == (1, 1, 1, 1)

    r = await client.delete(f"/api/cvs/{cv_id}")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


async def test_interrupted_delete_can_be_finished(client, db):
    cv_id = await _cv_with_versions(db)
    # Simulate a run cut off after step 3 (versions gone, file and document still there).
    await cvs.mark_deleting(db, DEFAULT_USER_ID, cv_id)
    await cvs.delete_versions(db, cv_id)

    assert (await client.get(f"/api/cvs/{cv_id}")).status_code == 404
    assert (await client.get("/api/cvs")).json() == []

    r = await client.delete(f"/api/cvs/{cv_id}")
    assert r.status_code == 204
    assert await _counts(db, cv_id) == (0, 0, 0, 0)


async def test_interrupted_after_file_delete(client, db):
    cv_id = await _cv_with_versions(db)
    cv = await cvs.mark_deleting(db, DEFAULT_USER_ID, cv_id)
    await cvs.delete_versions(db, cv_id)
    await cvs.delete_file(db, cv.file_id)

    assert (await client.delete(f"/api/cvs/{cv_id}")).status_code == 204
    assert await _counts(db, cv_id) == (0, 0, 0, 0)


async def test_cannot_delete_other_users_cv(client, db):
    other = await cvs.create_cv(db, "someone-else", "CV", "cv.pdf", PDF, PDF_BYTES)
    assert (await client.delete(f"/api/cvs/{other.id}")).status_code == 404
    stored = await db.cvs.find_one({"_id": other.id})
    assert stored["deleting"] is False


async def test_delete_jd(client, db):
    jd = await jds.create_jd(db, DEFAULT_USER_ID, "JD", "text")
    await jds.insert_version(
        db,
        JdVersionRecord(
            id=str(uuid.uuid4()),
            jd_id=jd.id,
            user_id=DEFAULT_USER_ID,
            version=1,
            origin="user_edit",
            requirements=JdRequirements(),
            created_at=utcnow(),
        ),
    )
    assert (await client.delete(f"/api/jds/{jd.id}")).status_code == 204
    assert await db.jds.count_documents({"_id": jd.id}) == 0
    assert await db.jd_versions.count_documents({"jd_id": jd.id}) == 0
    assert (await client.delete(f"/api/jds/{jd.id}")).status_code == 404


async def test_interrupted_jd_delete_and_other_user(client, db):
    jd = await jds.create_jd(db, DEFAULT_USER_ID, "JD", "text")
    await jds.mark_deleting(db, DEFAULT_USER_ID, jd.id)
    assert (await client.get("/api/jds")).json() == []
    assert (await client.delete(f"/api/jds/{jd.id}")).status_code == 204
    assert await db.jds.count_documents({}) == 0

    other = await jds.create_jd(db, "someone-else", "JD", "text")
    assert (await client.delete(f"/api/jds/{other.id}")).status_code == 404
