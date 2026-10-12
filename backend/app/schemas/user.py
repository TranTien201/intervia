from datetime import datetime

from pydantic import BaseModel

# MVP-1 has no real login yet: every request belongs to this user.
DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"
DEFAULT_USER_EMAIL = "default@intervia.local"


class User(BaseModel):
    """A user as the API returns it (`{id, email}` in docs/design/api.md)."""

    id: str
    email: str


class UserRecord(BaseModel):
    """A document in the `users` collection. Never returned by the API as-is."""

    id: str
    email: str  # stored lowercase; unique
    password_hash: str
    created_at: datetime
    updated_at: datetime
    schema_version: int = 1

    def to_public(self) -> User:
        return User(id=self.id, email=self.email)
