"""CV & JD library rules shared by the routes: input checks and multi-step deletion."""

from typing import get_args

from pymongo.asynchronous.database import AsyncDatabase

from app.db import cvs, jds, llm_calls
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


async def delete_cv(db: AsyncDatabase, user_id: str, cv_id: str) -> bool:
    """Delete a CV and everything derived from it. False if there is no such CV.

    No transactions, so the order matters: the `cvs` document goes last and is marked
    `deleting` first. A run cut off anywhere leaves that marked document behind (hidden from
    every read), and running this again finishes the job; every step tolerates data that an
    earlier run already removed.
    """
    cv = await cvs.mark_deleting(db, user_id, cv_id)  # 1. hide; running analysis stops (4.7)
    if cv is None:
        return False
    # 2. (BE-8) delete the sessions using this CV, with their audio files.
    await cvs.delete_versions(db, cv.id)  # 3.
    await llm_calls.delete_for_ref(db, "cv", cv.id)  # 4. extraction outputs (CV content)
    await cvs.delete_file(db, cv.file_id)  # 5.
    await cvs.delete_cv_document(db, cv.id)  # 6. last
    return True


async def delete_jd(db: AsyncDatabase, user_id: str, jd_id: str) -> bool:
    """Same order as `delete_cv`, without a stored file."""
    jd = await jds.mark_deleting(db, user_id, jd_id)
    if jd is None:
        return False
    # (BE-8) delete the sessions using this JD.
    await jds.delete_versions(db, jd.id)
    await llm_calls.delete_for_ref(db, "jd", jd.id)
    await jds.delete_jd_document(db, jd.id)
    return True
