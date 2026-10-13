import asyncio
import io
import zipfile

import httpx

from app.config import Settings
from app.db import cvs
from app.domain.files import DOCX, MAX_FILE_SIZE, PDF
from app.main import create_app
from app.schemas.user import DEFAULT_USER_ID

PDF_BYTES = b"%PDF-1.7\n" + b"x" * 2000


def _docx_bytes() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", "<w:document/>")
    return buf.getvalue()


async def _upload(c: httpx.AsyncClient, data: bytes, name="CV Backend", filename="cv.pdf", **form):
    return await c.post(
        "/api/cvs",
        data={"name": name, **form} if name is not None else form,
        files={"file": (filename, data, "application/pdf")},
    )


async def test_upload_pdf(client):
    r = await _upload(client, PDF_BYTES)
    assert r.status_code == 201
    body = r.json()
    assert set(body) == {
        "id",
        "name",
        "file_name",
        "latest_version",
        "analysis_status",
        "session_count",
        "created_at",
        "updated_at",
    }
    assert body["name"] == "CV Backend"
    assert body["file_name"] == "cv.pdf"
    assert body["latest_version"] is None
    assert body["analysis_status"] == "pending"
    assert body["session_count"] == 0
    assert body["created_at"].endswith("Z") or "+00:00" in body["created_at"]


async def test_upload_docx_and_mode_is_stored(client, db):
    r = await _upload(client, _docx_bytes(), filename="cv.docx", mode="layout")
    assert r.status_code == 201
    stored = await db.cvs.find_one({"_id": r.json()["id"]})
    assert stored["content_type"] == DOCX
    assert stored["analysis"]["mode"] == "layout"
    assert stored["analysis"]["step"] == "upload"


async def test_upload_too_large(client):
    r = await _upload(client, b"%PDF-" + b"0" * MAX_FILE_SIZE)
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "file_too_large"


async def test_upload_text_renamed_to_pdf(client):
    r = await _upload(client, b"just some text", filename="cv.pdf")
    assert r.status_code == 415
    assert r.json()["error"]["code"] == "unsupported_file"


async def test_upload_empty_or_other_zip(client):
    assert (await _upload(client, b"")).status_code == 415
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        archive.writestr("a.txt", "hi")
    assert (await _upload(client, buf.getvalue(), filename="cv.docx")).status_code == 415


async def test_upload_bad_name_or_mode(client):
    r = await _upload(client, PDF_BYTES, name=None)
    assert r.status_code == 422
    assert "name" in r.json()["error"]["fields"]

    r = await _upload(client, PDF_BYTES, name="x" * 121)
    assert r.status_code == 422
    assert "name" in r.json()["error"]["fields"]

    r = await _upload(client, PDF_BYTES, name="   ")
    assert r.json()["error"]["fields"].keys() == {"name"}

    r = await _upload(client, PDF_BYTES, mode="fast")
    assert r.status_code == 422
    assert r.json()["error"]["fields"].keys() == {"mode"}

    r = await client.post("/api/cvs", data={"name": "CV"})
    assert r.status_code == 422
    assert r.json()["error"]["fields"].keys() == {"file"}


async def test_upload_name_trimmed_and_path_stripped(client):
    r = await _upload(client, PDF_BYTES, name="  CV 2026  ", filename="C:\\docs\\Nguyễn Văn A.pdf")
    assert r.json()["name"] == "CV 2026"
    assert r.json()["file_name"] == "Nguyễn Văn A.pdf"


async def test_list_get_rename(client):
    first = (await _upload(client, PDF_BYTES, name="Một")).json()
    await asyncio.sleep(0.002)
    second = (await _upload(client, PDF_BYTES, name="Hai")).json()

    listed = (await client.get("/api/cvs")).json()
    assert [c["id"] for c in listed] == [second["id"], first["id"]]

    r = await client.patch(f"/api/cvs/{first['id']}", json={"name": " Một (sửa) "})
    assert r.status_code == 200
    assert r.json()["name"] == "Một (sửa)"
    assert r.json()["updated_at"] > first["updated_at"]

    listed = (await client.get("/api/cvs")).json()
    assert [c["id"] for c in listed] == [first["id"], second["id"]]
    assert (await client.get(f"/api/cvs/{first['id']}")).json()["name"] == "Một (sửa)"

    r = await client.patch(f"/api/cvs/{first['id']}", json={"name": ""})
    assert r.status_code == 422
    assert "name" in r.json()["error"]["fields"]


async def test_download_file(client):
    cv = (await _upload(client, PDF_BYTES, filename="Nguyễn Văn A.pdf")).json()
    r = await client.get(f"/api/cvs/{cv['id']}/file")
    assert r.status_code == 200
    assert r.content == PDF_BYTES
    assert r.headers["content-type"] == PDF
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["content-disposition"] == (
        "inline; filename*=UTF-8''Nguy%E1%BB%85n%20V%C4%83n%20A.pdf"
    )


async def test_two_uploads_of_same_file_are_two_cvs(client):
    a = (await _upload(client, PDF_BYTES)).json()
    b = (await _upload(client, PDF_BYTES)).json()
    assert a["id"] != b["id"]


async def test_other_users_cv_is_not_found(client, db):
    other = await cvs.create_cv(db, "someone-else", "CV", "cv.pdf", PDF, PDF_BYTES)
    assert DEFAULT_USER_ID != "someone-else"
    for path in (f"/api/cvs/{other.id}", f"/api/cvs/{other.id}/file"):
        r = await client.get(path)
        assert r.status_code == 404
        assert r.json()["error"]["code"] == "not_found"
    r = await client.patch(f"/api/cvs/{other.id}", json={"name": "mine"})
    assert r.status_code == 404
    assert (await client.get("/api/cvs")).json() == []


async def test_non_uuid_id_is_not_found(client):
    assert (await client.get("/api/cvs/not-a-uuid")).status_code == 404


async def test_requires_login_when_auth_enabled(db, settings: Settings):
    app = create_app(settings.model_copy(update={"auth_enabled": True}))
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            assert (await c.get("/api/cvs")).status_code == 401
            r = await _upload(c, PDF_BYTES)
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthenticated"
