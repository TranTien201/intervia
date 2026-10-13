"""LlamaExtract (LlamaCloud Extract v2) adapter. Settings come from spike BE-4.3.

One attempt: upload (the text as `.txt`, or the original file) → extract job → poll → read
the result (and the parsed text for files) → delete everything created on LlamaCloud, since
CVs are personal data. Transient failures retry the whole attempt.
"""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from pathlib import PurePath
from typing import Any, TypeVar

import httpx
from llama_cloud import APIConnectionError, APIStatusError, AsyncLlamaCloud, LlamaCloudError

from app.providers.extract.base import (
    Citation,
    ExtractionResult,
    ExtractorError,
    Quality,
    check_input,
)

log = logging.getLogger(__name__)

PROVIDER = "llamacloud"
_DONE = "COMPLETED"
_FAILED = ("FAILED", "CANCELLED")

T = TypeVar("T")
# (what, delete function, id) of something created on LlamaCloud during an attempt.
_Created = tuple[str, Callable[[str], Awaitable[object]], str]


class _Retryable(Exception):
    """An attempt failed in a way worth trying again."""

    def __init__(self, error: ExtractorError):
        self.error = error


class LlamaCloudExtractor:
    name = PROVIDER

    def __init__(
        self,
        *,
        api_key: str,
        tiers: dict[Quality, str],
        max_pages: int,
        timeout_s: float,
        poll_interval_s: float = 2.0,
        retry_delays_s: tuple[float, ...] = (2.0, 5.0),
        http_client: httpx.AsyncClient | None = None,
    ):
        # The SDK's own retries are off: retries here cover the whole attempt and are counted.
        self._client = AsyncLlamaCloud(api_key=api_key, max_retries=0, http_client=http_client)
        self._tiers = tiers
        self._max_pages = max_pages
        self._timeout_s = timeout_s
        self._poll_interval_s = poll_interval_s
        self._retry_delays_s = retry_delays_s

    def tier_for(self, quality: Quality) -> str:
        return self._tiers[quality]

    async def aclose(self) -> None:
        await self._client.close()

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
        if text is not None:
            upload = (f"{PurePath(filename).stem or 'document'}.txt", text.encode(), "text/plain")
        else:
            upload = (filename, content)
        configuration = {
            "data_schema": schema,
            "tier": self.tier_for(quality),
            "system_prompt": system_prompt,
            # Kept for the record only; quotes are checked in code against `document_text`.
            "cite_sources": True,
            "disable_cache": True,  # personal data: LlamaCloud must not keep or reuse results
            "max_pages": self._max_pages,
        }
        started = time.monotonic()
        # One attempt per delay, plus a last one with no delay after it.
        for retries, delay in enumerate((*self._retry_delays_s, None)):
            try:
                result = await self._attempt(upload, configuration, sent_text=text)
            except _Retryable as e:
                if delay is None:
                    e.error.retries = retries
                    raise e.error from None
                log.info("Extraction attempt failed (%s), retrying in %ss", e.error.code, delay)
                await asyncio.sleep(delay)
            except ExtractorError as e:
                e.retries = retries
                raise
            else:
                latency_ms = int((time.monotonic() - started) * 1000)
                return result.model_copy(update={"latency_ms": latency_ms, "retries": retries})
        raise AssertionError("unreachable: the last attempt returns or raises")

    async def _attempt(
        self, upload: tuple[Any, ...], configuration: dict[str, Any], *, sent_text: str | None
    ) -> ExtractionResult:
        created: list[_Created] = []
        try:
            file = await _call(self._client.files.create(file=upload, purpose="extract"))
            created.append(("file", self._client.files.delete, file.id))
            job = await _call(
                self._client.extract.create(file_input=file.id, configuration=configuration)
            )
            created.append(("extract job", self._client.extract.delete, job.id))
            await self._wait(job.id)

            done = await _call(
                self._client.extract.get(job.id, expand=["extract_metadata", "usage"])
            )
            meta = done.extract_metadata
            parse_job_id = meta.parse_job_id if meta else None
            if parse_job_id:
                created.append(("parse job", self._client.parsing.delete, parse_job_id))
            if not isinstance(done.extract_result, dict):
                raise ExtractorError("provider_error", "no extraction result")

            document_text = sent_text
            if document_text is None and parse_job_id:
                document_text = await self._parsed_text(parse_job_id)
                if document_text is not None and not document_text.strip():
                    raise ExtractorError("no_text", "the file has no readable text")
            field_meta = meta.field_metadata if meta else None
            return ExtractionResult(
                data=done.extract_result,
                citations=to_citations(field_meta.document_metadata if field_meta else None),
                document_text=document_text,
                provider=PROVIDER,
                tier=configuration["tier"],
                latency_ms=0,  # set by `extract`, over all attempts
                retries=0,
                usage=_usage(done),
            )
        finally:
            await self._delete(created)

    async def _wait(self, job_id: str) -> None:
        try:
            async with asyncio.timeout(self._timeout_s):
                while True:
                    job = await _call(self._client.extract.get(job_id))
                    if job.status == _DONE:
                        return
                    if job.status in _FAILED:
                        # Same input, same outcome: not retried (a failed job may still cost).
                        raise ExtractorError("provider_error", f"job {job.status}")
                    await asyncio.sleep(self._poll_interval_s)
        except TimeoutError:
            raise _Retryable(ExtractorError("timeout", f"over {self._timeout_s}s")) from None

    async def _parsed_text(self, parse_job_id: str) -> str | None:
        """Text LlamaCloud parsed from the file (read before the job is deleted).

        None when it cannot be fetched: the extraction itself succeeded and was paid for, so
        it is kept; quotes then cannot be checked.
        """
        try:
            parsed = await self._client.parsing.get(parse_job_id, expand=["text"])
        except LlamaCloudError as e:
            log.warning("Could not read parsed text of %s: %s", parse_job_id, type(e).__name__)
            return None
        if not parsed.text:
            return None
        return "\n\n".join(page.text for page in parsed.text.pages)

    async def _delete(self, created: list[_Created]) -> None:
        """Best effort, newest first. A failure is logged (ids only) and does not replace the
        attempt's own result or error."""
        for what, delete, ident in reversed(created):
            try:
                await delete(ident)
            except LlamaCloudError as e:
                log.warning("Could not delete LlamaCloud %s %s: %s", what, ident, e)


async def _call(request: Awaitable[T]) -> T:
    """Await an SDK request, sorting its errors into retryable or final."""
    try:
        return await request
    except APIStatusError as e:
        error = ExtractorError("provider_error", f"HTTP {e.status_code}")
        if e.status_code == 429 or e.status_code >= 500:
            raise _Retryable(error) from None
        raise error from None  # our request is wrong: trying again cannot help
    except APIConnectionError as e:  # includes the SDK's own request timeout
        raise _Retryable(ExtractorError("provider_error", type(e).__name__)) from None
    except LlamaCloudError as e:  # e.g. a response the SDK cannot read
        raise ExtractorError("provider_error", type(e).__name__) from None


def _usage(job: Any) -> dict[str, float]:
    usage = job.usage.model_dump() if job.usage else {}
    return {key: float(value) for key, value in usage.items() if value is not None}


def to_citations(node: Any, path: str = "") -> dict[str, list[Citation]]:
    """LlamaCloud's citation tree (same shape as the data, `{"citation": [...]}` at the
    leaves) flattened to `{field path: [Citation]}`. Entries with no text are dropped."""
    found: dict[str, list[Citation]] = {}
    if isinstance(node, dict):
        entries = node.get("citation")
        if isinstance(entries, list):
            cites = [
                Citation(page=c.get("page"), text=c["matching_text"])
                for c in entries
                if isinstance(c, dict) and isinstance(c.get("matching_text"), str)
            ]
            if cites:
                found[path] = cites
        for key, value in node.items():
            if key != "citation":
                found |= to_citations(value, f"{path}.{key}" if path else key)
    elif isinstance(node, list):
        for i, item in enumerate(node):
            found |= to_citations(item, f"{path}[{i}]")
    return found
