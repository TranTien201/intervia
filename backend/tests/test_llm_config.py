"""`llm.yaml`, role settings, session snapshots and `llm_calls` records (BE-3.2)."""

from pathlib import Path

import pytest
from pydantic import BaseModel

from app.config import Settings
from app.db import llm_calls
from app.db.mongo import utcnow
from app.domain.llm import CallContext, LlmService
from app.main import create_app
from app.providers.llm import create_llm_registry
from app.providers.llm.base import Message
from app.providers.llm.fake import FakeLlm
from app.schemas.llm_call import LlmCallRecord, LlmCallRef
from app.schemas.llm_config import LlmConfigError, load_llm_config

EXAMPLE = Path(__file__).parent.parent / "llm.example.yaml"

VALID = """
endpoints:
  main:
    kind: fake
    price_per_mtok: { input: 2.0, output: 8.0 }
  local:
    kind: fake
    api_key_env: LOCAL_KEY
    structured_output: none
default: { endpoint: main, model: m-default }
roles:
  A6_speaker: { endpoint: local, model: m-speak, temperature: 0.7 }
  A4_intent: { endpoint: main, model: m-small, timeout_s: 2 }
"""


class Reply(BaseModel):
    text: str


def write(tmp_path: Path, text: str) -> Path:
    path = tmp_path / "llm.yaml"
    path.write_text(text, "utf-8")
    return path


def load(tmp_path: Path, text: str, env: dict[str, str] | None = None):
    return load_llm_config(write(tmp_path, text), env or {}, prod=False)


# --- loading ---


def test_valid_config(tmp_path):
    config = load(tmp_path, VALID, {"LOCAL_KEY": "k"})

    assert config.settings_for("A6_speaker").model == "m-speak"
    assert config.settings_for("A4_intent").timeout_s == 2
    assert config.settings_for("A3_blueprint").model == "m-default"  # not listed: default
    assert config.endpoints["main"].billing == "free"  # default of kind fake


def test_example_file_loads_without_keys():
    # Only the fake endpoint is used there, so the OpenAI / Gemini keys are not needed.
    config = load_llm_config(EXAMPLE, {}, prod=False)
    assert set(config.used_endpoints()) == {"fake"}
    assert config.endpoints["openai"].strict_schema is True  # default of openai_compat


def test_missing_file_gives_fake_in_dev(tmp_path):
    config = load_llm_config(tmp_path / "nope.yaml", {}, prod=False)
    assert {e.kind for e in config.endpoints.values()} == {"fake"}
    assert load_llm_config(None, {}, prod=False) == config


def test_missing_file_refused_in_prod(tmp_path):
    with pytest.raises(LlmConfigError, match="not found"):
        load_llm_config(tmp_path / "nope.yaml", {}, prod=True)


@pytest.mark.parametrize(
    ("text", "message"),
    [
        (
            "endpoints: {main: {kind: fake}}\ndefault: {endpoint: other, model: m}",
            "default.endpoint: no endpoint named 'other'",
        ),
        (
            "endpoints: {main: {kind: fake}}\ndefault: {endpoint: main, model: m}\n"
            "roles: {A5_turn_planner: {endpoint: gone, model: m}}",
            "roles.A5_turn_planner.endpoint: no endpoint named 'gone'",
        ),
        (
            "endpoints: {main: {kind: fake, structured_output: none}}\n"
            "default: {endpoint: main, model: m}",
            "A3_blueprint needs structured output",
        ),
        (
            "endpoints: {main: {kind: fake}}\ndefault: {endpoint: main, model: m}\n"
            "roles: {A1_cv_profiler: {endpoint: main, model: m}}",
            "A1/A2 use LlamaExtract",
        ),
        (
            "endpoints: {main: {kind: fake, strict: true}}\ndefault: {endpoint: main, model: m}",
            "endpoints.main.strict: Extra inputs are not permitted",  # typo of strict_schema
        ),
        (
            "endpoints: {main: {kind: claude}}\ndefault: {endpoint: main, model: m}",
            "endpoints.main.kind",
        ),
        ("endpoints: [", "not valid YAML"),
    ],
)
def test_invalid_config_names_the_problem(tmp_path, text, message):
    with pytest.raises(LlmConfigError, match=message):
        load(tmp_path, text)


def test_missing_key_of_a_used_endpoint(tmp_path):
    with pytest.raises(LlmConfigError, match="endpoints.local: LOCAL_KEY"):
        load(tmp_path, VALID, {})


def test_unused_endpoint_needs_no_key(tmp_path):
    text = VALID.replace("A6_speaker: { endpoint: local", "A6_speaker: { endpoint: main")
    config = load(tmp_path, text, {})
    assert set(config.used_endpoints()) == {"main"}
    assert set(create_llm_registry(config, {})) == {"main"}


def test_endpoint_kind_without_adapter_is_refused(tmp_path):
    text = (
        "endpoints: {openai: {kind: openai_compat, api_key_env: K}}\n"
        "default: {endpoint: openai, model: m}"
    )
    config = load(tmp_path, text, {"K": "k"})
    with pytest.raises(LlmConfigError, match="no adapter yet"):
        create_llm_registry(config, {"K": "k"})


def test_settings_env_reads_the_env_file(tmp_path, monkeypatch):
    (tmp_path / ".env").write_text("FROM_FILE=a\nBOTH=file\n", "utf-8")
    monkeypatch.chdir(tmp_path)  # `.env` is read from the working directory, as in the app
    monkeypatch.setenv("BOTH", "real")
    env = Settings().env()
    assert env["FROM_FILE"] == "a"
    assert env["BOTH"] == "real"  # real environment variables win


# --- service: snapshot, cost ---

CTX = CallContext(user_id="u1", ref=LlmCallRef(kind="session", id="s1"))
MESSAGES = [Message(role="user", content="xin chào")]


def make_service(config, fakes: dict[str, FakeLlm], calls: list[LlmCallRecord]) -> LlmService:
    async def record(call: LlmCallRecord) -> None:
        calls.append(call)

    return LlmService(config, fakes, record)


async def ask(service: LlmService, **kwargs) -> Reply:
    return await service.structured(
        "A5_turn_planner",
        Reply,
        system="s",
        messages=MESSAGES,
        prompt_version="p-1",
        ctx=CTX,
        **kwargs,
    )


def test_snapshot_fills_every_role_and_its_timeouts(tmp_path):
    config = load(tmp_path, VALID, {"LOCAL_KEY": "k"})
    snapshot = make_service(config, {}, []).snapshot()

    assert set(snapshot) == {"A3_blueprint", "A4_intent", "A5_turn_planner", "A6_speaker"}
    assert snapshot["A4_intent"].timeout_s == 2  # from the file
    assert snapshot["A3_blueprint"].timeout_s == 90  # role default
    assert snapshot["A6_speaker"].first_token_timeout_s == 5


async def test_snapshot_survives_a_config_change(tmp_path):
    fake = FakeLlm()
    calls: list[LlmCallRecord] = []
    old = load(tmp_path, VALID, {"LOCAL_KEY": "k"})
    snapshot = make_service(old, {}, []).snapshot()

    # llm.yaml edited and the app restarted while the session goes on.
    new = load(tmp_path, VALID.replace("m-default", "m-new"), {"LOCAL_KEY": "k"})
    service = make_service(new, {"main": fake, "local": fake}, calls)

    await ask(service, roles=snapshot)
    await ask(service)
    assert [r.model for r in fake.requests] == ["m-default", "m-new"]


async def test_cost_estimate_for_priced_endpoints(tmp_path):
    text = VALID.replace("kind: fake\n    price", "kind: fake\n    billing: per_token\n    price")
    config = load(tmp_path, text, {"LOCAL_KEY": "k"})
    calls: list[LlmCallRecord] = []
    service = make_service(config, {"main": FakeLlm(), "local": FakeLlm()}, calls)

    await ask(service)
    [call] = calls
    assert call.billing == "per_token"
    # Fake usage: 10 in, 5 out at 2 / 8 USD per million tokens.
    assert call.est_cost_usd == pytest.approx((10 * 2.0 + 5 * 8.0) / 1_000_000)


# --- llm_calls in MongoDB ---


async def test_records_are_stored_and_read_back(db):
    calls: list[LlmCallRecord] = []
    fake = FakeLlm()
    fake.add_json(Reply, Reply(text="Chào bạn"))

    async def record(call: LlmCallRecord) -> None:
        calls.append(call)
        await llm_calls.insert_call(db, call)

    service = LlmService(load_llm_config(None, {}, prod=False), {"fake": fake}, record)
    await ask(service)
    stored = await llm_calls.list_for_ref(db, "session", "s1")

    assert stored == calls
    [call] = stored
    assert call.schema_version == 2 and call.status == "ok"
    assert call.input == {"system": "s", "messages": [{"role": "user", "content": "xin chào"}]}
    assert call.output == {"text": "Chào bạn"}

    await llm_calls.delete_for_ref(db, "session", "s1")
    assert await llm_calls.list_for_ref(db, "session", "s1") == []


async def test_records_written_before_be_3_2_still_read(db):
    # An A1 record as BE-4 wrote it: no endpoint, input, billing...
    await db[llm_calls.COLLECTION].insert_one(
        {
            "_id": "old-1",
            "user_id": "u1",
            "role": "A1_cv_profiler",
            "ref": {"kind": "cv", "id": "cv1", "attempt_id": None},
            "provider": "llamacloud",
            "model": "cost_effective",
            "prompt_version": "cv_v1",
            "output_schema_version": "cv-1",
            "status": "ok",
            "error_code": None,
            "retries": 0,
            "latency_ms": 1200,
            "usage": {"credits": 25.0},
            "params": {"mode": "standard"},
            "reuse_key": "key",
            "output": {"data": {}},
            "created_at": utcnow(),
            "schema_version": 1,
        }
    )
    [old] = await llm_calls.list_for_ref(db, "cv", "cv1")
    assert old.schema_version == 1
    assert old.endpoint is None and old.input is None and old.billing is None
    assert await llm_calls.find_reusable(db, "u1", "A1_cv_profiler", "key") == old


# --- app startup ---


async def test_app_starts_without_llm_yaml(app):
    assert isinstance(app.state.llm, LlmService)
    assert set(app.state.llm.snapshot()["A3_blueprint"].model_dump()) >= {"endpoint", "model"}


async def test_app_refuses_to_start_with_a_broken_llm_yaml(db, settings, tmp_path):
    path = write(tmp_path, "endpoints: {}\ndefault: {endpoint: main, model: m}")
    app = create_app(settings.model_copy(update={"llm_config_path": str(path)}))
    with pytest.raises(LlmConfigError):
        async with app.router.lifespan_context(app):
            pass
