import logging


def setup_logging(level: str) -> None:
    """Plain stdlib logging. Never log CV or answer content at INFO (PII)."""
    logging.basicConfig(
        level=level.upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    # PyMongo is chatty at DEBUG; keep it quiet unless we really need it.
    logging.getLogger("pymongo").setLevel(logging.WARNING)
