"""`LlmService` over `FakeLlm` (BE-3.1): validation, retries, timeouts, cancellation, records."""

import asyncio
from typing import Literal

import pytest
from pydantic import BaseModel

from app.domain.llm import CallContext, LlmService
from app.providers.llm.base import LlmError, Message
from app.providers.llm.fake import FakeLlm, minimal_output
from app.schemas.llm_call import LlmCallRecord, LlmCallRef
from app.schemas.llm_config import EndpointConfig, LlmConfig, RoleSettings


class Topic(BaseModel):
    name: str
    depth: int


class Plan(BaseModel):
    action: Literal["ASK", "FOLLOW_UP", "END"]
    topics: list[Topic]
    note: str | None


PLAN = Plan(action="ASK", topics=[Topic(name="Kiến trúc hệ thống", depth=3)], note=None)
CTX = CallContext(user_id="u1", ref=LlmCallRef(kind="session", id="s1"))
MESSAGES = [Message(role="user", content="<candidate_answer>Em làm Kafka</candidate_answer>")]


def make_config(model: str = "m-1", **settings: float) -> LlmConfig:
    return LlmConfig(
        endpoints={"main": EndpointConfig(kind="fake")},
        default=RoleSettings(endpoint="main", model=model, **settings),
    )


def make_service(
    fake: FakeLlm, config: LlmConfig | None = None, **settings: float
) -> tuple[LlmService, list[LlmCallRecord]]:
    calls: list[LlmCallRecord] = []

    async def record(call: LlmCallRecord) -> None:
        calls.append(call)

    config = config or make_config(**settings)
    service = LlmService(config, {"main": fake}, record, retry_delays_s=(0, 0))
    return service, calls


async def plan(service: LlmService) -> Plan:
    return await service.structured(
        "A5_turn_planner", Plan, system="sys", messages=MESSAGES, prompt_version="p-1", ctx=CTX
    )


def speak(service: LlmService):
    return service.stream(
        "A6_speaker", system="sys", messages=MESSAGES, prompt_version="p-1", ctx=CTX
    )


async def read_all(service: LlmService) -> str:
    return "".join([part async for part in speak(service)])


# --- structured ---


async def test_valid_output_returns_the_object():
    fake = FakeLlm()
    fake.add_json(Plan, PLAN)
    service, calls = make_service(fake)

    assert await plan(service) == PLAN
    [call] = calls
    assert call.status == "ok"
    assert call.role == "A5_turn_planner"
    assert call.endpoint == "main" and call.provider == "fake" and call.model == "m-1"
    assert call.output == PLAN.model_dump(mode="json")
    assert call.input == {"system": "sys", "messages": [m.model_dump() for m in MESSAGES]}
    assert call.usage == {"input_tokens": 10, "output_tokens": 5}
    assert call.output_schema_version == "Plan"
    assert call.billing == "free" and call.est_cost_usd is None
    assert call.ref == CTX.ref and call.user_id == "u1"


async def test_broken_json_then_valid_retries_with_the_error():
    fake = FakeLlm()
    fake.add_json(Plan, '{"action": "ASK", "topics": [', PLAN)
    service, calls = make_service(fake)

    assert await plan(service) == PLAN
    assert calls[0].status == "ok" and calls[0].retries == 1
    assert calls[0].usage["input_tokens"] == 20  # both attempts counted
    retry = fake.requests[1].messages
    assert retry[:1] == MESSAGES
    assert retry[1] == Message(role="assistant", content='{"action": "ASK", "topics": [')
    assert retry[2].role == "user" and "does not match" in retry[2].content


async def test_feedback_names_the_wrong_fields_without_their_values():
    fake = FakeLlm()
    fake.add_json(Plan, {"action": "SECRET-VALUE", "topics": [], "note": None}, PLAN)
    service, _ = make_service(fake)

    await plan(service)
    feedback = fake.requests[1].messages[2].content
    assert "- action:" in feedback
    assert "SECRET-VALUE" not in feedback


async def test_still_wrong_after_two_retries_raises_bad_output():
    fake = FakeLlm()
    fake.add_json(Plan, "not json", {"action": "ASK"}, "{}")
    service, calls = make_service(fake)

    with pytest.raises(LlmError) as e:
        await plan(service)
    assert e.value.code == "bad_output" and e.value.retries == 2
    assert len(fake.requests) == 3
    [call] = calls
    assert call.status == "error" and call.error_code == "bad_output"
    assert call.output == {"text": "{}"}


async def test_transient_error_is_retried():
    fake = FakeLlm()
    fake.add_json(Plan, LlmError("rate_limited"), PLAN)
    service, calls = make_service(fake)

    assert await plan(service) == PLAN
    assert calls[0].transient_retries == 1 and calls[0].retries == 0


async def test_final_error_is_not_retried():
    fake = FakeLlm()
    fake.add_json(Plan, LlmError("refused"), PLAN)
    service, calls = make_service(fake)

    with pytest.raises(LlmError) as e:
        await plan(service)
    assert e.value.code == "refused"
    assert len(fake.requests) == 1
    assert calls[0].status == "error" and calls[0].error_code == "refused"


async def test_transient_errors_stop_after_the_retry_budget():
    fake = FakeLlm()
    fake.add_json(Plan, *[LlmError("unavailable")] * 3)
    service, calls = make_service(fake)

    with pytest.raises(LlmError) as e:
        await plan(service)
    assert e.value.code == "unavailable"
    assert len(fake.requests) == 3
    assert calls[0].transient_retries == 2


async def test_timeout_raises_and_records_it():
    service, calls = make_service(FakeLlm(delay_s=1), timeout_s=0.05)

    with pytest.raises(LlmError) as e:
        await plan(service)
    assert e.value.code == "timeout"
    assert calls[0].status == "timeout"


async def test_cancelling_propagates_and_records_it():
    fake = FakeLlm(gate=asyncio.Event())  # never set: the call hangs
    service, calls = make_service(fake)

    task = asyncio.create_task(plan(service))
    await fake.called.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert calls[0].status == "cancelled"


async def test_snapshot_overrides_the_current_settings():
    fake = FakeLlm()
    service, calls = make_service(fake)
    snapshot = {"A5_turn_planner": RoleSettings(endpoint="main", model="m-old")}

    await service.structured(
        "A5_turn_planner",
        Plan,
        system="sys",
        messages=MESSAGES,
        prompt_version="p-1",
        ctx=CTX,
        roles=snapshot,
    )
    assert fake.requests[0].model == "m-old"
    assert calls[0].model == "m-old"


async def test_snapshot_naming_a_removed_endpoint_is_unavailable():
    service, _ = make_service(FakeLlm())
    snapshot = {"A5_turn_planner": RoleSettings(endpoint="gone", model="m-1")}

    with pytest.raises(LlmError) as e:
        await service.structured(
            "A5_turn_planner",
            Plan,
            system="sys",
            messages=MESSAGES,
            prompt_version="p-1",
            ctx=CTX,
            roles=snapshot,
        )
    assert e.value.code == "unavailable"


async def test_failing_recorder_does_not_hide_the_result():
    fake = FakeLlm()
    fake.add_json(Plan, PLAN)

    async def record(call: LlmCallRecord) -> None:
        raise RuntimeError("db down")

    service = LlmService(make_config(), {"main": fake}, record)
    assert await plan(service) == PLAN


async def test_fake_without_script_returns_a_minimal_valid_output():
    service, _ = make_service(FakeLlm())

    result = await plan(service)
    assert result == minimal_output(Plan)
    assert result.action == "ASK" and result.topics == [] and result.note is None


# --- stream ---


async def test_stream_yields_the_chunks_in_order():
    fake = FakeLlm()
    fake.add_stream(["Chào ", "bạn, ", "mình bắt đầu nhé."])
    service, calls = make_service(fake)

    assert [p async for p in speak(service)] == ["Chào ", "bạn, ", "mình bắt đầu nhé."]
    [call] = calls
    assert call.status == "ok" and call.output == {"text": "Chào bạn, mình bắt đầu nhé."}
    assert call.output_schema_version is None and call.first_token_ms is not None
    assert call.usage["output_tokens"] == 5
    assert fake.streams_closed == 1


async def test_stream_error_before_the_first_chunk_is_retried():
    fake = FakeLlm()
    fake.add_stream(LlmError("unavailable"), ["Xin ", "chào"])
    service, calls = make_service(fake)

    assert await read_all(service) == "Xin chào"
    assert calls[0].status == "ok" and calls[0].transient_retries == 1


async def test_stream_error_after_the_first_chunk_is_raised():
    fake = FakeLlm()
    fake.add_stream(["Xin ", LlmError("unavailable")], ["never used"])
    service, calls = make_service(fake)

    received = []
    with pytest.raises(LlmError) as e:
        async for part in speak(service):
            received.append(part)
    assert e.value.code == "unavailable"
    assert received == ["Xin "]
    assert len(fake.requests) == 1
    assert calls[0].status == "error" and calls[0].output == {"text": "Xin "}


async def test_stream_first_chunk_timeout():
    service, calls = make_service(FakeLlm(delay_s=1), first_token_timeout_s=0.05)

    with pytest.raises(LlmError) as e:
        await read_all(service)
    assert e.value.code == "timeout"
    assert calls[0].status == "timeout"


async def test_stream_total_timeout():
    fake = FakeLlm(delay_s=0.03)  # between chunks too
    fake.add_stream(["a"] * 10)
    service, calls = make_service(fake, first_token_timeout_s=1, timeout_s=0.1)

    received = []
    with pytest.raises(LlmError) as e:
        async for part in speak(service):
            received.append(part)
    assert e.value.code == "timeout"
    assert 0 < len(received) < 10
    assert calls[0].status == "timeout" and calls[0].output == {"text": "".join(received)}


async def test_closing_the_stream_early_closes_the_provider_and_records_the_text():
    fake = FakeLlm()
    fake.add_stream(["Một ", "hai ", "ba"])
    service, calls = make_service(fake)

    stream = speak(service)
    assert await anext(stream) == "Một "
    await stream.aclose()
    assert fake.streams_closed == 1
    [call] = calls
    assert call.status == "cancelled" and call.output == {"text": "Một "}


async def test_cancelling_a_stream_task_closes_the_provider():
    fake = FakeLlm(gate=asyncio.Event())
    service, calls = make_service(fake)

    task = asyncio.create_task(read_all(service))
    await fake.called.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert fake.streams_closed == 1
    assert calls[0].status == "cancelled"


# --- warmup ---


async def test_warmup_wakes_each_endpoint_once():
    fake = FakeLlm()
    service, _ = make_service(fake)

    await service.warmup(["A5_turn_planner", "A6_speaker"])
    assert fake.warmups == 1
