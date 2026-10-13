from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import current_user
from app.domain.roles import ROLES
from app.schemas.role import Role
from app.schemas.user import User

router = APIRouter()


@router.get("/roles")
async def list_roles(_user: Annotated[User, Depends(current_user)]) -> list[Role]:
    return ROLES
