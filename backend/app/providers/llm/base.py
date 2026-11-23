"""LLM provider interface: what `LlmService` (app/domain/llm.py) sees of any LLM API.

Adapters only translate a request into their API and map its errors. Validating the output,
retrying (transient errors and wrong schemas), timeouts and `llm_calls` records all live in
`LlmService`, so every provider behaves the same (docs/tasks/backend-llm.md section 2).
"""

from collections.abc import AsyncGenerator
from typing import Literal, Protocol

from pydantic import BaseModel


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class LlmRequest(BaseModel):
    model: str
    system: str
    messages: list[Message]
    max_output_tokens: int
    temperature: float | None = None


class Usage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0

    def __add__(self, other: "Usage") -> "Usage":
        return Usage(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
        )


class JsonResult(BaseModel):
    # The model's reply as returned, NOT parsed or validated: `LlmService` does both, and sends
    # this text back to the model when it does not match the schema.
    text: str
    usage: Usage
    model: str  # model actually used, as reported by the API


class TextChunk(BaseModel):
    text: str
    usage: Usage | None = None  # set on the last chunk only, when the API reports it


LlmErrorCode = Literal[
    "timeout",
    "rate_limited",
    "unavailable",
    "auth",
    "bad_request",
    "refused",  # the model declined to answer
    "bad_output",  # set by `LlmService`: output still off-schema after the retries
]

RETRYABLE_CODES: frozenset[LlmErrorCode] = frozenset({"timeout", "rate_limited", "unavailable"})


class LlmError(Exception):
    def __init__(
        self,
        code: LlmErrorCode,
        message: str = "",
        *,
        retryable: bool | None = None,
        retries: int = 0,
    ):
        super().__init__(f"{code}: {message}" if message else code)
        self.code = code
        self.retryable = code in RETRYABLE_CODES if retryable is None else retryable
        self.retries = retries  # set by `LlmService` on the error it raises


class LlmProvider(Protocol):
    name: str  # adapter kind: "openai_compat" | "gemini" | "fake"

    async def generate_json(self, req: LlmRequest, schema: type[BaseModel]) -> JsonResult:
        """One request asking for JSON matching `schema`, through the API's native structured
        output. Raises `LlmError`; does not retry."""
        ...

    def stream_text(self, req: LlmRequest) -> AsyncGenerator[TextChunk, None]:
        """Stream the reply as text. Raises `LlmError`; does not retry. Closing the generator
        must close the HTTP connection."""
        ...

    async def warmup(self) -> None:
        """Wake an endpoint that scales to zero; no-op elsewhere."""
        ...

    async def aclose(self) -> None: ...
