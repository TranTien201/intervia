"""A2, the code half: raw JD extraction → `JdRequirements` (docs/design/extraction.md 4.2).

The extractor has judged what the JD asks for; code decides what the web shows: numbers the
requirements, drops exact duplicates, and keeps a quote only when it is really in the JD.
Requirements are not grouped by topic here: that is A3's job. Pure functions (no DB, no
network). The fields the web does not show (responsibilities, level signals, stated level,
years, domain) stay in the version's raw `extraction` for A3.
"""

from dataclasses import dataclass
from typing import Any

from app.domain.quotes import QuoteChecker, normalize
from app.domain.text import TEXT_MAX, shorten
from app.schemas.extraction import JdExtraction, JdRequirementItem
from app.schemas.jd import JdRequirements, Requirement

NAME_FROM_TEXT_MAX = 80  # requirement name taken from the bullet itself when the label is empty
META_MAX = 120  # company / position shown in the library
# JdRequirements.requirements max_length; a longer list is cut, never rejected.
REQUIREMENTS_MAX = JdRequirements.model_fields["requirements"].metadata[0].max_length


@dataclass
class JdMeta:
    """What the `jds` document shows in the library, plus counts that are safe to log
    (never log the requirements themselves)."""

    company: str | None
    position: str | None
    requirement_count: int
    empty: int = 0  # dropped: neither name nor text
    merged: int = 0  # dropped: same name and text as an earlier requirement
    over_limit: int = 0  # dropped: past REQUIREMENTS_MAX
    quotes_not_found: int = 0  # kept without source_quote: the text is not in the JD


def parse_jd_extraction(data: dict[str, Any]) -> JdExtraction:
    """Validate the extractor's raw output. A missing list reads as empty (spike BE-4.3) and
    an `importance` outside 1–3 is clamped instead of failing the whole JD. Any other missing
    or wrong field still raises `ValidationError`."""
    data = {**data}
    for key in ("responsibilities", "requirements", "level_signals"):
        data.setdefault(key, [])
    requirements = data["requirements"]
    if isinstance(requirements, list):
        data["requirements"] = [_clamp_importance(item) for item in requirements]
    return JdExtraction.model_validate(data)


def _clamp_importance(item: Any) -> Any:
    if not isinstance(item, dict):
        return item
    value = item.get("importance")
    if isinstance(value, int | float) and not isinstance(value, bool):
        return {**item, "importance": min(3, max(1, round(value)))}
    return item


def build_requirements(extraction: JdExtraction, jd_text: str) -> tuple[JdRequirements, JdMeta]:
    meta = JdMeta(
        company=_meta_value(extraction.company),
        position=_meta_value(extraction.position),
        requirement_count=0,
    )
    in_jd = QuoteChecker(jd_text).found

    # Exact duplicates (same name and text after normalization) become the first one, with
    # the strongest kind and importance of the group. Different requirements are never merged.
    groups: dict[tuple[str, str], list[JdRequirementItem]] = {}
    for item in extraction.requirements:
        key = (normalize(item.name), normalize(item.text))
        if key == ("", ""):
            meta.empty += 1
            continue
        if key in groups:
            meta.merged += 1
        groups.setdefault(key, []).append(item)

    requirements: list[Requirement] = []
    for items in groups.values():
        if len(requirements) == REQUIREMENTS_MAX:
            meta.over_limit += 1
            continue
        first = items[0]
        text = first.text.strip()
        name = shorten(first.name.strip(), TEXT_MAX) or shorten(text, NAME_FROM_TEXT_MAX)
        found = in_jd(text)
        if not found:
            meta.quotes_not_found += 1
        requirements.append(
            Requirement(
                id=f"rq{len(requirements) + 1}",
                name=name,
                kind="required" if any(i.kind == "required" for i in items) else "preferred",
                importance=max(i.importance for i in items),
                source_quote=shorten(text, TEXT_MAX) if found else None,
            )
        )
    meta.requirement_count = len(requirements)
    return JdRequirements(requirements=requirements), meta


def _meta_value(value: str | None) -> str | None:
    value = (value or "").strip()[:META_MAX].strip()
    return value or None
