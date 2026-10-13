"""Small text helpers shared by the extraction post-processing (A1, A2)."""

TEXT_MAX = 1000  # `Text` limit of every profile / requirement string


def shorten(text: str, limit: int) -> str:
    """Cut at a word boundary, adding '…' when cut."""
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    if " " in cut and not text[limit - 1].isspace():
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,;:-") + "…"
