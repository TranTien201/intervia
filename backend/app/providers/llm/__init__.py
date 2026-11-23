"""LLM providers. The domain imports only `base`; `create_llm_registry` builds one client per
endpoint some role uses, shared for the app's lifetime."""

from collections.abc import Mapping

from app.providers.llm.base import LlmProvider
from app.schemas.llm_config import EndpointConfig, LlmConfig, LlmConfigError


def create_llm_registry(config: LlmConfig, env: Mapping[str, str]) -> dict[str, LlmProvider]:
    """Endpoint name → provider. `env` holds the keys the endpoints name (already checked by
    `load_llm_config`)."""
    return {
        name: _create(name, endpoint, env) for name, endpoint in config.used_endpoints().items()
    }


def _create(name: str, endpoint: EndpointConfig, env: Mapping[str, str]) -> LlmProvider:
    if endpoint.kind == "fake":
        from app.providers.llm.fake import FakeLlm

        return FakeLlm()
    # openai_compat: BE-3.4, gemini: BE-3.7.
    raise LlmConfigError(f"endpoints.{name}: kind {endpoint.kind!r} has no adapter yet")
