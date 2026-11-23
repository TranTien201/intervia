import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, cvs, health, jds, roles
from app.api.errors import register_error_handlers
from app.config import Settings, get_settings
from app.db import llm_calls
from app.db.mongo import create_client, ensure_indexes
from app.domain import analysis
from app.domain.llm import LlmService
from app.logging_setup import setup_logging
from app.providers.extract import create_extractor
from app.providers.llm import create_llm_registry
from app.schemas.llm_config import load_llm_config

log = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    setup_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # First: a wrong llm.yaml or a missing key stops the app before anything else starts.
        env = settings.env()
        llm_config = load_llm_config(settings.llm_config_path, env, prod=settings.app_env == "prod")
        llm_providers = create_llm_registry(llm_config, env)
        client = create_client(settings)
        app.state.mongo_client = client
        app.state.db = client[settings.mongodb_db]
        # Fails fast (after mongodb_timeout_ms) if MongoDB is unreachable.
        await ensure_indexes(app.state.db)
        log.info("Connected to MongoDB database %r", settings.mongodb_db)
        app.state.extractor = create_extractor(settings)
        db = app.state.db
        app.state.llm = LlmService(
            llm_config, llm_providers, lambda call: llm_calls.insert_call(db, call)
        )
        # Before serving: jobs of a stopped process are gone, mark them interrupted.
        await analysis.recover(app.state.db)
        app.state.analysis = analysis.AnalysisRunner(
            app.state.db, app.state.extractor, settings.analysis_max_concurrency
        )
        try:
            yield
        finally:
            await app.state.analysis.aclose()
            await app.state.extractor.aclose()
            for provider in llm_providers.values():
                await provider.aclose()
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
    app.include_router(roles.router, prefix="/api")
    app.include_router(cvs.router, prefix="/api")
    app.include_router(jds.router, prefix="/api")
    return app


app = create_app()
