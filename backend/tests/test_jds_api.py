import httpx

from app.config import Settings
from app.db import jds
from app.main import create_app

JD_TEXT = "Backend Engineer\r\n\r\nYêu cầu:\r\n- Python, FastAPI\r\n"


async def _paste(c: httpx.AsyncClient, **body):
    return await c.post("/api/jds", json={"name": "JD Backend", "text": JD_TEXT, **body})


async def test_create_jd(client, db):
    r = await _paste(client)
    assert r.status_code == 201
    body = r.json()
    assert set(body) == {
        "id",
        "name",
        "company",
        "position",
        "latest_version",
        "analysis_status",
        "requirement_count",
        "session_count",
        "created_at",
        "updated_at",
    }
    assert body["name"] == "JD Backend"
    assert (body["company"], body["position"], body["latest_version"]) == (None, None, None)
    assert (body["analysis_status"], body["requirement_count"], body["session_count"]) == (
        "pending",
        0,
        0,
    )
    stored = await db.jds.find_one({"_id": body["id"]})
    assert stored["analysis"]["step"] == "receive"
    assert stored["analysis"]["mode"] == "standard"


async def test_get_returns_normalized_text(client):
    jd = (await _paste(client)).json()
    r = await client.get(f"/api/jds/{jd['id']}")
    assert r.status_code == 200
    assert r.json()["text"] == "Backend Engineer\n\nYêu cầu:\n- Python, FastAPI"
    assert r.json()["id"] == jd["id"]


async def test_text_limits(client):
    for bad in ("", "   \n\t ", "x" * 20_001):
        r = await _paste(client, text=bad)
        assert r.status_code == 422, bad[:10]
        assert r.json()["error"]["fields"].keys() == {"text"}
    assert (await _paste(client, text="x" * 20_000)).status_code == 201
    # Limit counts after trimming.
    assert (await _paste(client, text="  " + "x" * 20_000 + "  ")).status_code == 201


async def test_bad_name_and_mode(client):
    r = await _paste(client, name="x" * 121)
    assert r.json()["error"]["fields"].keys() == {"name"}
    r = await client.post("/api/jds", json={"text": JD_TEXT})
    assert r.json()["error"]["fields"].keys() == {"name"}
    # A JD has no layout to read.
    r = await _paste(client, mode="layout")
    assert r.status_code == 422
    assert r.json()["error"]["fields"].keys() == {"mode"}
    r = await _paste(client, mode="precise")
    assert r.status_code == 201


async def test_multipart_not_supported_yet(client):
    r = await client.post(
        "/api/jds", data={"name": "JD"}, files={"file": ("jd.pdf", b"%PDF-1.7", "application/pdf")}
    )
    assert r.status_code == 415
    assert r.json()["error"]["code"] == "unsupported_file"


async def test_invalid_json(client):
    r = await client.post(
        "/api/jds", content=b"{not json", headers={"content-type": "application/json"}
    )
    assert r.status_code == 422
    r = await client.post("/api/jds", json=["a"])
    assert r.status_code == 422


async def test_list_and_rename(client):
    a = (await _paste(client, name="A")).json()
    b = (await _paste(client, name="B")).json()
    assert {j["id"] for j in (await client.get("/api/jds")).json()} == {a["id"], b["id"]}

    r = await client.patch(f"/api/jds/{a['id']}", json={"name": "A2"})
    assert r.status_code == 200
    assert r.json()["name"] == "A2"
    assert [j["id"] for j in (await client.get("/api/jds")).json()][0] == a["id"]


async def test_other_users_jd_is_not_found(client, db):
    other = await jds.create_jd(db, "someone-else", "JD", "text")
    assert (await client.get(f"/api/jds/{other.id}")).status_code == 404
    assert (await client.patch(f"/api/jds/{other.id}", json={"name": "x"})).status_code == 404
    assert (await client.get("/api/jds")).json() == []


async def test_requires_login_when_auth_enabled(db, settings: Settings):
    app = create_app(settings.model_copy(update={"auth_enabled": True}))
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            assert (await _paste(c)).status_code == 401
