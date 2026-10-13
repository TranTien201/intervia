# Task: Backend + AI (`backend/`)

- Cập nhật: 2026-10-12
- Mức chi tiết: đầu việc. Chi tiết hóa từng nhóm (tiêu chí "Xong khi", task con) khi bắt đầu làm nhóm đó.
- Thiết kế: `CLAUDE.md`, `docs/design/agents.md`. Hợp đồng API dùng chung với web: `docs/design/api.md` (task `UI-0.3`).

## BE-0. Khung dự án
- [x] `backend/` với `uv`, Python 3.11, FastAPI, Pydantic v2, cấu hình qua biến môi trường (`pydantic-settings`).
- [x] Kết nối MongoDB có sẵn qua `MONGODB_URI` (container Docker `mongo` có sẵn, standalone, không dùng transaction).
- [x] PyMongo async (`AsyncMongoClient`), không dùng ODM; document map sang/từ Pydantic. Tạo index khi khởi động (thay cho migration). pytest + DB test (database riêng cho test).
- [x] Dependency `current_user()` trả người dùng mặc định.
- [x] Logging thường, không log PII ở mức INFO.
- [x] Bật CORS cho `web/` ở môi trường dev; xuất OpenAPI cho web sinh type.
- **Đã xong (2026-10-12):** khung `backend/app/` (`main.py` với `create_app()` + lifespan, `config.py`, `api/deps.py`, `api/errors.py`, `api/health.py`, `db/mongo.py`). `GET /api/health` ping MongoDB. Lỗi theo định dạng `api.md` (`AppError`, `validation_error` kèm `fields`). ID là UUID chuỗi ở `_id`; mỗi collection đăng ký hàm tạo index vào `INDEX_SETUPS` (chưa có collection nào, làm ở BE-1). Dùng container `mongo` có sẵn (MongoDB 9.0, standalone). Test: `tests/test_errors.py` (không cần DB), `tests/test_db.py` (bỏ qua nếu không có MongoDB). Lệnh: `backend/README.md`.

## BE-1. Mô hình dữ liệu
- [x] Collection `users`: `_id` (UUID chuỗi) là `user_id` mà mọi collection khác trỏ tới; `email` lưu chữ thường, **unique index** `email_unique` (chặn trùng email kể cả khi hai lần đăng ký chạy cùng lúc); `password_hash`, `created_at`, `updated_at`, `schema_version`. Repository `app/db/users.py`: `create_user` (trùng email → `email_taken` 409), `get_user`, `get_user_by_email`. Index đăng ký trong `app/db/__init__.py`. Test: `tests/test_users.py`. (2026-10-12)
- [x] Collection `cvs`, `cv_versions`, `jds`, `jd_versions`, GridFS `cv_files` (BE-2.1, 2026-10-13). Index: `cvs`/`jds` `user_updated` (`user_id`, `updated_at` giảm dần), `analysis_status`; `cv_versions`/`jd_versions` **unique** `cv_version_unique`/`jd_version_unique` (`cv_id`/`jd_id`, `version`), `user_id`. **Quy tắc `latest_version`:** nguồn sự thật là `max(version)` trong `*_versions`; `cvs.latest_version` / `jds.latest_version` (và `jds.requirement_count`) là bản sao, chỉ tăng, cập nhật **sau khi** chèn phiên bản. Bản ghi `deleting = true` bị ẩn khỏi mọi lần đọc.
- [ ] Collection `sessions` (tham chiếu bản CV/JD, trạng thái, bước hiện tại), `blueprints`, `questions`, `answers` (bản STT gốc + bản sửa + segment có timestamp), `session_events`, `llm_calls`; file audio lưu bằng GridFS. Mọi document gắn `user_id` (có index). (`cvs`, `cv_versions`, `jds`, `jd_versions`: xem BE-2.1.)
- [ ] Khóa đầu vào khi phiên đã bắt đầu; xóa CV/JD xóa kèm phiên và file audio.

## BE-2. Thư viện CV & JD (chưa cần AI)
**Chi tiết từng task (việc, file, quy tắc, test, output): `backend-cv-jd.md`.** Thứ tự làm cả nhóm CV/JD ở mục 1 của file đó. BE-3 không chặn nhóm này (A1, A2 dùng LlamaExtract).
- [x] BE-2.1. Schema và collection CV/JD (`cvs`, `cv_versions`, `jds`, `jd_versions`, GridFS `cv_files`)
  - **Đã xong (2026-10-13):** schema `app/schemas/analysis.py` (dùng chung: `AnalysisState`, `VersionInfo`, `AnalysisProgress`, giới hạn chuỗi 1 000 ký tự), `cv.py`, `jd.py` (type API + bản ghi DB `CvRecord`, `CvVersionRecord`, `JdRecord`, `JdVersionRecord`); repository `app/db/cvs.py`, `jds.py` (kèm các bước xóa cho BE-2.5); `utcnow()` trong `app/db/mongo.py` (cắt về ms). `analysis` có thêm `mode` (chế độ trích xuất). File GridFS dùng UUID chuỗi làm `_id`. Test: `tests/test_cvs_repo.py`, `test_jds_repo.py`.
- [x] BE-2.2. API tải lên và quản lý CV
  - **Đã xong (2026-10-13):** `app/api/cvs.py`: `POST /api/cvs` (multipart `file`, `name`, `mode?`; đọc từng khối 1 MB, > 5 MB → 413; loại file theo nội dung, sai → 415), `GET /api/cvs`, `GET/PATCH /api/cvs/{id}`, `GET /api/cvs/{id}/file` (stream GridFS, `filename*=UTF-8''…`, `nosniff`). `app/domain/files.py` (nhận dạng PDF/DOCX, làm sạch tên file), `app/domain/library.py` (kiểm tra tên, `mode`). Thêm `python-multipart`. Lỗi 422 gom mọi trường sai (`name`, `mode`, `file`) vào một lần trả. Fixture `client` dùng chung trong `tests/conftest.py`. Test: `tests/test_cvs_api.py`. Đã thử tải một CV PDF thật qua server chạy thật.
- [x] BE-2.3. API thêm và quản lý JD (dán text)
  - **Đã xong (2026-10-13):** `app/api/jds.py`: `POST /api/jds` (đọc `Content-Type`: JSON `{name, text, mode?}`; multipart tạm trả 415 tới BE-4.6; body tự parse nên Swagger lấy schema từ `openapi_extra`), `GET /api/jds`, `GET /api/jds/{id}` (`JdDetail`), `PATCH /api/jds/{id}`. Text: `\r\n` → `\n`, bỏ khoảng trắng đầu cuối, 1–20 000 ký tự **sau khi** chuẩn hóa. `mode` của JD chỉ nhận `standard` / `precise`. Test: `tests/test_jds_api.py`.
- [x] BE-2.4. Phiên bản hồ sơ và yêu cầu
  - **Đã xong (2026-10-13):** `app/domain/versions.py` (`save_cv_version`, `save_jd_version`, kiểm tra id trùng, quy tắc `quote_status`); route trong `app/api/cvs.py`, `jds.py`: `GET …/versions`, `GET …/versions/{v}` (`v` ≥ 1 hoặc `latest`, sai → 404), `POST …/versions` (201; `base_version` khác bản mới nhất hoặc chưa có bản nào → 409 `version_conflict`; chạy song song thì unique index quyết định), `GET …/sessions` (tạm `[]`). Thêm ngoài đặc tả: `source_quote` của yêu cầu JD cũng chỉ giữ khi có trong bản gốc (giống claim). `api.md`: thêm `version_conflict` vào bảng mã lỗi và quy tắc lưu phiên bản. Test: `tests/test_versions_api.py`.
- [ ] BE-2.5. Xóa CV và JD

## BE-3. Lớp provider LLM (AI)
- [ ] Interface `generate_structured(schema)` / `stream_text()` trong `providers/llm/`; adapter Anthropic, OpenAI, Gemini dùng structured output native; chọn bằng `LLM_PROVIDER` / `LLM_MODEL`, model riêng theo vai trò.
- [ ] Retry khi sai schema (tối đa 2 lần); ghi `llm_calls`.
- [ ] Prompt có version trong `prompts/`; dữ liệu ứng viên bọc thẻ XML.
- [ ] Provider giả cho test (trả output cố định).

## BE-4. Phân tích CV/JD (A1, A2) bằng LlamaExtract
**Chi tiết: `backend-cv-jd.md`.** Thiết kế: `docs/design/extraction.md`.
- [x] BE-4.1. Danh sách vị trí và `GET /api/roles` (không còn competency catalog, xem `docs/design/extraction.md` mục 5)
  - **Đã xong (2026-10-13):** `app/domain/roles.py` (`ROLES`, 4 vị trí giống mock web), `app/schemas/role.py`, `app/api/roles.py` (`GET /api/roles`, cần `current_user`). Test: `tests/test_roles.py`. Sửa kèm: fixture test (`conftest.py`, `test_errors.py`) cố định `auth_enabled=False`, vì `Settings` đọc `.env` nên trước đây test lỗi khi `.env` bật `AUTH_ENABLED`.
- [x] BE-4.2. Schema trích xuất và system prompt
  - **Đã xong (2026-10-13):** `app/schemas/extraction.py`: `CvExtraction`, `JdExtraction` (mọi trường có `description` tiếng Anh, mọi trường đều bắt buộc kể cả trường nullable, để LlamaExtract luôn trả đủ khóa), `CV_SCHEMA_VERSION = "cv-1"`, `JD_SCHEMA_VERSION = "jd-1"`; `cv_json_schema()` / `jd_json_schema()` trả schema đã gọn cho LlamaExtract (inline `$ref`, chỉ giữ `type`, `description`, `properties`, `required`, `items`, `anyOf`, `enum`). `importance` dùng `Literal[1, 2, 3]` thay cho `int` để Pydantic tự chặn giá trị ngoài 1–3. Prompt: `app/prompts/cv_extract_v1.md`, `jd_extract_v1.md`; `load_prompt(name)` lấy bản `_vN` mới nhất. Test: `tests/test_extraction_schema.py` (thêm dev dependency `jsonschema` để kiểm tra schema hợp lệ). Giới hạn schema LlamaExtract: không ảnh hưởng, riêng `enum` chưa được tài liệu xác nhận, kiểm tra ở BE-4.3 (`extraction.md` mục 7).
- [x] BE-4.3. Chạy thử LlamaExtract trên CV/JD thật (spike)
  - **Đã xong tạm (2026-10-13):** `scripts/try_extract.py`, `scripts/show_extract.py`; báo cáo `docs/spikes/llamaextract.md` (mới chạy 1 CV + 1 JD tiếng Anh). Kết luận: dùng tiếp có điều kiện, người dùng chọn chế độ trích xuất (`extraction.md` mục 8). Sửa kèm: `jd_extract_v2`, schema `jd-2` (không tách danh sách lựa chọn). **Còn nợ:** chạy CV scan, 2 cột, tiếng Việt, DOCX, Junior, JD dán text / tiếng Việt; lưu fixture `tests/fixtures/extraction/` (cần trước BE-4.5).
- [ ] BE-4.4. Lớp provider trích xuất
- [ ] BE-4.5. Chuyển kết quả CV thành hồ sơ (A1)
- [ ] BE-4.6. Phân tích JD (A2) và tải JD bằng file
- [ ] BE-4.7. Chạy phân tích nền và báo tiến trình
- [ ] BE-4.8. Nối web với backend thật và cập nhật tài liệu

## BE-5. Blueprint (A3)
- [ ] Chốt có cần rubric khung ở MVP-1 không (CLAUDE.md "Chưa chốt").
- [ ] A3 + phần code: chuẩn hóa weight, depth band theo level, số câu, seed question.
- [ ] A3 tự so khớp hồ sơ CV với yêu cầu JD (không có competency catalog, không có bước so khớp riêng; `docs/design/extraction.md` mục 5): đặt tên competency tự do, code gán id trong phạm vi phiên; trả `jd_cv_gaps` (yêu cầu JD mà CV chưa có bằng chứng). Chốt có hiện `jd_cv_gaps` ở trang 4 không (cần thêm trường vào `BlueprintView` trong `api.md`).
- [ ] API trả blueprint đã bỏ seed question và claim cần kiểm chứng.

## BE-6. Phiên phỏng vấn chế độ Text (AI)
- [ ] Chốt follow-up hay chỉ hỏi tuần tự (CLAUDE.md "Chưa chốt").
- [ ] Orchestrator state machine trong `domain/`: bắt đầu, lượt, kết thúc (đủ bằng chứng / chạm giới hạn câu / người dùng dừng), khôi phục từ DB.
- [ ] A4 Intent Classifier (luật trước, model nhỏ sau); nút nhanh đi thẳng, không classify.
- [ ] A5 Turn Planner (dạng đơn giản) + Validator ràng buộc cứng; dự phòng bằng seed question.
- [ ] A6 Speaker stream qua SSE; sự kiện `progress`, `session_ended`.

## BE-7. Voice (AI)
- [ ] Spike STT/TTS tiếng Việt (API vs VieNeu-TTS, PhoWhisper): đo độ trễ, độ chính xác thuật ngữ, tham số đoán hết lượt; quyết định barge-in.
- [ ] Pipecat pipeline + `InterviewProcessor`; tắt prompt mặc định của Pipecat.
- [ ] Lưu audio câu trả lời + segment STT có timestamp; đổi chế độ giữa phiên.
- [ ] Chốt danh sách sự kiện gửi lên web qua data channel (cần cho `UI-9`).

## BE-8. Xem lại và xóa dữ liệu
- [ ] Transcript đầy đủ kèm sự kiện, độ phủ competency (code tính), sửa transcript (giữ bản gốc), phát audio.
- [ ] Xóa phiên / CV / JD kèm file audio.

## BE-9. Đăng nhập (khi bật)
- [x] Endpoint theo `api.md` mục "Đăng nhập": `GET /auth/me`, `POST /auth/signup|login|logout`; cookie phiên `HttpOnly`, `Secure`, `SameSite=Lax`; mật khẩu băm (argon2/bcrypt); giới hạn số lần đăng nhập sai và số lần đăng ký theo IP.
- [x] Bật bằng cấu hình: tắt thì `current_user()` trả người dùng mặc định và `/auth/me` trả `auth_enabled: false`; bật thì mọi endpoint ngoài `/auth/*` trả 401 `unauthenticated` khi chưa đăng nhập.
- **Đã xong (2026-10-12):** `AUTH_ENABLED` (mặc định `false`). `app/domain/auth.py`: băm mật khẩu argon2, email/mật khẩu sai trả cùng một lỗi (email không tồn tại vẫn băm thử để thời gian phản hồi như nhau). Collection `auth_sessions`: `_id` là SHA-256 của token trong cookie (không lưu token gốc), index `user_id`, TTL index `expires_at` (mặc định 30 ngày). Collection `rate_limits` (TTL): sai 5 lần/email hoặc 20 lần/IP trong 15 phút → 429; đăng ký tối đa 10 lần/IP/giờ. `current_user()` đọc cookie, không có phiên → 401 `unauthenticated`; `optional_user()` dùng cho `/auth/me`. Đăng ký/đăng nhập khi chưa bật trả 404. Test: `tests/test_auth.py`. **Chưa làm:** API "Tài khoản" (`/account/*`: đổi mật khẩu, xóa tài khoản, `AccountData`), làm khi có CV/JD/phiên. IP lấy trực tiếp từ kết nối; khi chạy sau reverse proxy cần cấu hình `X-Forwarded-For` tin cậy.
