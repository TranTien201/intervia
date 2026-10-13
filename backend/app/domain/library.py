"""CV & JD library rules shared by the routes: input checks and multi-step deletion."""

from typing import get_args

from app.schemas.analysis import NAME_MAX, ExtractionMode

NAME_ERROR = f"Tên phải dài từ 1 đến {NAME_MAX} ký tự."
MODE_ERROR = "Chế độ phân tích không hợp lệ."

CV_MODES: tuple[ExtractionMode, ...] = get_args(ExtractionMode)
# A JD is always text, so "read the layout" has nothing to read (extraction.md section 8).
JD_MODES: tuple[ExtractionMode, ...] = ("standard", "precise")


def clean_name(raw: str | None) -> str | None:
    """Trimmed name, or None when empty or too long."""
    name = (raw or "").strip()
    return name if 1 <= len(name) <= NAME_MAX else None


def parse_mode(raw: str | None, allowed: tuple[ExtractionMode, ...]) -> ExtractionMode | None:
    """`standard` when not given; None when the value is not allowed."""
    if raw is None or raw == "":
        return "standard"
    return raw if raw in allowed else None  # type: ignore[return-value]
