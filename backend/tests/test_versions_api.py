import asyncio
import uuid

import pytest

from app.db import cvs, jds
from app.db.mongo import utcnow
from app.domain.files import PDF
from app.schemas.cv import CandidateProfile, Claim, CvVersionRecord, Skill
from app.schemas.jd import JdRequirements, JdVersionRecord, Requirement
from app.schemas.user import DEFAULT_USER_ID

FOUND_QUOTE = "Giảm độ trễ API 40% bằng cache Redis"
MISSING_QUOTE = "Dẫn dắt nhóm 5 người"
JD_QUOTE = "Thành thạo Python"


def _claim(cid: str, quote: str | None, status: str) -> dict:
    return {
        "id": cid,
        "statement": f"claim {cid}",
        "metric": None,
        "subject": None,
        "verifiable": True,
        "source_quote": quote,
        "quote_status": status,
    }


@pytest.fixture
async def cv_id(client, db) -> str:
    """A CV of the default user with analysis version 1."""
    cv = await cvs.create_cv(db, DEFAULT_USER_ID, "CV", "cv.pdf", PDF, b"%PDF-1.7")
    profile = CandidateProfile(
        skills=[Skill(id="s1", name="Python", years=3, source_quote="Python (3 năm)")],
        claims=[
            Claim.model_validate(_claim("c1", FOUND_QUOTE, "found")),
            Claim.model_validate(_claim("c2", MISSING_QUOTE, "not_found")),
        ],
    )
    await cvs.insert_version(
        db,
        CvVersionRecord(
            id=str(uuid.uuid4()),
            cv_id=cv.id,
            user_id=DEFAULT_USER_ID,
            version=1,
            origin="analysis",
            mode="standard",
            profile=profile,
            extraction={"raw": True},
            created_at=utcnow(),
        ),
    )
    return cv.id


@pytest.fixture
async def jd_id(client, db) -> str:
    jd = await jds.create_jd(db, DEFAULT_USER_ID, "JD", "Yêu cầu: Thành thạo Python")
    reqs = JdRequirements(
        requirements=[
            Requirement(
                id="r1", name="Python", kind="required", importance=3, source_quote=JD_QUOTE
            )
        ]
    )
    await jds.insert_version(
        db,
        JdVersionRecord(
            id=str(uuid.uuid4()),
            jd_id=jd.id,
            user_id=DEFAULT_USER_ID,
            version=1,
            origin="analysis",
            mode="standard",
            requirements=reqs,
            created_at=utcnow(),
        ),
    )
    return jd.id


async def _latest_profile(client, cv_id: str) -> dict:
    return (await client.get(f"/api/cvs/{cv_id}/versions/latest")).json()["profile"]


async def test_save_version_2_from_1(client, db, cv_id):
    profile = await _latest_profile(client, cv_id)
    profile["skills"].append({"id": "s2", "name": "Go", "years": None, "source_quote": None})
    r = await client.post(
        f"/api/cvs/{cv_id}/versions", json={"base_version": 1, "profile": profile}
    )
    assert r.status_code == 201
    body = r.json()
    assert (body["cv_id"], body["version"], body["origin"], body["mode"]) == (
        cv_id,
        2,
        "user_edit",
        None,
    )
    assert [s["name"] for s in body["profile"]["skills"]] == ["Python", "Go"]

    stored = await db.cv_versions.find_one({"cv_id": cv_id, "version": 2})
    assert stored["extraction"] is None  # raw data only on analysis versions
    summary = (await client.get(f"/api/cvs/{cv_id}")).json()
    assert summary["latest_version"] == 2


async def test_old_base_version_conflicts(client, cv_id):
    profile = await _latest_profile(client, cv_id)
    ok = await client.post(
        f"/api/cvs/{cv_id}/versions", json={"base_version": 1, "profile": profile}
    )
    assert ok.status_code == 201
    r = await client.post(
        f"/api/cvs/{cv_id}/versions", json={"base_version": 1, "profile": profile}
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "version_conflict"


async def test_no_version_yet_conflicts(client, db):
    cv = await cvs.create_cv(db, DEFAULT_USER_ID, "CV", "cv.pdf", PDF, b"%PDF-1.7")
    r = await client.post(
        f"/api/cvs/{cv.id}/versions", json={"base_version": 0, "profile": {"skills": []}}
    )
    assert r.status_code == 409
    assert (await client.get(f"/api/cvs/{cv.id}/versions/latest")).status_code == 404


async def test_parallel_saves_one_wins(client, cv_id):
    profile = await _latest_profile(client, cv_id)
    body = {"base_version": 1, "profile": profile}
    results = await asyncio.gather(
        client.post(f"/api/cvs/{cv_id}/versions", json=body),
        client.post(f"/api/cvs/{cv_id}/versions", json=body),
    )
    assert sorted(r.status_code for r in results) == [201, 409]


async def test_claim_quote_status_rules(client, cv_id):
    profile = await _latest_profile(client, cv_id)
    profile["claims"] = [
        _claim("c1", FOUND_QUOTE, "not_found"),  # existing quote: server keeps "found"
        _claim("c2", MISSING_QUOTE, "found"),  # existing quote: server keeps "not_found"
        _claim("c3", None, "user_added"),
        _claim("c4", "Câu tôi tự viết", "found"),  # new quote cannot claim "found"
    ]
    r = await client.post(
        f"/api/cvs/{cv_id}/versions", json={"base_version": 1, "profile": profile}
    )
    claims = {c["id"]: c for c in r.json()["profile"]["claims"]}
    assert claims["c1"]["quote_status"] == "found"
    assert claims["c2"]["quote_status"] == "not_found"
    assert claims["c3"]["quote_status"] == "user_added"
    assert (claims["c4"]["quote_status"], claims["c4"]["source_quote"]) == ("user_added", None)


async def test_duplicate_ids_and_oversized_profile(client, cv_id):
    profile = await _latest_profile(client, cv_id)
    profile["skills"].append(dict(profile["skills"][0]))
    r = await client.post(
        f"/api/cvs/{cv_id}/versions", json={"base_version": 1, "profile": profile}
    )
    assert r.status_code == 422
    assert "profile.skills" in r.json()["error"]["fields"]

    profile = await _latest_profile(client, cv_id)
    profile["skills"] = [{"id": f"s{i}", "name": "x"} for i in range(201)]
    r = await client.post(
        f"/api/cvs/{cv_id}/versions", json={"base_version": 1, "profile": profile}
    )
    assert r.status_code == 422

    profile = await _latest_profile(client, cv_id)
    profile["skills"][0]["name"] = "x" * 1001
    r = await client.post(
        f"/api/cvs/{cv_id}/versions", json={"base_version": 1, "profile": profile}
    )
    assert r.status_code == 422


async def test_get_versions(client, cv_id):
    profile = await _latest_profile(client, cv_id)
    for base in (1, 2):
        r = await client.post(
            f"/api/cvs/{cv_id}/versions", json={"base_version": base, "profile": profile}
        )
        assert r.status_code == 201

    listed = (await client.get(f"/api/cvs/{cv_id}/versions")).json()
    assert [(v["version"], v["origin"]) for v in listed] == [
        (3, "user_edit"),
        (2, "user_edit"),
        (1, "analysis"),
    ]
    assert set(listed[0]) == {"version", "created_at", "origin"}

    assert (await client.get(f"/api/cvs/{cv_id}/versions/latest")).json()["version"] == 3
    v1 = (await client.get(f"/api/cvs/{cv_id}/versions/1")).json()
    assert (v1["version"], v1["mode"]) == (1, "standard")
    for bad in ("4", "0", "-1", "abc"):
        assert (await client.get(f"/api/cvs/{cv_id}/versions/{bad}")).status_code == 404


async def test_sessions_empty_for_now(client, cv_id, jd_id):
    assert (await client.get(f"/api/cvs/{cv_id}/sessions")).json() == []
    assert (await client.get(f"/api/jds/{jd_id}/sessions")).json() == []


async def test_other_users_versions_not_found(client, db):
    other = await cvs.create_cv(db, "someone-else", "CV", "cv.pdf", PDF, b"%PDF-1.7")
    assert (await client.get(f"/api/cvs/{other.id}/versions")).status_code == 404
    assert (await client.get(f"/api/cvs/{other.id}/versions/latest")).status_code == 404
    r = await client.post(f"/api/cvs/{other.id}/versions", json={"base_version": 1, "profile": {}})
    assert r.status_code == 404


# ---- JD ----


async def _latest_reqs(client, jd_id: str) -> dict:
    return (await client.get(f"/api/jds/{jd_id}/versions/latest")).json()["requirements"]


async def test_jd_save_version_updates_count(client, jd_id):
    reqs = await _latest_reqs(client, jd_id)
    reqs["requirements"].append(
        {
            "id": "r2",
            "name": "  Docker  ",
            "kind": "preferred",
            "importance": 1,
            "source_quote": "Câu không có trong JD",
        }
    )
    r = await client.post(
        f"/api/jds/{jd_id}/versions", json={"base_version": 1, "requirements": reqs}
    )
    assert r.status_code == 201
    body = r.json()
    assert (body["jd_id"], body["version"], body["origin"]) == (jd_id, 2, "user_edit")
    added = body["requirements"]["requirements"][1]
    assert (added["name"], added["source_quote"]) == ("Docker", None)
    assert body["requirements"]["requirements"][0]["source_quote"] == JD_QUOTE

    summary = (await client.get(f"/api/jds/{jd_id}")).json()
    assert (summary["latest_version"], summary["requirement_count"]) == (2, 2)


async def test_jd_requirement_name_rules(client, jd_id):
    reqs = await _latest_reqs(client, jd_id)
    reqs["requirements"][0]["name"] = "   "
    r = await client.post(
        f"/api/jds/{jd_id}/versions", json={"base_version": 1, "requirements": reqs}
    )
    assert r.status_code == 422
    assert "requirements" in r.json()["error"]["fields"]

    reqs["requirements"][0]["name"] = "x" * 121
    r = await client.post(
        f"/api/jds/{jd_id}/versions", json={"base_version": 1, "requirements": reqs}
    )
    assert r.status_code == 422


async def test_jd_conflict_and_versions(client, jd_id):
    reqs = await _latest_reqs(client, jd_id)
    body = {"base_version": 1, "requirements": reqs}
    assert (await client.post(f"/api/jds/{jd_id}/versions", json=body)).status_code == 201
    r = await client.post(f"/api/jds/{jd_id}/versions", json=body)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "version_conflict"
    listed = (await client.get(f"/api/jds/{jd_id}/versions")).json()
    assert [v["version"] for v in listed] == [2, 1]
