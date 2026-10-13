import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.domain.jd_analysis import (
    NAME_FROM_TEXT_MAX,
    REQUIREMENTS_MAX,
    build_requirements,
    parse_jd_extraction,
)
from app.schemas.extraction import JdExtraction
from app.schemas.jd import JdRequirements

FAKE_JD = Path(__file__).parents[1] / "app/providers/extract/fake_data/jd_basic.json"

JD_TEXT = """Công ty XYZ tuyển Backend Engineer

Yêu cầu
- Thành thạo Python hoặc Go
- Có kinh nghiệm với PostgreSQL, tối ưu truy vấn
- Thiết kế API

Ưu tiên
- Đã từng làm việc với Kafka"""


def req(name: str, text: str, kind: str = "required", importance: Any = 2) -> dict[str, Any]:
    return {"name": name, "text": text, "kind": kind, "importance": importance}


def jd(requirements: list[dict], **fields: Any) -> JdExtraction:
    data = {
        "company": "Công ty XYZ",
        "position": "Backend Engineer",
        "stated_level": None,
        "years_required": None,
        "domain": None,
        "jd_language": "vi",
        "responsibilities": [],
        "requirements": requirements,
        "level_signals": [],
        **fields,
    }
    return parse_jd_extraction(data)


def test_one_requirement_per_item_in_order() -> None:
    extraction = jd(
        [
            req("Python hoặc Go", "Thành thạo Python hoặc Go", importance=3),
            req("PostgreSQL, tối ưu truy vấn", "Có kinh nghiệm với PostgreSQL, tối ưu truy vấn"),
            req("Kafka", "Đã từng làm việc với Kafka", "preferred", 1),
        ]
    )
    result, meta = build_requirements(extraction, JD_TEXT)
    assert [(r.id, r.name, r.kind, r.importance) for r in result.requirements] == [
        ("rq1", "Python hoặc Go", "required", 3),
        ("rq2", "PostgreSQL, tối ưu truy vấn", "required", 2),
        ("rq3", "Kafka", "preferred", 1),
    ]
    assert result.requirements[0].source_quote == "Thành thạo Python hoặc Go"
    assert (meta.company, meta.position, meta.requirement_count) == (
        "Công ty XYZ",
        "Backend Engineer",
        3,
    )
    assert meta.quotes_not_found == 0


def test_one_bullet_split_into_two_keeps_both() -> None:
    # Same text, different names: two requirements, both quoting the bullet.
    text = "Có kinh nghiệm với PostgreSQL, tối ưu truy vấn"
    result, _ = build_requirements(jd([req("PostgreSQL", text), req("Thiết kế API", text)]), "")
    assert [r.name for r in result.requirements] == ["PostgreSQL", "Thiết kế API"]


def test_quote_not_in_jd_is_dropped() -> None:
    extraction = jd(
        [
            req("Xử lý lỗi", "Xử lý lỗi trong hệ thống thanh toán"),  # not in the JD
            req("API", "  thiết KẾ\n API "),  # layout and case differ: still found
        ]
    )
    result, meta = build_requirements(extraction, JD_TEXT)
    assert [r.source_quote for r in result.requirements] == [None, "thiết KẾ\n API"]
    assert meta.quotes_not_found == 1


def test_exact_duplicates_merged() -> None:
    extraction = jd(
        [
            req("Kafka", "Đã từng làm việc với Kafka", "preferred", 1),
            req("Python", "Thành thạo Python hoặc Go"),
            req(" kafka ", "Đã từng làm việc  với Kafka", "required", 2),
        ]
    )
    result, meta = build_requirements(extraction, JD_TEXT)
    assert [(r.id, r.name, r.kind, r.importance) for r in result.requirements] == [
        ("rq1", "Kafka", "required", 2),
        ("rq2", "Python", "required", 2),
    ]
    assert meta.merged == 1
    assert meta.requirement_count == 2


def test_empty_name_taken_from_text() -> None:
    long_text = "Có kinh nghiệm thiết kế và vận hành hệ thống phân tán quy mô lớn " * 3
    extraction = jd([req("  ", "Thiết kế API"), req("", long_text), req("", " ")])
    result, meta = build_requirements(extraction, JD_TEXT)
    names = [r.name for r in result.requirements]
    assert names[0] == "Thiết kế API"
    assert len(names[1]) <= NAME_FROM_TEXT_MAX
    assert names[1].endswith("…") and long_text.startswith(names[1][:-1])
    assert meta.empty == 1


def test_importance_clamped() -> None:
    extraction = jd(
        [req("A", "a", importance=0), req("B", "b", importance=5), req("C", "c", importance=2.4)]
    )
    assert [r.importance for r in extraction.requirements] == [1, 3, 2]
    with pytest.raises(ValidationError):
        jd([req("A", "a", importance="high")])


def test_missing_lists_read_as_empty() -> None:
    data = json.loads(FAKE_JD.read_text())["data"]
    for key in ("responsibilities", "requirements", "level_signals"):
        del data[key]
    extraction = parse_jd_extraction(data)
    result, meta = build_requirements(extraction, "")
    assert result.requirements == []
    assert meta.requirement_count == 0
    with pytest.raises(ValidationError):
        parse_jd_extraction({**data, "company": 1})


def test_company_and_position_cleaned() -> None:
    _, meta = build_requirements(jd([], company="   ", position=" " + "P" * 200), "")
    assert meta.company is None
    assert meta.position == "P" * 120


def test_too_many_requirements_cut() -> None:
    items = [req(f"Kỹ năng {i}", f"Kỹ năng {i}") for i in range(REQUIREMENTS_MAX + 5)]
    result, meta = build_requirements(jd(items), "")
    assert meta.requirement_count == REQUIREMENTS_MAX
    assert meta.over_limit == 5


def test_fake_jd_matches_web_type() -> None:
    sample = json.loads(FAKE_JD.read_text())
    result, meta = build_requirements(parse_jd_extraction(sample["data"]), sample["document_text"])
    JdRequirements.model_validate(result.model_dump())
    assert meta.requirement_count == 4
    assert all(r.source_quote for r in result.requirements)
    assert [r.id for r in result.requirements] == ["rq1", "rq2", "rq3", "rq4"]
