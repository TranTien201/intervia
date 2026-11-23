"""The one way the domain calls an LLM (A3–A6; A1/A2 use `providers/extract`).

`LlmService` picks the endpoint and model for a role, validates structured output with
Pydantic, retries transient errors and off-schema output, enforces the role's timeout, and
records every call (ok, error, timeout, cancelled). Adapters stay thin: see
`app.providers.llm.base` and docs/tasks/backend-llm.md section 2.2.

Never falls back to another endpoint on failure (decision D4): the caller has its own fallback.
"""

import asyncio
import logging
import time
import uuid
from collections.abc import AsyncGenerator, Awaitable, Callable, Iterable, Mapping
from contextlib import aclosing
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.db.mongo import utcnow
from app.providers.llm.base import (
    JsonResult,
    LlmError,
    LlmProvider,
    LlmRequest,
    Message,
    Usage,
)
from app.schemas.llm_call import LlmCallRecord, LlmCallRef, LlmRole
from app.schemas.llm_config import INTERVIEW_ROLES, EndpointConfig, LlmConfig, RoleSettings

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

MAX_SCHEMA_RETRIES = 2
MAX_ERROR_LINES = 10  # validation errors sent back to the model on a schema retry


# Roles → settings. A session keeps its own copy for its whole life (decision D5).
RoleSnapshot = Mapping[LlmRole, RoleSettings]

# (whole call, first chunk of a stream). Alarm thresholds, not latency targets (section 2.4).
ROLE_TIMEOUTS: dict[LlmRole, tuple[float, float | None]] = {
    "A3_blueprint": (90, None),
    "A4_intent": (3, None),
    "A5_turn_planner": (8, None),
    "A6_speaker": (30, 5),
}
_FALLBACK_TIMEOUTS: tuple[float, float | None] = (60, 10)


class CallContext(BaseModel):
    """Who the call is for and what it works on: `llm_calls` are deleted along with `ref`."""

    user_id: str
    ref: LlmCallRef


Recorder = Callable[[LlmCallRecord], Awaitable[None]]  # e.g. writes to `llm_calls`


class LlmService:
    def __init__(
        self,
        config: LlmConfig,
        providers: Mapping[str, LlmProvider],  # endpoint name → provider (`create_llm_registry`)
        record: Recorder,
        *,
        retry_delays_s: tuple[float, ...] = (0.5, 2.0),  # one transient retry per delay
    ):
        self._config = config
        self._providers = providers
        self._record = record
        self._retry_delays_s = retry_delays_s

    def snapshot(self) -> dict[LlmRole, RoleSettings]:
        """The current settings of every role, timeouts filled in: a session stores this when
        it starts and passes it to every call, so editing `llm.yaml` leaves it alone (D5).
        Holds no keys."""
        snapshot = {}
        for role in INTERVIEW_ROLES:
            settings = self._config.settings_for(role)
            total, first = ROLE_TIMEOUTS.get(role, _FALLBACK_TIMEOUTS)
            snapshot[role] = settings.model_copy(
                update={
                    "timeout_s": settings.timeout_s or total,
                    "first_token_timeout_s": settings.first_token_timeout_s or first,
                }
            )
        return snapshot

    def _resolve(
        self, role: LlmRole, snapshot: RoleSnapshot | None
    ) -> tuple[RoleSettings, LlmProvider]:
        if snapshot is None:
            settings = self._config.settings_for(role)
        elif role in snapshot:
            settings = snapshot[role]
        else:
            raise ValueError(f"Session snapshot has no settings for role {role}")
        provider = self._providers.get(settings.endpoint)
        if provider is None:
            # A session's snapshot can name an endpoint since removed from the config.
            raise LlmError("unavailable", f"endpoint {settings.endpoint!r} is not configured")
        return settings, provider

    def _new_record(
        self,
        role: LlmRole,
        settings: RoleSettings,
        provider: LlmProvider,
        *,
        system: str,
        messages: list[Message],
        prompt_version: str,
        ctx: CallContext,
        output_schema: str | None,
    ) -> LlmCallRecord:
        endpoint = self._config.endpoints.get(settings.endpoint)
        return LlmCallRecord(
            id=str(uuid.uuid4()),
            user_id=ctx.user_id,
            ref=ctx.ref,
            role=role,
            endpoint=settings.endpoint,
            provider=provider.name,
            model=settings.model,
            prompt_version=prompt_version,
            output_schema_version=output_schema,
            status="ok",
            billing=endpoint.billing if endpoint else None,
            input={"system": system, "messages": [m.model_dump() for m in messages]},
            created_at=utcnow(),
        )

    def _finish(self, call: LlmCallRecord, usage: Usage, started: float) -> None:
        call.latency_ms = _ms_since(started)
        call.usage = usage.model_dump()
        endpoint = self._config.endpoints.get(call.endpoint or "")
        call.est_cost_usd = _cost(endpoint, usage)

    async def _save(self, call: LlmCallRecord) -> None:
        # Content stays out of the log line: it holds CVs and answers (personal data).
        log.info(
            "LLM call %s role=%s endpoint=%s model=%s status=%s error=%s retries=%s+%s "
            "latency_ms=%s tokens=%s/%s",
            call.id,
            call.role,
            call.endpoint,
            call.model,
            call.status,
            call.error_code,
            call.retries,
            call.transient_retries,
            call.latency_ms,
            call.usage.get("input_tokens"),
            call.usage.get("output_tokens"),
        )
        try:
            # Shielded: the write still happens when the caller is cancelled again meanwhile.
            await asyncio.shield(self._record(call))
        except Exception:
            # Never hide the call's own outcome behind a failed write.
            log.exception("Could not record LLM call %s", call.id)

    async def structured(
        self,
        role: LlmRole,
        schema: type[T],
        *,
        system: str,
        messages: list[Message],
        prompt_version: str,
        ctx: CallContext,
        roles: RoleSnapshot | None = None,
    ) -> T:
        """One object of `schema`, or `LlmError` (`bad_output` when still off-schema after
        `MAX_SCHEMA_RETRIES` retries, `timeout` past the role's timeout)."""
        settings, provider = self._resolve(role, roles)
        call = self._new_record(
            role,
            settings,
            provider,
            system=system,
            messages=messages,
            prompt_version=prompt_version,
            ctx=ctx,
            output_schema=schema.__name__,
        )
        timeout_s = settings.timeout_s or ROLE_TIMEOUTS.get(role, _FALLBACK_TIMEOUTS)[0]
        conversation = list(messages)
        usage = Usage()
        started = time.monotonic()
        try:
            async with asyncio.timeout(timeout_s):
                while True:
                    req = _request(settings, system, conversation)
                    result = await self._generate_json(provider, req, schema, call)
                    usage += result.usage
                    call.model = result.model
                    try:
                        value = schema.model_validate_json(result.text)
                    except ValidationError as e:
                        if call.retries >= MAX_SCHEMA_RETRIES:
                            call.output = {"text": result.text}
                            raise LlmError("bad_output", f"{e.error_count()} errors") from None
                        call.retries += 1
                        conversation += [
                            Message(role="assistant", content=result.text),
                            Message(role="user", content=_schema_feedback(e)),
                        ]
                        continue
                    call.output = value.model_dump(mode="json")
                    return value
        except TimeoutError:
            call.status, call.error_code = "timeout", "timeout"
            raise LlmError("timeout", f"over {timeout_s}s", retries=call.retries) from None
        except LlmError as e:
            call.status, call.error_code = "error", e.code
            e.retries = call.retries
            raise
        except asyncio.CancelledError:
            call.status = "cancelled"
            raise
        finally:
            self._finish(call, usage, started)
            await self._save(call)

    async def _generate_json(
        self, provider: LlmProvider, req: LlmRequest, schema: type[BaseModel], call: LlmCallRecord
    ) -> JsonResult:
        """One JSON reply, retrying transient errors with backoff (the role timeout still
        covers it all)."""
        while True:
            try:
                return await provider.generate_json(req, schema)
            except LlmError as e:
                if not e.retryable or call.transient_retries >= len(self._retry_delays_s):
                    raise
                delay = self._retry_delays_s[call.transient_retries]
                call.transient_retries += 1
                log.info("LLM call %s failed (%s), retrying in %ss", call.id, e.code, delay)
                await asyncio.sleep(delay)

    async def stream(
        self,
        role: LlmRole,
        *,
        system: str,
        messages: list[Message],
        prompt_version: str,
        ctx: CallContext,
        roles: RoleSnapshot | None = None,
    ) -> AsyncGenerator[str, None]:
        """The reply as text chunks. Transient errors before the first chunk are retried;
        after it, the error is raised (the text already shown cannot be taken back).

        Closing the generator early cancels the call and records the text received so far.
        """
        settings, provider = self._resolve(role, roles)
        call = self._new_record(
            role,
            settings,
            provider,
            system=system,
            messages=messages,
            prompt_version=prompt_version,
            ctx=ctx,
            output_schema=None,
        )
        default_total, default_first = ROLE_TIMEOUTS.get(role, _FALLBACK_TIMEOUTS)
        total_s = settings.timeout_s or default_total
        first_s = settings.first_token_timeout_s or default_first or total_s
        req = _request(settings, system, messages)
        parts: list[str] = []
        usage = Usage()
        loop = asyncio.get_running_loop()
        started = time.monotonic()
        total_deadline = loop.time() + total_s
        first_deadline = min(loop.time() + first_s, total_deadline)
        try:
            while True:
                try:
                    # Timeouts wrap each wait for a chunk, never a `yield`: the consumer's code
                    # runs while this generator is suspended there, and must not be cancelled.
                    async with aclosing(provider.stream_text(req)) as chunks:
                        while True:
                            deadline = total_deadline if parts else first_deadline
                            try:
                                async with asyncio.timeout_at(deadline):
                                    chunk = await anext(chunks)
                            except StopAsyncIteration:
                                break
                            if chunk.usage is not None:
                                usage += chunk.usage
                            if chunk.text:
                                if not parts:
                                    call.first_token_ms = _ms_since(started)
                                parts.append(chunk.text)
                                yield chunk.text
                    break
                except LlmError as e:
                    retries = call.transient_retries
                    if parts or not e.retryable or retries >= len(self._retry_delays_s):
                        raise
                    call.transient_retries += 1
                    log.info("LLM stream %s failed (%s), retrying", call.id, e.code)
                    async with asyncio.timeout_at(first_deadline):
                        await asyncio.sleep(self._retry_delays_s[retries])
        except TimeoutError:
            call.status, call.error_code = "timeout", "timeout"
            waited = "first chunk" if not parts else "whole stream"
            raise LlmError("timeout", f"{waited} over its timeout") from None
        except LlmError as e:
            call.status, call.error_code = "error", e.code
            raise
        except (asyncio.CancelledError, GeneratorExit):
            call.status = "cancelled"  # task cancelled, or the reader closed the stream
            raise
        finally:
            call.output = {"text": "".join(parts)}
            self._finish(call, usage, started)
            await self._save(call)

    async def warmup(self, roles: Iterable[LlmRole], snapshot: RoleSnapshot | None = None) -> None:
        """Wake the endpoints these roles use (those that scale to zero), e.g. before a session
        starts. Best effort: failures are only logged."""
        endpoints: dict[str, LlmProvider] = {}
        for role in roles:
            try:
                settings, provider = self._resolve(role, snapshot)
            except (LlmError, ValueError) as e:
                log.warning("Cannot warm up role %s: %s", role, e)
                continue
            endpoints[settings.endpoint] = provider
        results = await asyncio.gather(
            *(p.warmup() for p in endpoints.values()), return_exceptions=True
        )
        for name, result in zip(endpoints, results, strict=True):
            if isinstance(result, Exception):
                log.warning("Warmup of endpoint %s failed: %s", name, result)


def _request(settings: RoleSettings, system: str, messages: list[Message]) -> LlmRequest:
    return LlmRequest(
        model=settings.model,
        system=system,
        messages=messages,
        max_output_tokens=settings.max_output_tokens,
        temperature=settings.temperature,
    )


def _schema_feedback(error: ValidationError) -> str:
    """The retry turn: what was wrong, without echoing input values back."""
    lines = []
    for item in error.errors(include_url=False, include_input=False)[:MAX_ERROR_LINES]:
        where = ".".join(str(p) for p in item["loc"]) or "(root)"
        lines.append(f"- {where}: {item['msg']}")
    more = error.error_count() - len(lines)
    if more > 0:
        lines.append(f"- ...and {more} more")
    return (
        "Your previous reply does not match the required JSON schema:\n"
        + "\n".join(lines)
        + "\nReply again with only the corrected JSON."
    )


def _cost(endpoint: EndpointConfig | None, usage: Usage) -> float | None:
    if endpoint is None or endpoint.billing != "per_token" or endpoint.price_per_mtok is None:
        return None  # gpu_time: read from the provider's bill, not per call
    price = endpoint.price_per_mtok
    return (usage.input_tokens * price.input + usage.output_tokens * price.output) / 1_000_000


def _ms_since(started: float) -> int:
    return int((time.monotonic() - started) * 1000)
