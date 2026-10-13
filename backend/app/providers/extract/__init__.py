"""Document extraction providers (CV / JD → structured data). The domain imports only
`base`; `create_extractor` picks the adapter from settings."""

from app.config import Settings
from app.providers.extract.base import DocumentExtractor


def create_extractor(settings: Settings) -> DocumentExtractor:
    if settings.extractor_provider == "fake":
        from app.providers.extract.fake import FakeExtractor

        return FakeExtractor()

    from app.providers.extract.llamacloud import LlamaCloudExtractor

    assert settings.llama_cloud_api_key is not None  # checked by Settings
    return LlamaCloudExtractor(
        api_key=settings.llama_cloud_api_key.get_secret_value(),
        tiers={"economy": settings.llama_tier_economy, "high": settings.llama_tier_high},
        max_pages=settings.extract_max_pages,
        timeout_s=settings.extract_timeout_s,
    )
