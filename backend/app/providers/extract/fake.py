"""Extractor that never leaves the process: for tests, and for dev without a LlamaCloud key
(`EXTRACTOR_PROVIDER=fake`, every CV gives the same profile, like the web's mock API)."""

import asyncio
import copy
import json
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

from app.providers.extract.base import ExtractionResult, ExtractorError, Quality, check_input

PROVIDER = "fake"
_DATA_DIR = Path(__file__).parent / "fake_data"


@dataclass(frozen=True)
class FakeCall:
    text: str | None
    content: bytes | None
    filename: str
    quality: Quality


@cache
def sample(kind: str) -> dict[str, Any]:
    """`cv_basic` / `jd_basic`: `{"data": ..., "document_text": ...}` (made-up, not real CVs)."""
    return json.loads((_DATA_DIR / f"{kind}.json").read_text("utf-8"))


class FakeExtractor:
    name = PROVIDER

    def __init__(
        self,
        result: ExtractionResult | None = None,
        error: ExtractorError | None = None,
        delay_s: float = 0,
    ):
        self.result = result
        self.error = error
        self.delay_s = delay_s
        self.calls: list[FakeCall] = []

    def tier_for(self, quality: Quality) -> str:
        return quality

    async def aclose(self) -> None:
        pass

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
        check_input(text, content)
        self.calls.append(FakeCall(text, content, filename, quality))
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        if self.error is not None:
            raise self.error
        if self.result is not None:
            return self.result
        # The schema tells a CV from a JD; a CV schema has a skills list.
        fixture = sample("cv_basic" if "skills" in schema.get("properties", {}) else "jd_basic")
        return ExtractionResult(
            data=copy.deepcopy(fixture["data"]),  # the sample is cached: never hand it out
            citations={},
            document_text=text if text is not None else fixture["document_text"],
            provider=PROVIDER,
            tier=self.tier_for(quality),
            latency_ms=0,
            retries=0,
            usage={},
        )
