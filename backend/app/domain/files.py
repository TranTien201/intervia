"""Uploaded CV/JD files: type detection by content and file name cleanup.

The type is decided from the bytes, never from the extension or the browser's Content-Type:
both are whatever the client says.
"""

import io
import zipfile

PDF = "application/pdf"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

MAX_FILE_SIZE = 5 * 1024 * 1024
FILE_NAME_MAX = 255


def detect_content_type(data: bytes) -> str | None:
    """PDF or DOCX content type, or None for anything else (old .doc, images, other zips)."""
    if data.startswith(b"%PDF-"):
        return PDF
    if data.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                if "word/document.xml" in archive.namelist():
                    return DOCX
        except zipfile.BadZipFile:
            return None
    return None


def clean_file_name(raw: str | None, fallback: str = "file") -> str:
    """Base name only (browsers may send a full path, with either slash), at most 255 chars."""
    name = (raw or "").replace("\\", "/").rsplit("/", 1)[-1].strip()
    return name[:FILE_NAME_MAX] or fallback
