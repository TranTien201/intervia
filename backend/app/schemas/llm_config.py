"""`llm.yaml`: named LLM endpoints and which endpoint + model each role uses (decision D3,
docs/tasks/backend-llm.md sections 2.5 and BE-3.2).

The file holds no secrets: an endpoint names the environment variable that holds its key.
Every check runs at startup, so a wrong file stops the app instead of failing mid-session.
"""

import logging
from collections.abc import Mapping
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, ValidationError, model_validator

from app.schemas.llm_call import LlmRole

log = logging.getLogger(__name__)

EndpointKind = Literal["openai_compat", "gemini", "fake"]

# Roles that go through `LlmService`; A1/A2 use LlamaExtract (`providers/extract`).
INTERVIEW_ROLES: tuple[LlmRole, ...] = (
    "A3_blueprint",
    "A4_intent",
    "A5_turn_planner",
    "A6_speaker",
)
STREAM_ROLES: frozenset[LlmRole] = frozenset({"A6_speaker"})

FAKE_ENDPOINT = "fake"


class LlmConfigError(Exception):
    """`llm.yaml` is missing (in prod), unreadable or invalid; the app does not start."""


class Price(BaseModel):
    model_config = ConfigDict(extra="forbid")

    input: float  # USD per million tokens
    output: float


class EndpointConfig(BaseModel):
    """One place that serves models. Only unusual endpoints need more than `kind` and a key;
    unset traits take the defaults of their `kind`."""

    model_config = ConfigDict(extra="forbid")

    kind: EndpointKind
    base_url: str | None = None
    api_key_env: str | None = None  # env var holding the key; None for a local server
    headers_env: dict[str, str] = {}  # header name → env var holding its value
    # json_schema: the server enforces the schema; json_object: it only promises JSON (the
    # schema goes into the system prompt); none: text streams only.
    structured_output: Literal["json_schema", "json_object", "none"] = "json_schema"
    strict_schema: bool | None = None  # OpenAI "strict" mode; default: on for openai_compat
    stream_usage: bool = True  # token counts on the last stream chunk
    scales_to_zero: bool = False  # warmup() does something; longer connect timeout
    max_context_tokens: int | None = None
    billing: Literal["per_token", "gpu_time", "free"] | None = None  # default: by kind
    price_per_mtok: Price | None = None

    @model_validator(mode="after")
    def _kind_defaults(self) -> "EndpointConfig":
        if self.strict_schema is None:
            self.strict_schema = self.kind == "openai_compat"
        if self.billing is None:
            self.billing = "free" if self.kind == "fake" else "per_token"
        return self

    def env_names(self) -> list[str]:
        names = list(self.headers_env.values())
        return [self.api_key_env, *names] if self.api_key_env else names


class RoleSettings(BaseModel):
    """How one role calls its LLM. Timeouts left unset take the role's defaults
    (`app.domain.llm.ROLE_TIMEOUTS`)."""

    model_config = ConfigDict(extra="forbid")

    endpoint: str
    model: str
    temperature: float | None = None
    max_output_tokens: int = 4096
    timeout_s: float | None = None  # whole call, retries included
    first_token_timeout_s: float | None = None  # streams only


class LlmConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    endpoints: dict[str, EndpointConfig]
    default: RoleSettings  # for interview roles missing from `roles`
    roles: dict[LlmRole, RoleSettings] = {}

    @model_validator(mode="after")
    def _check_references(self) -> "LlmConfig":
        for role in self.roles:
            if role not in INTERVIEW_ROLES:
                raise ValueError(f"roles.{role}: not an LLM role (A1/A2 use LlamaExtract)")
        for role in INTERVIEW_ROLES:
            settings = self.roles.get(role, self.default)
            where = f"roles.{role}" if role in self.roles else "default"
            endpoint = self.endpoints.get(settings.endpoint)
            if endpoint is None:
                raise ValueError(f"{where}.endpoint: no endpoint named {settings.endpoint!r}")
            if role not in STREAM_ROLES and endpoint.structured_output == "none":
                raise ValueError(
                    f"{where}: {role} needs structured output, endpoint "
                    f"{settings.endpoint!r} has structured_output: none"
                )
        return self

    def settings_for(self, role: LlmRole) -> RoleSettings:
        return self.roles.get(role, self.default)

    def used_endpoints(self) -> dict[str, EndpointConfig]:
        """Endpoints some role uses; only these need their keys set and get a client."""
        names = {self.settings_for(role).endpoint for role in INTERVIEW_ROLES}
        return {name: e for name, e in self.endpoints.items() if name in names}


def fake_config() -> LlmConfig:
    """Every role on the in-process fake: dev and tests without any key."""
    return LlmConfig(
        endpoints={FAKE_ENDPOINT: EndpointConfig(kind="fake")},
        default=RoleSettings(endpoint=FAKE_ENDPOINT, model="fake"),
    )


def load_llm_config(path: str | Path | None, env: Mapping[str, str], *, prod: bool) -> LlmConfig:
    """Read and check `llm.yaml`. No file: the fake config (refused in prod). Every env var a
    used endpoint names must be set: a missing key fails here, not on the first call."""
    file = Path(path) if path else None
    if file is None or not file.is_file():
        if prod:
            raise LlmConfigError(f"LLM config file not found: {file}")
        log.warning("No LLM config file (%s): every LLM role uses the fake provider", file)
        return fake_config()
    try:
        raw = yaml.safe_load(file.read_text("utf-8"))
        config = LlmConfig.model_validate(raw)
    except yaml.YAMLError as e:
        raise LlmConfigError(f"{file}: not valid YAML: {e}") from None
    except ValidationError as e:
        raise LlmConfigError(f"{file}: {_describe(e)}") from None
    missing = [
        f"endpoints.{name}: {var}"
        for name, endpoint in config.used_endpoints().items()
        for var in endpoint.env_names()
        if not env.get(var)
    ]
    if missing:
        raise LlmConfigError(f"{file}: environment variables not set: {', '.join(missing)}")
    return config


def _describe(error: ValidationError) -> str:
    lines = []
    for item in error.errors(include_url=False, include_input=False):
        where = ".".join(str(p) for p in item["loc"])
        lines.append(f"{where}: {item['msg']}" if where else item["msg"])
    return "; ".join(lines)
