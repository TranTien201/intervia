"""Uploaded CV / JD files: the checks every upload route shares (size, then type by content)."""

from starlette.datastructures import UploadFile

from app.api.errors import AppError
from app.domain import files

_CHUNK = 1024 * 1024


async def read_upload(upload: UploadFile) -> tuple[bytes, str]:
    """(bytes, content type) of a PDF / DOCX upload, or 413 / 415."""
    data = await _read_limited(upload, files.MAX_FILE_SIZE)
    content_type = files.detect_content_type(data)
    if content_type is None:
        raise AppError("unsupported_file", 415, "Chỉ nhận file PDF hoặc DOCX.")
    return data, content_type


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
