import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.domain.profiling import STATEMENT_MAX, build_profile, parse_cv_extraction
from app.providers.extract.base import Citation
from app.schemas.cv import CandidateProfile
from app.schemas.extraction import CvExtraction

FAKE_CV = Path(__file__).parents[1] / "app/providers/extract/fake_data/cv_basic.json"


def skill(name: str, source: str = "skills_section", years: float | None = None) -> dict:
    return {"name": name, "source": source, "group": None, "proficiency": None, "years": years}


def highlight(text: str, kind: str = "task", statement: str | None = None, **extra: Any) -> dict:
    return {
        "text": text,
        "kind": kind,
        "statement": statement,
        "metric": extra.get("metric"),
        "subject": extra.get("subject"),
    }


def experience(name: str = "Công ty ABC", kind: str = "work", **fields: Any) -> dict[str, Any]:
    return {
        "kind": kind,
        "name": name,
        "organization": None,
        "role": "Backend Engineer",
        "period": None,
        "start": None,
        "end": None,
        "is_current": False,
        "team_size": None,
        "technologies": [],
        "highlights": [],
        **fields,
    }


def cv(skills: list[dict] | None = None, experiences: list[dict] | None = None) -> CvExtraction:
    return CvExtraction.model_validate(
        {
            "headline": None,
            "stated_years": None,
            "cv_language": "vi",
            "skills": skills or [],
            "experiences": experiences or [],
            "seniority_signals": [],
            "education": [],
            "credentials": [],
            "languages": [],
        }
    )


def cite(text: str) -> list[Citation]:
    return [Citation(page=1, text=text)]


# --- skills ---------------------------------------------------------------


def test_duplicate_skill_keeps_skills_section_and_largest_years() -> None:
    extraction = cv(
        skills=[
            skill("redis", source="experience", years=2),
            skill("Python"),
            skill("Redis ", years=1),
            skill("REDIS", source="experience"),
        ]
    )
    profile, stats = build_profile(extraction, {}, None)
    assert [(s.id, s.name, s.years) for s in profile.skills] == [
        ("sk1", "Redis", 2),  # first position, skills-section spelling, max years
        ("sk2", "Python", None),
    ]
    assert stats.skills_merged == 2


def test_similar_skill_names_are_not_guessed() -> None:
    profile, _ = build_profile(cv(skills=[skill("PostgreSQL"), skill("Postgre SQL")]), {}, None)
    assert [s.name for s in profile.skills] == ["PostgreSQL", "Postgre SQL"]


def test_empty_skill_name_dropped() -> None:
    profile, stats = build_profile(cv(skills=[skill("  "), skill("Go")]), {}, None)
    assert [(s.id, s.name) for s in profile.skills] == [("sk1", "Go")]
    assert stats.skills_empty == 1


def test_skill_quote_checked_against_document() -> None:
    extraction = cv(skills=[skill("Python"), skill("Go")])
    citations = {"skills[0].name": cite("Python"), "skills[1].name": cite("Golang")}
    profile, _ = build_profile(extraction, citations, "Ngôn ngữ: Python, Go")
    assert [s.source_quote for s in profile.skills] == ["Python", None]


def test_skill_quote_from_duplicate_when_kept_entry_has_none() -> None:
    extraction = cv(skills=[skill("Kafka", source="experience"), skill("Kafka")])
    profile, _ = build_profile(extraction, {"skills[0].name": cite("Kafka")}, "dùng Kafka")
    assert profile.skills[0].source_quote == "Kafka"


def test_field_path_citation_rejected_without_document() -> None:
    extraction = cv(skills=[skill("Python"), skill("Node.js")])
    citations = {"skills[0].name": cite("skills.0.name"), "skills[1].name": cite("Node.js")}
    profile, _ = build_profile(extraction, citations, None)
    assert [s.source_quote for s in profile.skills] == [None, "Node.js"]


# --- experiences ----------------------------------------------------------


def test_personal_project_uses_project_name() -> None:
    extraction = cv(experiences=[experience("Ứng dụng đặt lịch", kind="project", role=None)])
    profile, _ = build_profile(extraction, {}, None)
    assert profile.experiences[0].organization == "Ứng dụng đặt lịch"
    assert profile.experiences[0].role == ""


def test_company_project_keeps_both_names() -> None:
    extraction = cv(
        experiences=[experience("Hệ thống thanh toán", kind="project", organization="Công ty ABC")]
    )
    profile, _ = build_profile(extraction, {}, None)
    assert profile.experiences[0].organization == "Hệ thống thanh toán (Công ty ABC)"


def test_period_verbatim_or_built_from_dates() -> None:
    extraction = cv(
        experiences=[
            experience(period="03/2021 – nay", start="2021-03", is_current=True),
            experience(start="2019-06", end="2021-02"),
            experience(start="2018", is_current=True),
            experience(start="2017"),
            experience(),
        ]
    )
    profile, _ = build_profile(extraction, {}, None)
    assert [e.period for e in profile.experiences] == [
        "03/2021 – nay",
        "06/2019 – 02/2021",
        "2018 – nay",
        "2017",
        "",
    ]


def test_technologies_deduplicated_in_order() -> None:
    extraction = cv(experiences=[experience(technologies=["Go", "Redis", "go ", "", "Kafka"])])
    profile, _ = build_profile(extraction, {}, None)
    assert profile.experiences[0].technologies == ["Go", "Redis", "Kafka"]


def test_experience_without_role_and_organization_dropped() -> None:
    extraction = cv(
        experiences=[
            experience(name=" ", role=None, highlights=[highlight("Giảm 40% lỗi", "metric")]),
            experience(name="Công ty B"),
        ]
    )
    profile, stats = build_profile(extraction, {}, None)
    assert [(e.id, e.organization) for e in profile.experiences] == [("ex1", "Công ty B")]
    assert stats.experiences_empty == 1
    # Its highlights still count as claims.
    assert [c.source_quote for c in profile.claims] == ["Giảm 40% lỗi"]


# --- claims ---------------------------------------------------------------


def test_claims_from_metric_and_ownership_only() -> None:
    extraction = cv(
        experiences=[
            experience(
                highlights=[
                    highlight("Viết API cho app di động"),
                    highlight(
                        "Giảm độ trễ p95 40%",
                        "metric",
                        "Giảm 40% độ trễ",
                        metric="40%",
                        subject="độ trễ p95",
                    ),
                ]
            ),
            experience(highlights=[highlight("Thiết kế hệ thống thông báo", "ownership", "TK")]),
        ]
    )
    profile, _ = build_profile(extraction, {}, None)
    first, second = profile.claims
    assert (first.id, first.statement, first.metric, first.subject) == (
        "cl1",
        "Giảm 40% độ trễ",
        "40%",
        "độ trễ p95",
    )
    assert first.source_quote == "Giảm độ trễ p95 40%"
    assert first.verifiable is True
    assert (second.id, second.verifiable) == ("cl2", False)


def test_missing_statement_uses_text_cut_at_word() -> None:
    long_text = "Thiết kế " + "hệ thống thanh toán " * 20
    extraction = cv(
        experiences=[
            experience(
                highlights=[
                    highlight("Dẫn dắt nhóm 3 kỹ sư", "ownership", None),
                    highlight(long_text, "ownership", "  "),
                ]
            )
        ]
    )
    profile, _ = build_profile(extraction, {}, None)
    short, cut = profile.claims
    assert short.statement == "Dẫn dắt nhóm 3 kỹ sư"
    assert len(cut.statement) <= STATEMENT_MAX
    assert cut.statement.endswith("…")
    assert long_text.startswith(cut.statement[:-1] + " ")  # cut between words
    assert cut.source_quote == long_text.strip()


def test_claim_with_no_text_dropped() -> None:
    extraction = cv(experiences=[experience(highlights=[highlight("  ", "metric", None)])])
    profile, stats = build_profile(extraction, {}, None)
    assert profile.claims == []
    assert stats.claims_empty == 1


def test_quote_status_uses_document_text_when_present() -> None:
    extraction = cv(
        experiences=[
            experience(
                highlights=[
                    highlight("Giảm độ trễ 40%", "metric"),
                    highlight("Tăng doanh thu 3 lần", "metric"),
                ]
            )
        ]
    )
    # The citation says found, but the text decides.
    citations = {"experiences[0].highlights[1].text": cite("Tăng doanh thu 3 lần")}
    profile, stats = build_profile(extraction, citations, "- Giảm độ trễ\n  40%")
    assert [c.quote_status for c in profile.claims] == ["found", "not_found"]
    assert stats.claims_not_found == 1


def test_quote_status_uses_citations_without_document_text() -> None:
    extraction = cv(
        experiences=[
            experience(
                highlights=[
                    highlight("Giảm độ trễ 40%", "metric"),
                    highlight("Tăng doanh thu 3 lần", "metric"),
                ]
            )
        ]
    )
    citations = {"experiences[0].highlights[0].text": cite("Giảm độ trễ 40%")}
    profile, _ = build_profile(extraction, citations, None)
    assert [c.quote_status for c in profile.claims] == ["found", "not_found"]


# --- whole profile --------------------------------------------------------


def test_fake_cv_gives_web_profile() -> None:
    raw = json.loads(FAKE_CV.read_text())
    profile, stats = build_profile(parse_cv_extraction(raw["data"]), {}, raw["document_text"])
    # Round-trip through the API type: the same shape the web reads.
    assert CandidateProfile.model_validate(profile.model_dump()) == profile
    for items, prefix in (
        (profile.skills, "sk"),
        (profile.experiences, "ex"),
        (profile.claims, "cl"),
    ):
        assert [x.id for x in items] == [f"{prefix}{i}" for i in range(1, len(items) + 1)]
    assert profile.experiences[0].organization == "Công ty ABC"  # organization == name
    assert profile.experiences[1].organization == "Hệ thống thông báo"
    assert all(c.quote_status == "found" for c in profile.claims)
    assert stats.claims_not_found == 0


def test_parse_reads_missing_lists_as_empty() -> None:
    raw = json.loads(FAKE_CV.read_text())["data"]
    del raw["credentials"]
    del raw["experiences"][0]["highlights"]
    extraction = parse_cv_extraction(raw)
    assert extraction.credentials == []
    assert extraction.experiences[0].highlights == []
    assert "credentials" not in raw  # input not mutated


def test_parse_still_rejects_other_missing_fields() -> None:
    raw = json.loads(FAKE_CV.read_text())["data"]
    del raw["cv_language"]
    with pytest.raises(ValidationError):
        parse_cv_extraction(raw)
