"""Read the text of an uploaded PDF / DOCX locally, without any outside service.

Used by the `standard` extraction mode (send the text instead of the file, docs/design/
extraction.md section 8) and for JD files. CPU-bound and synchronous: call it from async
code through `asyncio.to_thread`.
"""

import io
import logging
import re
import unicodedata
from dataclasses import dataclass

import docx
from docx.table import Table
from pypdf import PageObject, PdfReader

from app.domain.files import DOCX, PDF

log = logging.getLogger(__name__)

# Provisional thresholds (extraction.md section 8, "Chưa chốt"): set them from real scanned,
# two-column and Vietnamese CVs. Below MIN_CHARS_PER_PAGE the PDF is most likely a scan.
MIN_CHARS_PER_PAGE = 100
# Share of characters that never appear in readable text: a broken font encoding.
MAX_ODD_CHAR_RATIO = 0.02


@dataclass(frozen=True)
class DocumentText:
    text: str
    page_count: int  # 1 for DOCX, which has no fixed pages
    looks_readable: bool  # False: send the original file instead (scan, broken font)


def read_text(content: bytes, content_type: str) -> DocumentText:
    """Text of a PDF or DOCX (`content_type` from `domain.files.detect_content_type`).

    A file the library cannot open is reported as unreadable, not raised: the extractor
    may still read the original file.
    """
    readers = {PDF: _read_pdf, DOCX: _read_docx}
    if content_type not in readers:
        raise ValueError(f"Unsupported content type: {content_type}")
    try:
        raw, page_count = readers[content_type](content)
    except Exception as e:  # untrusted file: pypdf / python-docx raise many kinds of errors
        log.warning("Could not read %s locally: %s", content_type, type(e).__name__)
        return DocumentText(text="", page_count=0, looks_readable=False)
    text = squeeze(raw)
    readable = _readable(text, page_count)
    return DocumentText(text=text, page_count=page_count, looks_readable=readable)


def squeeze(raw: str) -> str:
    """NFC, spaces collapsed per line, at most one blank line in a row.

    Billing for text input is per 600 tokens, so padding costs credits.
    """
    lines = [re.sub(r"[ \t\xa0]+", " ", line).strip() for line in raw.splitlines()]
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    return unicodedata.normalize("NFC", text)


def _read_pdf(content: bytes) -> tuple[str, int]:
    pages = PdfReader(io.BytesIO(content)).pages
    return "\n\n".join(_page_text(page) for page in pages), len(pages)


def _page_text(page: PageObject) -> str:
    """One page's text; a page pypdf cannot read (e.g. an image-only page with no content
    stream) counts as empty instead of losing the whole file."""
    try:
        return page.extract_text(extraction_mode="layout") or ""
    except Exception:
        return ""


def _read_docx(content: bytes) -> tuple[str, int]:
    """Body paragraphs and tables in document order (CVs often lay out sections in tables).

    Headers and footers are skipped: they mostly hold contact details, which the extractor
    does not need. Counted as one page: DOCX has no fixed pages.
    """
    blocks: list[str] = []
    for block in docx.Document(io.BytesIO(content)).iter_inner_content():
        blocks.extend(_table_lines(block) if isinstance(block, Table) else [block.text])
    return "\n".join(blocks), 1


def _table_lines(table: Table) -> list[str]:
    lines = []
    for row in table.rows:
        # A merged cell is returned once per grid column it spans: keep it once.
        cells = list(dict.fromkeys(cell.text.strip() for cell in row.cells))
        lines.append(" | ".join(c for c in cells if c))
    return lines


def _is_odd(char: str) -> bool:
    if char in "\n\t":
        return False
    return char == "�" or unicodedata.category(char) in ("Co", "Cc")  # private use, control


def _readable(text: str, page_count: int) -> bool:
    if len(text) < MIN_CHARS_PER_PAGE * max(page_count, 1):
        return False
    odd = sum(1 for char in text if _is_odd(char))
    return odd / len(text) <= MAX_ODD_CHAR_RATIO
