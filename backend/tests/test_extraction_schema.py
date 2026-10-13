import json
from typing import Any

import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from app.prompts import load_prompt
from app.schemas.extraction import (
    CvExtraction,
    JdExtraction,
    cv_json_schema,
    jd_json_schema,
)

CV_SAMPLE: dict[str, Any] = {
    "headline": "Senior Backend Engineer",
    "stated_years": 5,
    "cv_language": "vi",
    "skills": [
        {
            "name": "PostgreSQL",
            "source": "skills_section",
            "group": "Database",
            "proficiency": "Thành thạo",
            "years": 4,
        },
        {
            "name": "Kafka",
            "source": "experience",
            "group": None,
            "proficiency": None,
            "years": None,
        },
    ],
    "experiences": [
        {
            "kind": "work",
            "name": "Công ty ABC",
            "organization": None,
            "role": "Backend Engineer",
            "period": "03/2022 – nay",
            "start": "2022-03",
            "end": None,
            "is_current": True,
            "team_size": 6,
            "technologies": ["PostgreSQL", "Kafka"],
            "highlights": [
                {
                    "text": "Tối ưu truy vấn PostgreSQL, giảm 40% độ trễ p95 của API thanh toán",
                    "kind": "metric",
                    "statement": "Giảm 40% độ trễ p95 API thanh toán",
                    "metric": "40%",
                    "subject": "độ trễ p95 của API thanh toán",
                },
                {
                    "text": "Viết API cho ứng dụng di động",
                    "kind": "task",
                    "statement": None,
                    "metric": None,
                    "subject": None,
                },
            ],
        }
    ],
    "seniority_signals": [{"kind": "mentoring", "text": "Mentor 2 bạn junior"}],
    "education": [
        {
            "institution": "Đại học Bách khoa Hà Nội",
            "degree": "Kỹ sư",
            "major": "Khoa học máy tính",
            "period": "2014 - 2019",
        }
    ],
    "credentials": [
        {
            "kind": "certificate",
            "name": "AWS Solutions Architect – Associate",
            "issuer": "AWS",
            "year": 2023,
        }
    ],
    "languages": [{"name": "Tiếng Anh", "level": "IELTS 7.0"}],
}

JD_SAMPLE: dict[str, Any] = {
    "company": "Công ty ABC",
    "position": "Backend Engineer",
    "stated_level": "Senior",
    "years_required": 3,
    "domain": "thanh toán",
    "jd_language": "vi",
    "responsibilities": [{"text": "Phát triển hệ thống thanh toán"}],
    "requirements": [
        {
            "name": "Thiết kế RESTful API",
            "text": "Thành thạo thiết kế RESTful API, PostgreSQL",
            "kind": "required",
            "importance": 3,
        },
        {
            "name": "Kubernetes",
            "text": "Biết Kubernetes là một lợi thế",
            "kind": "preferred",
            "importance": 1,
        },
    ],
    "level_signals": ["Tối thiểu 3 năm kinh nghiệm backend"],
}

CASES = [
    pytest.param(CvExtraction, cv_json_schema, CV_SAMPLE, id="cv"),
    pytest.param(JdExtraction, jd_json_schema, JD_SAMPLE, id="jd"),
]


def _iter_properties(node: Any, path: str = "$"):
    """Yield (path, schema) for every property at any depth."""
    if isinstance(node, dict):
        for name, prop in node.get("properties", {}).items():
            yield f"{path}.{name}", prop
            yield from _iter_properties(prop, f"{path}.{name}")
        if "items" in node:
            yield from _iter_properties(node["items"], f"{path}[]")
        for option in node.get("anyOf", []):
            yield from _iter_properties(option, path)


def _max_depth(node: Any) -> int:
    """Nesting levels of object properties / array items."""
    if not isinstance(node, dict):
        return 0
    children = [*node.get("properties", {}).values(), *node.get("anyOf", [])]
    if "items" in node:
        children.append(node["items"])
    return 1 + max((_max_depth(c) for c in children), default=0)


@pytest.mark.parametrize(("model", "schema_fn", "sample"), CASES)
def test_schema_is_valid_json_schema(model, schema_fn, sample):
    schema = schema_fn()
    Draft202012Validator.check_schema(schema)
    assert schema["type"] == "object"  # LlamaExtract: root must be an object
    # The schema sent out accepts exactly what the model accepts.
    Draft202012Validator(schema).validate(sample)


@pytest.mark.parametrize(("model", "schema_fn", "sample"), CASES)
def test_every_field_has_description(model, schema_fn, sample):
    props = list(_iter_properties(schema_fn()))
    assert props
    missing = [path for path, prop in props if not prop.get("description")]
    assert missing == []


@pytest.mark.parametrize(("model", "schema_fn", "sample"), CASES)
def test_schema_within_llamaextract_limits(model, schema_fn, sample):
    schema = schema_fn()
    raw = json.dumps(schema)
    # Only keywords LlamaExtract reads; refs inlined.
    for banned in ('"$ref"', '"$defs"', '"default"', '"title"'):
        assert banned not in raw
    assert _max_depth(schema) <= 7
    assert len(raw) < 150_000


@pytest.mark.parametrize(("model", "schema_fn", "sample"), CASES)
def test_sample_parses(model, schema_fn, sample):
    parsed = model.model_validate(sample)
    assert parsed.model_dump(mode="json") == json.loads(json.dumps(sample))


@pytest.mark.parametrize(("model", "schema_fn", "sample"), CASES)
def test_every_top_level_field_is_required(model, schema_fn, sample):
    for field in sample:
        incomplete = {k: v for k, v in sample.items() if k != field}
        with pytest.raises(ValidationError):
            model.model_validate(incomplete)


def test_nested_required_and_enums_enforced():
    bad = json.loads(json.dumps(CV_SAMPLE))
    del bad["experiences"][0]["highlights"][0]["kind"]
    with pytest.raises(ValidationError):
        CvExtraction.model_validate(bad)

    bad = json.loads(json.dumps(JD_SAMPLE))
    bad["requirements"][0]["importance"] = 4
    with pytest.raises(ValidationError):
        JdExtraction.model_validate(bad)


@pytest.mark.parametrize(
    ("name", "latest"), [("cv_extract", "cv_extract_v1"), ("jd_extract", "jd_extract_v2")]
)
def test_load_prompt(name, latest):
    prompt = load_prompt(name)
    assert prompt.text.strip()
    assert prompt.version == latest  # highest _vN wins


def test_load_prompt_unknown():
    with pytest.raises(FileNotFoundError):
        load_prompt("does_not_exist")
