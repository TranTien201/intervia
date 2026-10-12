"""Error responses in the shape from docs/design/api.md:
{"error": {"code": "...", "message": "...", "fields": {...}?}}
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger(__name__)

_STATUS_CODES = {
    401: "unauthenticated",
    404: "not_found",
    405: "method_not_allowed",
    413: "file_too_large",
    415: "unsupported_file",
    422: "validation_error",
}


class AppError(Exception):
    """Raise from routes/domain for an expected error with a known `code`."""

    def __init__(
        self, code: str, status: int, message: str = "", fields: dict[str, str] | None = None
    ) -> None:
        super().__init__(message or code)
        self.code = code
        self.status = status
        self.message = message
        self.fields = fields


def _body(code: str, message: str, fields: dict[str, str] | None = None) -> dict:
    error: dict = {"code": code, "message": message}
    if fields:
        error["fields"] = fields
    return {"error": error}


async def _app_error(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(_body(exc.code, exc.message, exc.fields), status_code=exc.status)


async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    fallback = "internal_error" if exc.status_code >= 500 else "error"
    code = _STATUS_CODES.get(exc.status_code, fallback)
    return JSONResponse(_body(code, str(exc.detail)), status_code=exc.status_code)


async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    fields: dict[str, str] = {}
    for err in exc.errors():
        # Drop the location prefix ("body", "query", ...) so keys are plain field names.
        loc = [str(p) for p in err["loc"][1:]] or [str(p) for p in err["loc"]]
        fields.setdefault(".".join(loc), err["msg"])
    return JSONResponse(
        _body("validation_error", "Dữ liệu gửi lên không hợp lệ.", fields), status_code=422
    )


async def _unhandled_error(_: Request, exc: Exception) -> JSONResponse:
    log.exception("Unhandled error")
    return JSONResponse(_body("internal_error", "Đã có lỗi xảy ra."), status_code=500)


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(Exception, _unhandled_error)
