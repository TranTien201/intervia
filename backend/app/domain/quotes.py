"""Checking that a quote the extractor returned really is in the document.

The provider's own citations are not trusted (spike BE-4.3, question 7): code compares the quote
with the text that was actually sent (or the provider's parse of the file). Both sides are
normalized the same way, so layout differences (line breaks, bullets, quote marks, Markdown
emphasis) do not matter, but a reworded or invented sentence never matches.
"""

import re
import unicodedata

# Bullet markers at the start of a line (dashes are unified to "-" before this runs).
_BULLET = re.compile(r"^[\s\-•●○◦▪▫■□►▶➢➤✓✔·*#>]+")
_DASHES = str.maketrans(dict.fromkeys("‐‑‒–—―−", "-"))
_QUOTES = str.maketrans({**dict.fromkeys("‘’‚‛′`", "'"), **dict.fromkeys("“”„‟″«»", '"')})
# Markdown emphasis and zero-width characters, dropped anywhere.
_DROP = str.maketrans(dict.fromkeys("*​‌‍﻿", ""))
_SPACES = re.compile(r"\s+")


def normalize(text: str) -> str:
    """NFC, unified dashes and quote marks, no bullets or emphasis, one space, case-folded."""
    text = unicodedata.normalize("NFC", text).translate(_DASHES).translate(_QUOTES)
    lines = (_BULLET.sub("", line) for line in text.splitlines())
    joined = " ".join(lines).translate(_DROP)
    return _SPACES.sub(" ", joined).strip().casefold()


def quote_found(quote: str, text: str) -> bool:
    """True if `quote` appears in `text` after both are normalized. An empty quote never does."""
    return QuoteChecker(text).found(quote)


class QuoteChecker:
    """`quote_found` against one document, normalizing the document only once."""

    def __init__(self, text: str):
        self._text = normalize(text)

    def found(self, quote: str) -> bool:
        needle = normalize(quote)
        return bool(needle) and needle in self._text
