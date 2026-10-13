# Danh sách công việc

- Cập nhật: 2026-10-12
- Phạm vi: MVP-1 (xem `CLAUDE.md` mục "Phạm vi MVP-1").

| File | Nội dung | Mức chi tiết |
|---|---|---|
| `ui.md` | Web frontend (`web/`): khung dự án, thành phần dùng chung, từng trang, voice | Chi tiết, làm được ngay |
| `backend.md` | Backend + AI (`backend/`): API, DB, provider LLM/STT/TTS, các vai trò A1–A6, voice | Mức đầu việc, chi tiết hóa khi bắt đầu |
| `backend-cv-jd.md` | Chi tiết BE-2 + BE-4: thư viện CV & JD, trích xuất bằng LlamaExtract | Chi tiết, giao việc được ngay |

## 1. Thư mục: tách UI, backend, AI

```
intervia/
  web/                 # UI: React. Chỉ gọi HTTP/WebRTC tới backend, không chứa logic nghiệp vụ
  backend/             # API + toàn bộ phần AI, một tiến trình Python
    app/
      api/             # FastAPI routes (lớp mỏng)
      domain/          # logic nghiệp vụ + orchestrator (state machine)
      providers/       # AI: llm/, stt/, tts/ (adapter từng hãng / model local)
      prompts/         # AI: prompt có version
      voice/           # AI: Pipecat pipeline + InterviewProcessor
      schemas/         # Pydantic models (cũng là nguồn sinh type cho web)
      db/              # MongoDB: kết nối, repository, index
  rubrics/             # rubric YAML (khung tiêu chí, chấm điểm từ MVP-2)
  docs/                # thiết kế, tham khảo, task
```

**Vì sao AI nằm trong `backend/` chứ không là service riêng:** orchestrator, Pipecat và các lời gọi LLM phải chạy chung một tiến trình để giữ độ trễ dưới ~1,5s (tách service là thêm một chặng mạng mỗi lượt) và để dùng chung kết nối DB. Phần AI vẫn tách riêng theo thư mục (`providers/`, `prompts/`, `voice/`), và quy tắc `domain/ không import SDK hãng nào` giữ ranh giới đó. Nếu sau này cần tách (vd: chạy STT/TTS local trên máy có GPU), chỉ cần tách các model local ra server riêng, `providers/` gọi qua HTTP, phần còn lại không đổi.

## 2. UI và backend làm song song thế nào

1. **Chốt hợp đồng API trước** (task `UI-0.3`): danh sách endpoint + schema JSON. Đây là ranh giới duy nhất giữa hai bên.
2. **UI chạy bằng API giả (MSW)** theo đúng hợp đồng, nên làm hết các trang mà không cần chờ backend.
3. Khi backend xong endpoint nào, tắt mock của endpoint đó. Type TypeScript sinh từ OpenAPI của FastAPI để hai bên không lệch nhau.
4. **Voice là ngoại lệ:** phụ thuộc spike STT/TTS ở backend, nên làm sau cùng (`UI-9`).

## 3. Thứ tự gợi ý

```
UI-0 Quyết định ─► UI-1 Khung web ─► UI-2 Thành phần chung ─► UI-3 Sidebar & khung trang
                                                                   │
   ┌───────────────────────────────────────────────────────────────┘
   ▼
UI-4 Thư viện ─► UI-5 Tạo phiên → Đối chiếu → Kế hoạch ─► UI-6 Phỏng vấn (Text) ─► UI-7 Xem lại ─► UI-8 Trang chào
                                                                                                    │
                    (cần backend spike voice xong) ──► UI-9 Voice ─► UI-10 Hoàn thiện ◄────────────┘
                                                                     UI-11 Đăng nhập (khi bật)
```

Thư viện làm trước luồng tạo phiên vì trình sửa hồ sơ (kỹ năng, kinh nghiệm, claim) viết một lần ở trang Chi tiết CV rồi dùng lại ở trang Đối chiếu.

## 4. Quy ước task

- Mã task: `UI-x.y` / `BE-x.y`. Mỗi task có **Xong khi** (tiêu chí nghiệm thu) và **Cần** (phụ thuộc).
- Đánh dấu `[x]` khi xong. Task đổi phạm vi thì sửa luôn ở đây, không để file lệch với thực tế.
- Mỗi trang đủ 4 trạng thái: đang tải, trống, lỗi, có dữ liệu (`ui-pages.md` mục 2). Không tính là xong nếu thiếu.
