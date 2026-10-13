"""CV & JD library rules shared by the routes: input checks and multi-step deletion."""

from typing import get_args

from app.schemas.analysis import NAME_MAX, ExtractionMode
from app.schemas.jd import JD_TEXT_MAX

NAME_ERROR = f"Tên phải dài từ 1 đến {NAME_MAX} ký tự."
MODE_ERROR = "Chế độ phân tích không hợp lệ."
JD_TEXT_ERROR = "Nội dung JD phải dài từ 1 đến 20 000 ký tự."  # JD_TEXT_MAX

CV_MODES: tuple[ExtractionMode, ...] = get_args(ExtractionMode)
# A JD is always text, so "read the layout" has nothing to read (extraction.md section 8).
JD_MODES: tuple[ExtractionMode, ...] = ("standard", "precise")


def clean_name(raw: str | None) -> str | None:
    """Trimmed name, or None when empty or too long."""
    name = (raw or "").strip()
    return name if 1 <= len(name) <= NAME_MAX else None


def clean_jd_text(raw: str | None) -> str | None:
    """Unix line ends, trimmed; None when empty or longer than the JD limit."""
    text = (raw or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    return text if 1 <= len(text) <= JD_TEXT_MAX else None


def parse_mode(raw: object, allowed: tuple[ExtractionMode, ...]) -> ExtractionMode | None:
    """`standard` when not given; None when the value is not allowed."""
    if raw is None or raw == "":
        return "standard"
    return raw if isinstance(raw, str) and raw in allowed else None  # type: ignore[return-value]
