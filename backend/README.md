# backend

API (FastAPI) và toàn bộ phần AI của Intervia, chạy chung một tiến trình Python.

```
app/
  main.py      # create_app(): lifespan (kết nối MongoDB, tạo index), CORS dev, router
  config.py    # Settings đọc từ biến môi trường / backend/.env
  api/         # FastAPI routes (lớp mỏng); deps.py (current_user, get_db), errors.py (định dạng lỗi)
  domain/      # logic nghiệp vụ + orchestrator; không import SDK hãng nào, không import Pipecat
  providers/   # AI: llm/, stt/, tts/
  prompts/     # AI: prompt có version
  voice/       # AI: Pipecat pipeline + InterviewProcessor
  schemas/     # Pydantic models
  db/          # MongoDB: kết nối, repository theo collection, tạo index
tests/
```

- Thiết kế: `CLAUDE.md`, `docs/design/agents.md`. Hợp đồng API: `docs/design/api.md`.
- Việc cần làm: `docs/tasks/backend.md`.

## Cài đặt lần đầu

Cần: [uv](https://docs.astral.sh/uv/) (`brew install uv`) và MongoDB. Dùng container Docker `mongo` có sẵn: `docker start mongo` (cổng 27017).

```bash
cd backend
uv sync                      # tự tải Python 3.11 và cài thư viện vào .venv
cp .env.example .env         # sửa MONGODB_URI nếu MongoDB ở chỗ khác
```

## Lệnh

| Lệnh (trong `backend/`) | Việc |
|---|---|
| `uv run uvicorn app.main:app --reload --port 8000` | Chạy API ở `http://localhost:8000` (web `npm run dev` proxy `/api` tới đây) |
| `uv run pytest` | Chạy test. Test cần DB dùng database `intervia_test` (xóa sau mỗi test); không kết nối được MongoDB thì các test đó bị bỏ qua |
| `uv run ruff check .` / `uv run ruff format .` | Lint / format |
| `uv add <gói>` | Thêm thư viện |

Đăng nhập: bật bằng `AUTH_ENABLED=true` trong `.env` (dev cần thêm `AUTH_COOKIE_SECURE=false`). Thử cùng web: `npm run dev:hybrid` trong `web/` (đăng nhập dùng backend thật, các trang khác vẫn dùng API giả).

Kiểm tra nhanh: `curl localhost:8000/api/health` → `{"status":"ok","db":"ok"}`. OpenAPI: `/openapi.json`, giao diện thử API: `/docs`.

## Quy ước

- ID là UUID dạng chuỗi, lưu ở `_id` (hợp đồng API dùng UUID chuỗi, không dùng ObjectId).
- Không dùng transaction (MongoDB chạy standalone). Thao tác nhiều document làm theo thứ tự an toàn, chạy lại được (vd: xóa CV: xóa audio → phiên → CV).
- Không có migration: mỗi collection đăng ký hàm tạo index vào `INDEX_SETUPS` (`app/db/mongo.py`), chạy lúc khởi động.
- Lỗi trả về dạng `{"error": {"code", "message", "fields"?}}`; lỗi có chủ đích thì `raise AppError(code, status, message)`.
- SDK của hãng LLM, Pipecat, thư viện đọc PDF/DOCX… chỉ thêm khi làm tới task cần chúng.
