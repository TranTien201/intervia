"""CV library endpoints, contract in docs/design/api.md section "CV"."""

from collections.abc import AsyncIterator
from typing import Annotated, Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from gridfs.asynchronous.grid_file import AsyncGridOut
from pydantic import BaseModel
from pymongo.asynchronous.database import AsyncDatabase

from app.api.deps import current_user, get_db
from app.api.errors import AppError
from app.db import cvs
from app.domain import files, library, versions
from app.schemas.analysis import VersionInfo
from app.schemas.cv import CandidateProfile, CvRecord, CvSummary, CvVersion
from app.schemas.user import User

router = APIRouter(tags=["cvs"])

Db = Annotated[AsyncDatabase, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]

_CHUNK = 1024 * 1024


class RenameBody(BaseModel):
    name: str


class NewVersionBody(BaseModel):
    base_version: int
    profile: CandidateProfile


async def _get_cv(db: AsyncDatabase, user: User, cv_id: str) -> CvRecord:
    cv = await cvs.get_cv(db, user.id, cv_id)
    if cv is None:
        raise AppError("not_found", 404, "Không tìm thấy CV.")
    return cv


async def _read_limited(upload: UploadFile, limit: int) -> bytes:
    """Read in chunks and stop as soon as the size passes `limit`."""
    chunks: list[bytes] = []
    size = 0
    while chunk := await upload.read(_CHUNK):
        size += len(chunk)
        if size > limit:
            raise AppError("file_too_large", 413, "File lớn hơn 5 MB.")
        chunks.append(chunk)
    return b"".join(chunks)


@router.get("/cvs")
async def list_cvs(user: CurrentUser, db: Db) -> list[CvSummary]:
    return [cv.to_summary() for cv in await cvs.list_cvs(db, user.id)]


@router.post("/cvs", status_code=201)
async def upload_cv(
    user: CurrentUser,
    db: Db,
    file: Annotated[UploadFile | None, File()] = None,
    name: Annotated[str | None, Form()] = None,
    mode: Annotated[str | None, Form()] = None,
) -> CvSummary:
    fields: dict[str, str] = {}
    clean_name = library.clean_name(name)
    if clean_name is None:
        fields["name"] = library.NAME_ERROR
    clean_mode = library.parse_mode(mode, library.CV_MODES)
    if clean_mode is None:
        fields["mode"] = library.MODE_ERROR
    if file is None:
        fields["file"] = "Chưa chọn file CV."
    if fields:
        raise AppError("validation_error", 422, "Dữ liệu chưa hợp lệ.", fields)
    assert file is not None and clean_name is not None and clean_mode is not None

    data = await _read_limited(file, files.MAX_FILE_SIZE)
    content_type = files.detect_content_type(data)
    if content_type is None:
        raise AppError("unsupported_file", 415, "Chỉ nhận file PDF hoặc DOCX.")

    cv = await cvs.create_cv(
        db,
        user.id,
        clean_name,
        files.clean_file_name(file.filename, fallback="cv"),
        content_type,
        data,
        mode=clean_mode,
    )
    return cv.to_summary()


@router.get("/cvs/{cv_id}")
async def get_cv(cv_id: str, user: CurrentUser, db: Db) -> CvSummary:
    return (await _get_cv(db, user, cv_id)).to_summary()


@router.patch("/cvs/{cv_id}")
async def rename_cv(cv_id: str, body: RenameBody, user: CurrentUser, db: Db) -> CvSummary:
    name = library.clean_name(body.name)
    if name is None:
        raise AppError(
            "validation_error", 422, "Dữ liệu chưa hợp lệ.", {"name": library.NAME_ERROR}
        )
    cv = await cvs.rename_cv(db, user.id, cv_id, name)
    if cv is None:
        raise AppError("not_found", 404, "Không tìm thấy CV.")
    return cv.to_summary()


async def _iter_file(stream: AsyncGridOut) -> AsyncIterator[bytes]:
    while chunk := await stream.readchunk():
        yield chunk


@router.get("/cvs/{cv_id}/file")
async def download_cv_file(cv_id: str, user: CurrentUser, db: Db) -> StreamingResponse:
    cv = await _get_cv(db, user, cv_id)
    stream = await cvs.open_file(db, cv.file_id)
    headers = {
        # RFC 5987 form so Vietnamese file names survive.
        "Content-Disposition": f"inline; filename*=UTF-8''{quote(cv.file_name, safe='')}",
        "Content-Length": str(cv.size),
        "X-Content-Type-Options": "nosniff",
    }
    return StreamingResponse(_iter_file(stream), media_type=cv.content_type, headers=headers)


@router.get("/cvs/{cv_id}/versions")
async def list_cv_versions(cv_id: str, user: CurrentUser, db: Db) -> list[VersionInfo]:
    cv = await _get_cv(db, user, cv_id)
    return await cvs.list_versions(db, user.id, cv.id)


@router.get("/cvs/{cv_id}/versions/{v}")
async def get_cv_version(cv_id: str, v: str, user: CurrentUser, db: Db) -> CvVersion:
    cv = await _get_cv(db, user, cv_id)
    number = versions.parse_version(v)
    if number == "latest":
        number = await cvs.latest_version(db, cv.id)
    record = await cvs.get_version(db, user.id, cv.id, number) if number else None
    if record is None:
        raise AppError("not_found", 404, "Không tìm thấy phiên bản hồ sơ.")
    return record.to_api()


@router.post("/cvs/{cv_id}/versions", status_code=201)
async def save_cv_version(cv_id: str, body: NewVersionBody, user: CurrentUser, db: Db) -> CvVersion:
    cv = await _get_cv(db, user, cv_id)
    record = await versions.save_cv_version(db, user.id, cv.id, body.base_version, body.profile)
    return record.to_api()


@router.get("/cvs/{cv_id}/sessions")
async def list_cv_sessions(cv_id: str, user: CurrentUser, db: Db) -> list[Any]:
    await _get_cv(db, user, cv_id)
    return []  # sessions arrive with BE-6
