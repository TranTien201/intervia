"""JD library endpoints, contract in docs/design/api.md section "JD"."""

import asyncio
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from pymongo.asynchronous.database import AsyncDatabase
from starlette.datastructures import FormData, UploadFile

from app.api.deps import current_user, get_db
from app.api.errors import AppError
from app.api.uploads import read_upload
from app.db import jds
from app.documents import read_text
from app.domain import library, versions
from app.schemas.analysis import VersionInfo
from app.schemas.jd import JdDetail, JdRecord, JdRequirements, JdSummary, JdVersion
from app.schemas.user import User

router = APIRouter(tags=["jds"])

Db = Annotated[AsyncDatabase, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]


class PasteJdBody(BaseModel):
    """`POST /api/jds` with JSON. Documented here; the route parses the body by hand because
    the same path also takes multipart (`_UPLOAD_SCHEMA`)."""

    name: str
    text: str
    mode: str | None = None


_UPLOAD_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "file": {"type": "string", "format": "binary"},
        "mode": {"type": "string"},
    },
    "required": ["name", "file"],
}

NO_TEXT_MESSAGE = (
    "Không đọc được chữ trong file. Hãy dùng file PDF/DOCX có chữ (không phải ảnh chụp) "
    "hoặc dán nội dung JD."
)


class RenameBody(BaseModel):
    name: str


class NewVersionBody(BaseModel):
    base_version: int
    requirements: JdRequirements


async def _get_jd(db: AsyncDatabase, user: User, jd_id: str) -> JdRecord:
    jd = await jds.get_jd(db, user.id, jd_id)
    if jd is None:
        raise AppError("not_found", 404, "Không tìm thấy JD.")
    return jd


def _check_paste(body: Any) -> tuple[str, str, str]:
    """(name, text, mode) from a pasted JD, or 422 listing every bad field."""
    if not isinstance(body, dict):
        raise AppError("validation_error", 422, "Dữ liệu chưa hợp lệ.")
    fields: dict[str, str] = {}
    raw_name = body.get("name")
    name = library.clean_name(raw_name) if isinstance(raw_name, str) else None
    if name is None:
        fields["name"] = library.NAME_ERROR
    raw_text = body.get("text")
    text = library.clean_jd_text(raw_text) if isinstance(raw_text, str) else None
    if text is None:
        fields["text"] = library.JD_TEXT_ERROR
    mode = library.parse_mode(body.get("mode"), library.JD_MODES)
    if mode is None:
        fields["mode"] = library.MODE_ERROR
    if fields:
        raise AppError("validation_error", 422, "Dữ liệu chưa hợp lệ.", fields)
    assert name is not None and text is not None and mode is not None
    return name, text, mode


async def _check_upload(form: FormData) -> tuple[str, str, str]:
    """(name, text, mode) from a JD file: the text is read here, in the request (a JD is
    short), and the file itself is not kept (api.md "JD")."""
    fields: dict[str, str] = {}
    raw_name = form.get("name")
    name = library.clean_name(raw_name) if isinstance(raw_name, str) else None
    if name is None:
        fields["name"] = library.NAME_ERROR
    mode = library.parse_mode(form.get("mode"), library.JD_MODES)
    if mode is None:
        fields["mode"] = library.MODE_ERROR
    upload = form.get("file")
    if not isinstance(upload, UploadFile):
        fields["file"] = "Chưa chọn file JD."
    if fields:
        raise AppError("validation_error", 422, "Dữ liệu chưa hợp lệ.", fields)
    assert name is not None and mode is not None and isinstance(upload, UploadFile)

    data, content_type = await read_upload(upload)
    document = await asyncio.to_thread(read_text, data, content_type)
    # Even `precise` reads the JD as text: a scanned JD is rare, pasting it is the way out.
    if not document.looks_readable or not document.text.strip():
        raise AppError("no_text_in_file", 422, NO_TEXT_MESSAGE)
    text = library.clean_jd_text(document.text)
    if text is None:  # not empty, so too long
        raise AppError(
            "validation_error",
            422,
            "Dữ liệu chưa hợp lệ.",
            {"file": "JD dài quá 20 000 ký tự. Hãy dán phần mô tả công việc và yêu cầu."},
        )
    return name, text, mode


@router.get("/jds")
async def list_jds(user: CurrentUser, db: Db) -> list[JdSummary]:
    return [jd.to_summary() for jd in await jds.list_jds(db, user.id)]


@router.post(
    "/jds",
    status_code=201,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/json": {"schema": PasteJdBody.model_json_schema()},
                "multipart/form-data": {"schema": _UPLOAD_SCHEMA},
            },
        }
    },
)
async def create_jd(request: Request, user: CurrentUser, db: Db) -> JdSummary:
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("multipart/form-data"):
        async with request.form() as form:
            name, text, mode = await _check_upload(form)
    elif content_type.startswith("application/json"):
        try:
            body = await request.json()
        except ValueError:
            raise AppError(
                "validation_error", 422, "Dữ liệu gửi lên không phải JSON hợp lệ."
            ) from None
        name, text, mode = _check_paste(body)
    else:
        raise AppError("unsupported_file", 415, "Hãy dán nội dung JD hoặc tải file PDF/DOCX.")
    jd = await jds.create_jd(db, user.id, name, text, mode=mode)
    return jd.to_summary()


@router.get("/jds/{jd_id}")
async def get_jd(jd_id: str, user: CurrentUser, db: Db) -> JdDetail:
    return (await _get_jd(db, user, jd_id)).to_detail()


@router.patch("/jds/{jd_id}")
async def rename_jd(jd_id: str, body: RenameBody, user: CurrentUser, db: Db) -> JdSummary:
    name = library.clean_name(body.name)
    if name is None:
        raise AppError(
            "validation_error", 422, "Dữ liệu chưa hợp lệ.", {"name": library.NAME_ERROR}
        )
    jd = await jds.rename_jd(db, user.id, jd_id, name)
    if jd is None:
        raise AppError("not_found", 404, "Không tìm thấy JD.")
    return jd.to_summary()


@router.get("/jds/{jd_id}/versions")
async def list_jd_versions(jd_id: str, user: CurrentUser, db: Db) -> list[VersionInfo]:
    jd = await _get_jd(db, user, jd_id)
    return await jds.list_versions(db, user.id, jd.id)


@router.get("/jds/{jd_id}/versions/{v}")
async def get_jd_version(jd_id: str, v: str, user: CurrentUser, db: Db) -> JdVersion:
    jd = await _get_jd(db, user, jd_id)
    number = versions.parse_version(v)
    if number == "latest":
        number = await jds.latest_version(db, jd.id)
    record = await jds.get_version(db, user.id, jd.id, number) if number else None
    if record is None:
        raise AppError("not_found", 404, "Không tìm thấy phiên bản yêu cầu JD.")
    return record.to_api()


@router.post("/jds/{jd_id}/versions", status_code=201)
async def save_jd_version(jd_id: str, body: NewVersionBody, user: CurrentUser, db: Db) -> JdVersion:
    jd = await _get_jd(db, user, jd_id)
    record = await versions.save_jd_version(
        db, user.id, jd.id, body.base_version, body.requirements
    )
    return record.to_api()


@router.get("/jds/{jd_id}/sessions")
async def list_jd_sessions(jd_id: str, user: CurrentUser, db: Db) -> list[Any]:
    await _get_jd(db, user, jd_id)
    return []  # sessions arrive with BE-6


@router.delete("/jds/{jd_id}", status_code=204)
async def delete_jd(jd_id: str, user: CurrentUser, db: Db) -> None:
    if not await library.delete_jd(db, user.id, jd_id):
        raise AppError("not_found", 404, "Không tìm thấy JD.")
