import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, health
from app.api.errors import register_error_handlers
from app.config import Settings, get_settings
from app.db.mongo import create_client, ensure_indexes
from app.logging_setup import setup_logging

log = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    setup_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        client = create_client(settings)
        app.state.mongo_client = client
        app.state.db = client[settings.mongodb_db]
        # Fails fast (after mongodb_timeout_ms) if MongoDB is unreachable.
        await ensure_indexes(app.state.db)
        log.info("Connected to MongoDB database %r", settings.mongodb_db)
        try:
            yield
        finally:
            await client.close()

    app = FastAPI(title="Intervia API", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    register_error_handlers(app)

    if settings.app_env == "dev":
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origin_list,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(health.router, prefix="/api")
    app.include_router(auth.router, prefix="/api")
    return app


app = create_app()
