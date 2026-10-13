from pydantic import BaseModel


class Role(BaseModel):
    """A suggested job role (`Role` in docs/design/api.md)."""

    id: str  # snake_case; never changes once sessions reference it (sessions store role_id)
    name: str
