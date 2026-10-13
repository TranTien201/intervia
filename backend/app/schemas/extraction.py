"""Raw extraction output from LlamaExtract (docs/design/extraction.md sections 2-3).

These models are the contract with the extractor: the JSON Schema sent to LlamaExtract is
generated from them, and its output is validated by them. LlamaExtract reads every field
`description` as an instruction, so descriptions are part of the prompt.

Every field is required (nullable ones included) so the extractor always returns each key,
using null or [] when the document does not say. Conversion to the web types
(`CandidateProfile`, `JdRequirements`) happens in the domain layer, not here.

Versioning: once real data exists, never edit a released schema; add a new version
(`cv-2`) instead, because stored analyses record the version they used.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field

CV_SCHEMA_VERSION = "cv-1"
JD_SCHEMA_VERSION = "jd-1"

DocLanguage = Literal["vi", "en", "mixed"]

_VERBATIM = "Copied verbatim from the document, same language, no translation or rewording."
_LANGUAGE = (
    "Main language of the document: 'vi' (Vietnamese), 'en' (English), or 'mixed' when "
    "large parts are written in each. Technical terms in English do not make it 'mixed'."
)

# ---------------------------------------------------------------------------
# CV
# ---------------------------------------------------------------------------


class SkillItem(BaseModel):
    """One skill or technology named in the CV."""

    name: str = Field(
        description=(
            "Skill or technology name exactly as written in the CV, e.g. 'PostgreSQL', "
            "'Spring Boot'. Do not normalize, translate or expand abbreviations. "
            "List each name only once across the whole skills list."
        )
    )
    source: Literal["skills_section", "experience"] = Field(
        description=(
            "'skills_section' if the name appears in a skills / technologies section of the CV. "
            "'experience' if it appears only inside a work experience or project (e.g. a "
            "technology used in a project but not listed in the skills section)."
        )
    )
    group: str | None = Field(
        description=(
            "The CV's own group heading this skill is listed under, verbatim, e.g. 'Database', "
            "'Ngôn ngữ lập trình'. null if the CV gives no group or the source is 'experience'."
        )
    )
    proficiency: str | None = Field(
        description=(
            "Proficiency level exactly as the CV writes it for this skill, e.g. 'Thành thạo', "
            "'Advanced', '4/5'. null if the CV does not state one. Never infer or invent a level."
        )
    )
    years: float | None = Field(
        description=(
            "Years of experience with this skill, only if the CV states it explicitly for this "
            "skill (e.g. 'Java (3 năm)' -> 3). null otherwise; never compute it from job dates."
        )
    )


class Highlight(BaseModel):
    """One bullet point (or sentence) describing what the candidate did in an experience."""

    text: str = Field(
        description=(
            f"One bullet point of the experience. {_VERBATIM} Do not fix spelling, do not merge "
            "or split bullets."
        )
    )
    kind: Literal["metric", "ownership", "task"] = Field(
        description=(
            "'metric': contains a number or measurable result (e.g. 'Giảm 40% độ trễ API'). "
            "'ownership': the candidate designed, built, led or was the main owner of something, "
            "with no measurable result (e.g. 'Thiết kế hệ thống thanh toán'). "
            "'task': an ordinary duty description (e.g. 'Viết API cho ứng dụng di động'). "
            "If a bullet has both a number and ownership, use 'metric'."
        )
    )
    statement: str | None = Field(
        description=(
            "Only for kind 'metric' or 'ownership': a short restatement of the bullet in at most "
            "15 words, same language, made only by shortening the bullet; never add information "
            "that is not in it. null for kind 'task'."
        )
    )
    metric: str | None = Field(
        description=(
            "The number or measurable result, verbatim, e.g. '40%', '2 triệu/ngày', '10k RPS'. "
            "null if the bullet has none."
        )
    )
    subject: str | None = Field(
        description=(
            "What the metric is about, using the bullet's own words, e.g. 'độ trễ p95 API'. "
            "null if there is no metric."
        )
    )


class ExperienceItem(BaseModel):
    """One job, internship, freelance engagement or project."""

    kind: Literal["work", "internship", "freelance", "project"] = Field(
        description=(
            "'work': a job at a company. 'internship': an internship. 'freelance': freelance or "
            "contract work. 'project': a personal project, graduation project, or a project "
            "listed separately (including projects done inside a company)."
        )
    )
    name: str = Field(
        description=(
            "Company name for work / internship / freelance; project name for a project. "
            "Verbatim as written in the CV."
        )
    )
    organization: str | None = Field(
        description=(
            "For a project: the company or organization it was done for, if the CV says so. "
            "null otherwise (always null for work / internship / freelance)."
        )
    )
    role: str | None = Field(
        description="Job title or role in this experience, verbatim. null if not written."
    )
    period: str | None = Field(
        description=(
            "Time period exactly as written, e.g. '03/2022 – nay', 'Jan 2021 - Dec 2022'. "
            "null if not written."
        )
    )
    start: str | None = Field(
        description=(
            "Start date normalized to 'YYYY-MM' (or 'YYYY' if the month is not written), "
            "e.g. '03/2022' -> '2022-03'. null if not written."
        )
    )
    end: str | None = Field(
        description=(
            "End date normalized to 'YYYY-MM' (or 'YYYY' if the month is not written). "
            "null when the experience is current ('nay', 'present', 'hiện tại') or the end "
            "is not written."
        )
    )
    is_current: bool = Field(
        description=(
            "true only if the CV marks this experience as ongoing ('nay', 'hiện tại', 'present', "
            "'now'). false otherwise, including when the end date is simply missing."
        )
    )
    team_size: int | None = Field(
        description="Team size, only if the CV states a number. null otherwise."
    )
    technologies: list[str] = Field(
        description=(
            "Technologies, tools and languages named in this experience, verbatim, each once. "
            "Empty list if none are named."
        )
    )
    highlights: list[Highlight] = Field(
        description=(
            "Every bullet point or descriptive sentence of this experience, in the CV's order. "
            "Do not skip, merge or summarize bullets. Empty list if there are none."
        )
    )


class SenioritySignal(BaseModel):
    """A sentence showing seniority (leading, mentoring, architecture, scale, cross-team)."""

    kind: Literal["lead_team", "mentoring", "architecture", "scale", "cross_team"] = Field(
        description=(
            "'lead_team': leads or manages a team. 'mentoring': mentors, trains or reviews "
            "others. 'architecture': designs system architecture or makes technical decisions. "
            "'scale': works with large scale (traffic, data, users). 'cross_team': coordinates "
            "with other teams or stakeholders."
        )
    )
    text: str = Field(
        description=(
            f"The sentence or phrase showing this signal, from the headline, summary or any "
            f"experience. {_VERBATIM}"
        )
    )


class EducationItem(BaseModel):
    """One school, university or training program. Never extract GPA or course lists."""

    institution: str = Field(description="School or university name, verbatim.")
    degree: str | None = Field(
        description="Degree, verbatim, e.g. 'Kỹ sư', 'Bachelor'. null if not written."
    )
    major: str | None = Field(description="Major or field of study, verbatim. null if not written.")
    period: str | None = Field(
        description="Study period exactly as written, e.g. '2016 - 2020'. null if not written."
    )


class CredentialItem(BaseModel):
    """One certificate or award."""

    kind: Literal["certificate", "award"] = Field(
        description="'certificate' for certifications and courses; 'award' for prizes and awards."
    )
    name: str = Field(description="Certificate or award name, verbatim.")
    issuer: str | None = Field(
        description="Issuing organization, verbatim, e.g. 'AWS'. null if not written."
    )
    year: int | None = Field(description="Year obtained, if written. null otherwise.")


class LanguageItem(BaseModel):
    """One spoken / written language (not a programming language)."""

    name: str = Field(description="Language name, verbatim, e.g. 'Tiếng Anh', 'Japanese'.")
    level: str | None = Field(
        description="Level exactly as written, e.g. 'IELTS 7.0', 'N2', 'Giao tiếp'. null if none."
    )


class CvExtraction(BaseModel):
    """Structured data extracted from a CV for an interview practice system."""

    headline: str | None = Field(
        description=(
            "The job title the CV gives the candidate, verbatim, e.g. 'Senior Backend Engineer'. "
            "null if the CV has none."
        )
    )
    stated_years: float | None = Field(
        description=(
            "Total years of professional experience, only if the CV states it in words "
            "(e.g. '5 năm kinh nghiệm' -> 5). null otherwise; never compute it from job dates."
        )
    )
    cv_language: DocLanguage = Field(description=_LANGUAGE)
    skills: list[SkillItem] = Field(
        description=(
            "Every skill and technology in the CV: those in the skills section and those only "
            "mentioned inside experiences. Each name appears once. Soft skills are included "
            "only if the CV lists them."
        )
    )
    experiences: list[ExperienceItem] = Field(
        description="Every job, internship, freelance engagement and project, in the CV's order."
    )
    seniority_signals: list[SenioritySignal] = Field(
        description=(
            "Phrases showing seniority (leading a team, mentoring, architecture, scale, "
            "cross-team work). Empty list if none."
        )
    )
    education: list[EducationItem] = Field(
        description="Education entries. Never include GPA or course lists."
    )
    credentials: list[CredentialItem] = Field(description="Certificates and awards.")
    languages: list[LanguageItem] = Field(
        description="Spoken / written languages (not programming languages)."
    )


# ---------------------------------------------------------------------------
# JD
# ---------------------------------------------------------------------------


class JdRequirementItem(BaseModel):
    """One requirement from the requirements or nice-to-have section of the JD."""

    name: str = Field(
        description=(
            "Short label of at most 8 words made only by shortening the JD's own wording, same "
            "language, e.g. 'PostgreSQL, tối ưu truy vấn'. Never rename to other words, never "
            "merge several requirements into one label."
        )
    )
    text: str = Field(
        description=(
            f"The JD bullet this requirement comes from. {_VERBATIM} When one bullet lists "
            "several independent skills, each resulting requirement repeats the same text."
        )
    )
    kind: Literal["required", "preferred"] = Field(
        description=(
            "'preferred' if the JD marks it as optional: 'là lợi thế', 'ưu tiên', "
            "'nice to have', 'a plus', 'bonus', or it is in a nice-to-have section. "
            "'required' otherwise."
        )
    )
    importance: Literal[1, 2, 3] = Field(
        description=(
            "3: emphasized by the JD ('thành thạo', 'sâu', 'must', 'strong', 'deep', 'expert'). "
            "2: plainly listed. 1: minor, or any 'preferred' requirement."
        )
    )


class JdResponsibility(BaseModel):
    """One duty from the job description / responsibilities section."""

    text: str = Field(description=f"One bullet of the responsibilities section. {_VERBATIM}")


class JdExtraction(BaseModel):
    """Structured data extracted from a job description for an interview practice system."""

    company: str | None = Field(description="Hiring company name, verbatim. null if not written.")
    position: str | None = Field(
        description="Position title, verbatim, e.g. 'Backend Engineer'. null if not written."
    )
    stated_level: str | None = Field(
        description=(
            "Seniority level, only if the JD states it, verbatim, e.g. 'Senior', 'Junior'. "
            "null otherwise; never infer it."
        )
    )
    years_required: float | None = Field(
        description=(
            "Minimum years of experience required, only if written, e.g. '3+ năm' -> 3. "
            "null otherwise."
        )
    )
    domain: str | None = Field(
        description=(
            "Business domain of the job, only if written, in the JD's words, e.g. 'thanh toán', "
            "'fintech', 'e-commerce'. null otherwise."
        )
    )
    jd_language: DocLanguage = Field(description=_LANGUAGE)
    responsibilities: list[JdResponsibility] = Field(
        description="Every bullet of the duties / responsibilities section, in order."
    )
    requirements: list[JdRequirementItem] = Field(
        description=(
            "Skill and knowledge requirements, taken ONLY from the requirements and "
            "nice-to-have sections, never derived from responsibilities or the company "
            "description. Years of experience and mentoring / leading go to level_signals, "
            "not here."
        )
    )
    level_signals: list[str] = Field(
        description=(
            "Phrases about seniority rather than a specific skill, verbatim, e.g. "
            "'3+ năm kinh nghiệm backend', 'Mentor các bạn junior', 'dẫn dắt team'. "
            "Empty list if none."
        )
    )


# ---------------------------------------------------------------------------
# JSON Schema sent to LlamaExtract
# ---------------------------------------------------------------------------

# LlamaExtract supports a subset of JSON Schema: it uses key names, type and description;
# formatting / default / validation keywords are not supported. Keep only what it reads.
_KEPT_KEYWORDS = {"type", "description", "properties", "required", "items", "anyOf", "enum"}


def _simplify(node: Any, defs: dict[str, Any]) -> Any:
    """Inline `$ref`s and drop keywords LlamaExtract does not use (title, default, $defs...)."""
    if isinstance(node, list):
        return [_simplify(item, defs) for item in node]
    if not isinstance(node, dict):
        return node
    if "$ref" in node:
        target = defs[node["$ref"].removeprefix("#/$defs/")]
        # Keywords next to the $ref (e.g. the field's own description) override the target's.
        node = {**target, **{k: v for k, v in node.items() if k != "$ref"}}
    out: dict[str, Any] = {}
    for key, value in node.items():
        if key not in _KEPT_KEYWORDS:
            continue
        if key == "properties":
            # Keys here are field names, not keywords: keep all of them.
            out[key] = {name: _simplify(prop, defs) for name, prop in value.items()}
        else:
            out[key] = _simplify(value, defs)
    return out


def to_extract_schema(model: type[BaseModel]) -> dict[str, Any]:
    """JSON Schema for `model` in the subset LlamaExtract supports."""
    schema = model.model_json_schema()
    return _simplify(schema, schema.get("$defs", {}))


def cv_json_schema() -> dict[str, Any]:
    return to_extract_schema(CvExtraction)


def jd_json_schema() -> dict[str, Any]:
    return to_extract_schema(JdExtraction)
