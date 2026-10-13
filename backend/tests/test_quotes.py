import unicodedata

import pytest

from app.domain.quotes import QuoteChecker, normalize, quote_found

DOC = """KINH NGHIỆM
Công ty ABC | Backend Engineer | 03/2021 – nay
• Thiết kế API thanh toán bằng FastAPI,
  phục vụ 2 triệu request mỗi ngày
- Giảm độ trễ truy vấn 40% nhờ thêm cache **Redis**
* Viết module “retry” cho hàng đợi
"""


@pytest.mark.parametrize(
    "quote",
    [
        # Line break and indentation inside the bullet.
        "Thiết kế API thanh toán bằng FastAPI, phục vụ 2 triệu request mỗi ngày",
        # Case and extra spaces.
        "giảm  ĐỘ TRỄ truy vấn 40%",
        # Bullet marker kept by the extractor.
        "- Giảm độ trễ truy vấn 40% nhờ thêm cache Redis",
        "• Thiết kế API thanh toán bằng FastAPI",
        # Markdown emphasis in the document only.
        "nhờ thêm cache Redis",
        # Different quote marks and dash.
        'Viết module "retry" cho hàng đợi',
        "03/2021 - nay",
    ],
)
def test_quote_found_ignores_layout(quote: str) -> None:
    assert quote_found(quote, DOC)


@pytest.mark.parametrize(
    "quote",
    [
        "Thiết kế API thanh toán bằng Django",  # reworded
        "Giảm độ trễ truy vấn 50%",  # different number
        "Thiet ke API thanh toan",  # accents dropped
        "",
        "   ",
    ],
)
def test_quote_not_found(quote: str) -> None:
    assert not quote_found(quote, DOC)


def test_decomposed_unicode_matches() -> None:
    # Some PDFs give Vietnamese as base letter + combining marks (NFD).
    assert quote_found(unicodedata.normalize("NFD", "Thiết kế API"), DOC)


def test_normalize() -> None:
    assert normalize("  • Hello\n   WORLD  ") == "hello world"


def test_checker_matches_function() -> None:
    checker = QuoteChecker(DOC)
    assert checker.found("phục vụ 2 triệu request")
    assert not checker.found("3 triệu request")
