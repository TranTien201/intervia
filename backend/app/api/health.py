from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pymongo import AsyncMongoClient

from app.api.deps import get_client
from app.db.mongo import ping

router = APIRouter()


@router.get("/health")
async def health(client: Annotated[AsyncMongoClient, Depends(get_client)]) -> JSONResponse:
    db_ok = await ping(client)
    return JSONResponse(
        {"status": "ok" if db_ok else "degraded", "db": "ok" if db_ok else "down"},
        status_code=200 if db_ok else 503,
    )
