"""JD library endpoints, contract in docs/design/api.md section "JD"."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from pymongo.asynchronous.database import AsyncDatabase

from app.api.deps import current_user, get_db
from app.api.errors import AppError
from app.db import jds
from app.domain import library, versions
from app.schemas.analysis import VersionInfo
from app.schemas.jd import JdDetail, JdRecord, JdRequirements, JdSummary, JdVersion
from app.schemas.user import User

router = APIRouter(tags=["jds"])

Db = Annotated[AsyncDatabase, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]


class PasteJdBody(BaseModel):
    """`POST /api/jds` with JSON. Documented here; the route parses the body by hand because
    the same path also takes multipart (file upload, BE-4.6)."""

    name: str
    text: str
    mode: str | None = None


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


@router.get("/jds")
async def list_jds(user: CurrentUser, db: Db) -> list[JdSummary]:
    return [jd.to_summary() for jd in await jds.list_jds(db, user.id)]


@router.post(
    "/jds",
    status_code=201,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": PasteJdBody.model_json_schema()}},
        }
    },
)
async def create_jd(request: Request, user: CurrentUser, db: Db) -> JdSummary:
    content_type = request.headers.get("content-type", "")
    if not content_type.startswith("application/json"):
        # multipart (JD as a file) arrives with BE-4.6.
        raise AppError("unsupported_file", 415, "Chưa hỗ trợ thêm JD bằng file, hãy dán nội dung.")
    try:
        body = await request.json()
    except ValueError:
        raise AppError("validation_error", 422, "Dữ liệu gửi lên không phải JSON hợp lệ.") from None
    name, text, mode = _check_paste(body)
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
