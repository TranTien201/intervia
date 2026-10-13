"""Versioned prompts: one Markdown file per version, `{name}_v{N}.md` in this folder.

Never edit a prompt version once real data was produced with it; add `_v{N+1}` instead,
because stored results record the version they used (to rerun and compare).
"""

import re
from dataclasses import dataclass
from functools import cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).parent


@dataclass(frozen=True)
class Prompt:
    text: str
    version: str  # file stem, e.g. "cv_extract_v1"


@cache
def load_prompt(name: str) -> Prompt:
    """Latest version of prompt `name`, e.g. "cv_extract" -> cv_extract_v{highest N}.md."""
    pattern = re.compile(rf"{re.escape(name)}_v(\d+)")
    versions = [
        (int(m.group(1)), path)
        for path in PROMPTS_DIR.glob(f"{name}_v*.md")
        if (m := pattern.fullmatch(path.stem))
    ]
    if not versions:
        raise FileNotFoundError(f"No prompt named {name!r} in {PROMPTS_DIR}")
    _, path = max(versions)
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        raise ValueError(f"Prompt file {path.name} is empty")
    return Prompt(text=text, version=path.stem)
