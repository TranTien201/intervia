"""Document extraction interface: what the domain sees of LlamaExtract (or any later provider).

The domain decides *what* to send (text read locally, or the original file) and how good the
extraction must be (`quality`); each adapter maps `quality` to its own plans or models.
"""

from typing import Any, Literal, Protocol

from pydantic import BaseModel

Quality = Literal["economy", "high"]
ExtractorErrorCode = Literal["no_text", "provider_error", "timeout"]


class Citation(BaseModel):
    page: int | None
    text: str  # what the provider says it read; not trusted (spike BE-4.3, question 7)


class ExtractionResult(BaseModel):
    data: dict[str, Any]  # raw output for the JSON schema sent, not validated yet
    citations: dict[str, list[Citation]]  # key: field path, e.g. "skills[3].name"
    # The text the extraction read: the text sent, or the provider's parse of the file.
    # Quotes are checked against this. None if the provider could not return it.
    document_text: str | None
    provider: str
    tier: str | None  # provider plan or model actually used
    latency_ms: int
    retries: int
    usage: dict[str, float]  # e.g. {"credits": 25.0}


class ExtractorError(Exception):
    def __init__(self, code: ExtractorErrorCode, message: str = "", *, retries: int = 0):
        super().__init__(f"{code}: {message}" if message else code)
        self.code = code
        self.retries = retries


class DocumentExtractor(Protocol):
    name: str

    async def extract(
        self,
        *,
        text: str | None = None,
        content: bytes | None = None,
        filename: str,
        quality: Quality,
        schema: dict[str, Any],
        system_prompt: str,
    ) -> ExtractionResult:
        """Extract `schema` from exactly one of `text` or `content` (the original file).

        Raises `ExtractorError`; transient failures are already retried inside.
        """
        ...

    def tier_for(self, quality: Quality) -> str | None:
        """The plan or model `quality` maps to (recorded with each analysis)."""
        ...

    async def aclose(self) -> None: ...


def check_input(text: str | None, content: bytes | None) -> None:
    """Adapters call this first: exactly one input, never both."""
    if (text is None) == (content is None):
        raise ValueError("Pass exactly one of `text` or `content`")
