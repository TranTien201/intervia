"""LLM that never leaves the process: for tests, and for dev without any key.

Replies are scripted per call: `add_json(schema, ...)` / `add_stream(...)` queue replies, used
in order. With nothing queued, a JSON call gets the smallest output valid for its schema and a
stream gets `DEFAULT_TEXT`.
"""

import asyncio
import json
from collections import defaultdict, deque
from collections.abc import AsyncGenerator, Sequence
from typing import Any

from pydantic import BaseModel

from app.providers.llm.base import JsonResult, LlmError, LlmRequest, TextChunk, Usage

PROVIDER = "fake"
DEFAULT_TEXT = "Bạn có thể kể về một dự án gần đây mà bạn tâm đắc nhất không?"
_USAGE = Usage(input_tokens=10, output_tokens=5)

# One scripted JSON reply: a valid object, raw JSON data, raw text (e.g. broken JSON), or an error.
JsonReply = BaseModel | dict[str, Any] | str | LlmError
# One scripted stream: text chunks in order, possibly ending with an error; or just an error.
StreamReply = Sequence[str | LlmError] | LlmError


class FakeLlm:
    name = PROVIDER

    def __init__(self, delay_s: float = 0, gate: asyncio.Event | None = None):
        self.delay_s = delay_s  # before each reply, and between stream chunks
        self.gate = gate  # when set, each call waits for it: holds a call until the test says
        self._json: dict[type[BaseModel], deque[JsonReply]] = defaultdict(deque)
        self._streams: deque[StreamReply] = deque()
        self.requests: list[LlmRequest] = []
        self.called = asyncio.Event()  # set once a request has come in
        self.streams_closed = 0  # streams finished or closed early, connection released
        self.warmups = 0

    def add_json(self, schema: type[BaseModel], *replies: JsonReply) -> None:
        self._json[schema].extend(replies)

    def add_stream(self, *replies: StreamReply) -> None:
        self._streams.extend(replies)

    def _receive(self, req: LlmRequest) -> None:
        self.requests.append(req)
        self.called.set()

    async def _wait(self) -> None:
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        if self.gate is not None:
            await self.gate.wait()

    async def generate_json(self, req: LlmRequest, schema: type[BaseModel]) -> JsonResult:
        self._receive(req)
        await self._wait()
        queue = self._json[schema]
        reply = queue.popleft() if queue else minimal_output(schema)
        if isinstance(reply, LlmError):
            raise reply
        if isinstance(reply, BaseModel):
            text = reply.model_dump_json()
        elif isinstance(reply, dict):
            text = json.dumps(reply, ensure_ascii=False)
        else:
            text = reply
        return JsonResult(text=text, usage=_USAGE, model=req.model)

    async def stream_text(self, req: LlmRequest) -> AsyncGenerator[TextChunk, None]:
        self._receive(req)
        reply = self._streams.popleft() if self._streams else _split(DEFAULT_TEXT)
        try:
            await self._wait()
            if isinstance(reply, LlmError):
                raise reply
            for i, part in enumerate(reply):
                if isinstance(part, LlmError):
                    raise part
                if i and self.delay_s:
                    await asyncio.sleep(self.delay_s)
                last = i == len(reply) - 1
                yield TextChunk(text=part, usage=_USAGE if last else None)
        finally:
            self.streams_closed += 1

    async def warmup(self) -> None:
        self.warmups += 1

    async def aclose(self) -> None:
        pass


def _split(text: str) -> list[str]:
    words = text.split(" ")
    return [w if i == 0 else f" {w}" for i, w in enumerate(words)]


def minimal_output(schema: type[BaseModel]) -> BaseModel:
    """The smallest output valid for `schema` (empty strings and lists, first enum value, None
    where allowed). Covers the schema subset of docs/tasks/backend-llm.md section 2.3."""
    json_schema = schema.model_json_schema()
    data = _minimal(json_schema, json_schema.get("$defs", {}))
    return schema.model_validate(data)


def _minimal(node: dict[str, Any], defs: dict[str, Any]) -> Any:
    if "$ref" in node:
        return _minimal(defs[node["$ref"].rsplit("/", 1)[-1]], defs)
    if "anyOf" in node:
        options = node["anyOf"]
        if any(o.get("type") == "null" for o in options):
            return None
        return _minimal(options[0], defs)
    if "const" in node:
        return node["const"]
    if "enum" in node:
        return node["enum"][0]
    match node.get("type"):
        case "object":
            required = set(node.get("required", []))
            return {
                k: _minimal(v, defs) for k, v in node.get("properties", {}).items() if k in required
            }
        case "array":
            return [_minimal(node["items"], defs) for _ in range(node.get("minItems", 0))]
        case "string":
            return "x" * node.get("minLength", 0)
        case "integer" | "number":
            return node.get("minimum", 0)
        case "boolean":
            return False
        case "null":
            return None
    raise ValueError(f"No minimal value for schema node {node!r}")
