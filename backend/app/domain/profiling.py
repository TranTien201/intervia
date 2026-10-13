"""A1, the code half: raw CV extraction → `CandidateProfile` (docs/design/extraction.md 4.1).

The extractor has judged what the CV says; code decides what the web shows: merges duplicate
skills, turns highlights into claims, and checks every quote against the document. Pure
functions (no DB, no network). The fields the web does not show (education, credentials,
seniority signals...) stay in the version's raw `extraction` for A3.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from app.domain.quotes import QuoteChecker, normalize
from app.providers.extract.base import Citation
from app.schemas.cv import CandidateProfile, Claim, Experience, Skill
from app.schemas.extraction import CvExtraction, ExperienceItem, SkillItem

STATEMENT_MAX = 200  # claim statement taken from the bullet itself when the extractor gave none
TEXT_MAX = 1000  # `Text` limit of every profile string; a longer bullet is cut, not rejected
_CURRENT = "nay"

# A citation that is only a field path ("experiences.0.kind") instead of document text; seen
# in ~25% of LlamaExtract citations on PDFs (spike BE-4.3, question 7).
_FIELD_PATH = re.compile(r"[a-z_]+(\.\d+|\[\d+\])(\.[a-z_]+(\.\d+|\[\d+\])?)*")


@dataclass
class ProfileStats:
    """Counts only, safe to log (never log the profile itself)."""

    skills_empty: int = 0  # dropped: empty name
    skills_merged: int = 0  # dropped: same name as an earlier skill
    experiences_empty: int = 0  # dropped: neither role nor organization
    claims_empty: int = 0  # dropped: metric / ownership highlight with no text
    claims_not_found: int = 0  # kept, but the quote is not in the document


def parse_cv_extraction(data: dict[str, Any]) -> CvExtraction:
    """Validate the extractor's raw output, reading a missing list as empty (spike BE-4.3:
    the extractor sometimes leaves out a key instead of returning []). Any other missing or
    wrong field still raises `ValidationError`."""
    data = {**data}
    for key in (
        "skills",
        "experiences",
        "seniority_signals",
        "education",
        "credentials",
        "languages",
    ):
        data.setdefault(key, [])
    experiences = data["experiences"]
    if isinstance(experiences, list):
        data["experiences"] = [
            {"technologies": [], "highlights": [], **item} if isinstance(item, dict) else item
            for item in experiences
        ]
    return CvExtraction.model_validate(data)


def build_profile(
    extraction: CvExtraction,
    citations: dict[str, list[Citation]],
    document_text: str | None,
) -> tuple[CandidateProfile, ProfileStats]:
    stats = ProfileStats()
    quote_in_doc = _quote_rule(document_text)

    def cited(*paths: str) -> str | None:
        """First citation of these fields that passes the quote rule, else None."""
        for path in paths:
            for citation in citations.get(path, []):
                text = citation.text.strip()
                if text and quote_in_doc(text):
                    return text
        return None

    skills = _skills(extraction.skills, cited, stats)
    experiences: list[Experience] = []
    claims: list[Claim] = []
    for index, item in enumerate(extraction.experiences):
        experience = _experience(item, index, cited)
        if experience is None:
            stats.experiences_empty += 1
        else:
            experiences.append(experience.model_copy(update={"id": f"ex{len(experiences) + 1}"}))
        # Claims come from every experience, even one dropped for having no title.
        for h_index, highlight in enumerate(item.highlights):
            if highlight.kind == "task":
                continue
            quote = highlight.text.strip()
            statement = _shorten((highlight.statement or "").strip(), TEXT_MAX) or _shorten(
                quote, STATEMENT_MAX
            )
            if not statement:
                stats.claims_empty += 1
                continue
            if document_text is not None:
                found = quote_in_doc(quote)
            else:
                found = cited(f"experiences[{index}].highlights[{h_index}].text") is not None
            if not found:
                stats.claims_not_found += 1
            claims.append(
                Claim(
                    id=f"cl{len(claims) + 1}",
                    statement=statement,
                    metric=_blank_to_none(highlight.metric),
                    subject=_blank_to_none(highlight.subject),
                    verifiable=highlight.kind == "metric",
                    source_quote=_shorten(quote, TEXT_MAX),
                    quote_status="found" if found else "not_found",
                )
            )
    profile = CandidateProfile(skills=skills, experiences=experiences, claims=claims)
    return profile, stats


def _quote_rule(document_text: str | None) -> Callable[[str], bool]:
    """With the document's text, a quote must be in it. Without (provider gave no parse),
    a citation is accepted unless it is only a field path."""
    if document_text is not None:
        return QuoteChecker(document_text).found
    return lambda quote: _FIELD_PATH.fullmatch(quote) is None


def _skills(
    items: list[SkillItem], cited: Callable[..., str | None], stats: ProfileStats
) -> list[Skill]:
    """One skill per name after normalization ("Postgre SQL" and "PostgreSQL" stay apart: no
    guessing). The skills-section entry wins; `years` is the largest stated."""
    groups: dict[str, list[int]] = {}  # key -> indexes into items, in order
    for index, item in enumerate(items):
        key = normalize(item.name)
        if not key:
            stats.skills_empty += 1
            continue
        if key in groups:
            stats.skills_merged += 1
        groups.setdefault(key, []).append(index)

    skills: list[Skill] = []
    for indexes in groups.values():
        kept = next((i for i in indexes if items[i].source == "skills_section"), indexes[0])
        years = [items[i].years for i in indexes if items[i].years is not None]
        # The kept entry's quote first, then any duplicate's.
        order = [kept, *(i for i in indexes if i != kept)]
        skills.append(
            Skill(
                id=f"sk{len(skills) + 1}",
                name=items[kept].name.strip(),
                years=max(years) if years else None,
                source_quote=cited(*(f"skills[{i}].name" for i in order)),
            )
        )
    return skills


def _experience(
    item: ExperienceItem, index: int, cited: Callable[..., str | None]
) -> Experience | None:
    name, owner = item.name.strip(), (item.organization or "").strip()
    # A project done for a company keeps its own name: "role @ company" alone would lose it.
    if owner and name and normalize(owner) != normalize(name):
        organization = f"{name} ({owner})"
    else:
        organization = owner or name
    role = (item.role or "").strip()
    if not organization and not role:
        return None
    path = f"experiences[{index}]"
    return Experience(
        id="",  # numbered by the caller, after empty experiences are dropped
        organization=organization,
        role=role,
        period=(item.period or "").strip() or _period(item),
        technologies=_unique(item.technologies),
        source_quote=cited(f"{path}.role", f"{path}.name", f"{path}.organization"),
    )


def _period(item: ExperienceItem) -> str:
    """Built from the normalized dates when the CV's own wording was not extracted."""
    start, end = _month_year(item.start), _month_year(item.end)
    if item.is_current:
        end = _CURRENT
    if start and end:
        return f"{start} – {end}"
    return start or end


def _month_year(value: str | None) -> str:
    """'2022-03' → '03/2022'; 'YYYY' and anything unexpected are kept as is."""
    value = (value or "").strip()
    match = re.fullmatch(r"(\d{4})-(\d{2})", value)
    return f"{match[2]}/{match[1]}" if match else value


def _unique(names: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for name in names:
        key = normalize(name)
        if key and key not in seen:
            seen.add(key)
            out.append(name.strip())
    return out


def _shorten(text: str, limit: int) -> str:
    """Cut at a word boundary, adding '…' when cut."""
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    if " " in cut and not text[limit - 1].isspace():
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,;:-") + "…"


def _blank_to_none(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None
