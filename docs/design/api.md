# Hợp đồng API (MVP-1)

- Cập nhật: 2026-10-12
- Trạng thái: **bản nháp do phía web viết** (task `UI-0.3`), cần backend duyệt. Web chạy bằng mock (MSW) theo đúng file này; sửa ở đây trước rồi mới sửa code hai bên.
- Khi backend có OpenAPI, type TypeScript sinh từ đó (`npm run gen:api`) và file này chỉ giữ phần giải thích.

---

## 1. Quy ước chung

- Gốc: `/api`. JSON, tên trường `snake_case`. Thời gian: chuỗi ISO 8601 UTC. ID: UUID dạng chuỗi.
- Người dùng lấy từ `current_user()` ở backend; web không gửi `user_id`.
- **Đăng nhập** (mục 3 "Đăng nhập"): cookie phiên `HttpOnly`, `Secure`, `SameSite=Lax` do backend đặt; web không đọc, không lưu token. Chưa bật đăng nhập (`current_user()` trả người dùng mặc định) thì `GET /api/auth/me` trả `auth_enabled: false` và web chạy như không có đăng nhập. Đã bật mà chưa đăng nhập thì **mọi endpoint ngoài `/api/auth/*` trả 401 `unauthenticated`**; web chuyển về `/login`.
- **Lỗi:** mọi lỗi trả về mã HTTP phù hợp và thân:
  ```json
  { "error": { "code": "cv_not_found", "message": "Không tìm thấy CV." } }
  ```
  Web hiện câu báo lỗi theo `code` (không hiện `message` thô nếu đã có câu riêng cho `code` đó).

| `code` | HTTP | Khi nào |
|---|---|---|
| `unauthenticated` | 401 | Đã bật đăng nhập mà chưa đăng nhập / phiên đăng nhập hết hạn |
| `invalid_credentials` | 401 | Sai email hoặc mật khẩu (không nói sai phần nào) |
| `email_taken` | 409 | Đăng ký bằng email đã có |
| `too_many_attempts` | 429 | Đăng nhập sai quá nhiều lần, thử lại sau |
| `validation_error` | 422 | Dữ liệu gửi lên sai (kèm `error.fields: {tên_trường: thông_báo}`) |
| `not_found` | 404 | Không có đối tượng (hoặc không thuộc người dùng này) |
| `file_too_large` | 413 | File CV/JD > 5 MB |
| `unsupported_file` | 415 | Không phải PDF/DOCX |
| `no_text_in_file` | 422 | File scan, không trích được chữ (CV: báo trong `AnalysisProgress.error`; JD: trả ngay khi tải lên) |
| `session_locked` | 409 | Sửa đầu vào của phiên đã bắt đầu |
| `session_not_active` | 409 | Gửi câu trả lời cho phiên chưa bắt đầu / đã kết thúc |
| `turn_in_progress` | 409 | Gửi lượt mới khi AI chưa trả lời xong lượt trước |
| `llm_error` | 502 | Lỗi từ provider LLM sau khi đã thử lại |
| `internal_error` | 500 | Lỗi khác |

- **Giới hạn** (đề xuất): CV ≤ 5 MB; JD ≤ 20 000 ký tự; câu trả lời ≤ 8 000 ký tự; tên CV/JD ≤ 120 ký tự.
- **Theo dõi tiến trình phân tích:** polling mỗi ~1s (đơn giản, tải lại trang vẫn theo dõi được).
- **Lời AI ở chế độ Text:** SSE trả về trên chính request `POST` (web đọc bằng `fetch` stream, không dùng `EventSource`). Mất kết nối giữa chừng thì web lấy lại câu hỏi đã lưu qua `GET …/transcript`. **Vì vậy backend phải sinh trọn và lưu lời AI kể cả khi client đã ngắt** (tải lại trang, mất mạng), không hủy theo request. Web nhận biết "AI còn nợ một lượt" khi transcript kết thúc bằng câu trả lời hoặc `SKIP` (hoặc chưa có câu hỏi nào), rồi polling `GET …/transcript` mỗi ~1s, tối đa 30s.

## 2. Kiểu dữ liệu

```ts
type Level = "junior" | "mid" | "senior";
type Mode = "text" | "voice_text" | "voice_voice";        // Text | Nói → Chữ | Nói → Nói
type AnalysisStatus = "pending" | "running" | "done" | "failed";
type SessionStatus = "draft" | "in_progress" | "completed";
type SessionStep = "match" | "plan" | "interview" | "review"; // trang web cần mở khi bấm phiên

interface Role { id: string; name: string }               // GET /api/roles

// ---- CV ----
interface CvSummary {
  id: string; name: string; file_name: string;
  latest_version: number | null;            // null khi chưa phân tích xong lần đầu
  analysis_status: AnalysisStatus;
  session_count: number;
  created_at: string; updated_at: string;
}
interface Skill { id: string; name: string; years: number | null; source_quote: string | null }
interface Experience { id: string; organization: string; role: string; period: string; technologies: string[]; source_quote: string | null }
interface Claim {
  id: string; statement: string; metric: string | null; subject: string | null;
  verifiable: boolean;
  source_quote: string | null;
  quote_status: "found" | "not_found" | "user_added";  // not_found → cảnh báo hổ phách
}
interface CandidateProfile { skills: Skill[]; experiences: Experience[]; claims: Claim[] }
interface CvVersion {
  cv_id: string; version: number; created_at: string;
  origin: "analysis" | "user_edit" | "reanalysis";
  profile: CandidateProfile;
}

// ---- JD ----
interface JdSummary {
  id: string; name: string; company: string | null; position: string | null;
  latest_version: number | null; analysis_status: AnalysisStatus;
  requirement_count: number; session_count: number;
  created_at: string; updated_at: string;
}
interface JdDetail extends JdSummary { text: string }
interface Requirement { id: string; name: string; kind: "required" | "preferred"; importance: 1 | 2 | 3; source_quote: string | null }  // name: nhãn ngắn rút từ JD
interface JdRequirements { requirements: Requirement[] }
interface JdVersion { jd_id: string; version: number; created_at: string; origin: CvVersion["origin"]; requirements: JdRequirements }

// ---- Phân tích ----
interface AnalysisProgress {
  status: AnalysisStatus;
  steps: { key: string; label: string; status: "done" | "running" | "pending" | "failed" }[];
  error: { code: string; message: string } | null;
}

// ---- Phiên ----
interface VersionRef { id: string; name: string; version: number | null }
interface SessionSummary {
  id: string;
  role: Role; level: Level;
  status: SessionStatus; step: SessionStep;
  mode: Mode;
  cv: VersionRef; jd: VersionRef;
  progress: { asked: number; planned: number };
  created_at: string; started_at: string | null; ended_at: string | null;
}
interface CompetencyRef { id: string; name: string }   // competency do A3 đặt tên, id trong phạm vi phiên

// ---- Kế hoạch (đã bỏ seed question, claim cần kiểm chứng) ----
interface BlueprintView {
  status: "pending" | "running" | "done" | "failed";
  stale: boolean;                 // hồ sơ đã đổi sau khi tạo kế hoạch
  total_questions: number;        // "khoảng N câu"
  competencies: { id: string; name: string; weight: number; depth_band: [string, string]; questions_min: number; questions_max: number }[];
  error: { code: string; message: string } | null;
}

// ---- Transcript ----
type EventType = "REPEAT" | "CLARIFY" | "HINT" | "SKIP" | "THINKING" | "OFF_TOPIC" | "MODE_CHANGE" | "STOP";
type TranscriptItem =
  | { kind: "question"; id: string; index: number; text: string; competency: CompetencyRef | null; depth: string | null; unplanned: boolean; created_at: string }
  | { kind: "answer"; id: string; question_id: string; text_original: string; text_edited: string | null; source: "text" | "stt"; has_audio: boolean; duration_ms: number | null; created_at: string }
  | { kind: "event"; id: string; question_id: string | null; type: EventType; hint_level: number | null; text: string | null; created_at: string };
interface SessionSummaryBlock {   // khối tóm tắt khi kết thúc
  question_count: number; duration_seconds: number;
  assessed: CompetencyRef[]; not_assessed: CompetencyRef[];
}
interface Coverage { competency: CompetencyRef; question_count: number; planned: number }  // question_count = 0 → "Chưa đánh giá"
```

## 3. Endpoint

### Đăng nhập (`UI-11`, dùng khi bật đăng nhập thật)
| Method | Path | Body | Trả về |
|---|---|---|---|
| GET | `/api/auth/me` | | `{auth_enabled: boolean, user: {id, email} \| null}`, luôn 200. Chưa bật đăng nhập: `auth_enabled: false`, `user` là người dùng mặc định |
| POST | `/api/auth/signup` | `{email, password}` | `{user}` (201) + đặt cookie (đăng ký xong là đã đăng nhập). Mật khẩu < 10 ký tự → 422 `validation_error` (`fields.password`); email đã có → 409 `email_taken` |
| POST | `/api/auth/login` | `{email, password}` | `{user}` + đặt cookie. Sai → 401 `invalid_credentials`; sai nhiều lần → 429 `too_many_attempts` |
| POST | `/api/auth/logout` | | 204, xóa cookie |

Email so sánh không phân biệt hoa thường (backend lưu dạng chữ thường). Chưa có quên mật khẩu (cần gửi email, để sau).

### Tài khoản (`UI-11.2`, cần đăng nhập)
| Method | Path | Body | Trả về |
|---|---|---|---|
| GET | `/api/account/data` | | `AccountData`: dữ liệu hệ thống đang giữ về người dùng |
| POST | `/api/account/password` | `{current_password, new_password}` | 204. Mật khẩu hiện tại sai → 422 `validation_error` (`fields.current_password`); mật khẩu mới < 10 ký tự → 422 (`fields.new_password`). Đăng xuất mọi nơi khác, giữ phiên đăng nhập hiện tại |
| DELETE | `/api/account` | `{email}` | 204 + xóa cookie. Xóa tài khoản và **toàn bộ** dữ liệu (CV, JD, phiên, file ghi âm), không hoàn tác. `email` phải khớp email tài khoản (không phân biệt hoa thường), sai → 422 (`fields.email`) |

```ts
interface AccountData {
  cv_count: number; jd_count: number; session_count: number;
  audio_count: number; audio_bytes: number;   // file ghi âm câu trả lời của ứng viên
}
```

### Danh mục
| Method | Path | Trả về |
|---|---|---|
| GET | `/api/roles` | `Role[]` |

### CV
| Method | Path | Body | Trả về |
|---|---|---|---|
| GET | `/api/cvs` | | `CvSummary[]` (mới sửa trước) |
| POST | `/api/cvs` | multipart: `file`, `name` | `CvSummary` (201), bắt đầu phân tích nền |
| GET | `/api/cvs/{id}` | | `CvSummary` |
| PATCH | `/api/cvs/{id}` | `{name}` | `CvSummary` |
| DELETE | `/api/cvs/{id}` | | 204, xóa kèm mọi phiên dùng CV này |
| GET | `/api/cvs/{id}/analysis` | | `AnalysisProgress` |
| GET | `/api/cvs/{id}/versions` | | `{version, created_at, origin}[]` |
| GET | `/api/cvs/{id}/versions/{v}` | | `CvVersion` (`v` = `latest` được) |
| POST | `/api/cvs/{id}/versions` | `{base_version, profile}` | `CvVersion` (bản mới). `base_version` cũ hơn bản mới nhất → 409 `version_conflict` |
| POST | `/api/cvs/{id}/reanalyze` | | `AnalysisProgress` (202) |
| GET | `/api/cvs/{id}/file` | | File gốc |
| GET | `/api/cvs/{id}/sessions` | | `SessionSummary[]` (kèm bản CV đã dùng trong `cv.version`) |

### JD
Như CV, khác ở:
| Method | Path | Body | Trả về |
|---|---|---|---|
| POST | `/api/jds` | JSON `{name, text}` (dán) **hoặc** multipart `name`, `file` (PDF/DOCX ≤ 5 MB) | `JdSummary` (201) |
| GET | `/api/jds/{id}` | | `JdDetail` |
| POST | `/api/jds/{id}/versions` | `{base_version, requirements}` | `JdVersion` |

Tải JD bằng file: server trích chữ **ngay trong request** (JD ngắn nên nhanh), lưu vào `text` rồi phân tích như JD dán. Lỗi trả ngay: 415 `unsupported_file`, 413 `file_too_large`, 422 `no_text_in_file`, 422 `validation_error` với `fields.file` khi chữ trích được dài quá giới hạn JD. Không lưu file gốc (chỉ cần `text`), nên không có `/file`.

### Phiên
| Method | Path | Body | Trả về |
|---|---|---|---|
| GET | `/api/sessions` | | `SessionSummary[]` (mới tạo trước; sidebar tự nhóm theo ngày) |
| POST | `/api/sessions` | `{cv_id, jd_id, role_id \| null, role_custom \| null, level}` | `SessionSummary` (201). Dùng bản mới nhất của CV/JD |
| GET | `/api/sessions/{id}` | | `SessionSummary` |
| PATCH | `/api/sessions/{id}` | `{cv_version?, jd_version?}` | Chuyển phiên sang bản mới sau khi sửa ở trang Đối chiếu. Phiên đã bắt đầu → 409 `session_locked` |
| DELETE | `/api/sessions/{id}` | | 204, xóa kèm transcript, audio |

### Kế hoạch
| Method | Path | Trả về |
|---|---|---|
| POST | `/api/sessions/{id}/blueprint` | `BlueprintView` (202, tạo / tạo lại, chạy nền) |
| GET | `/api/sessions/{id}/blueprint` | `BlueprintView` (polling khi `status` là `running`) |

### Phỏng vấn
| Method | Path | Body | Trả về |
|---|---|---|---|
| POST | `/api/sessions/{id}/start` | `{mode}` | **SSE**: câu hỏi đầu tiên |
| GET | `/api/sessions/{id}/transcript` | | `{session: SessionSummary, items: TranscriptItem[], summary: SessionSummaryBlock \| null}` |
| POST | `/api/sessions/{id}/turns` | `{text}` | **SSE**: lời AI cho lượt tiếp |
| POST | `/api/sessions/{id}/events` | `{type: "REPEAT" \| "CLARIFY" \| "HINT" \| "SKIP"}` | **SSE**: lời AI (nhắc lại, giải thích, gợi ý, hoặc câu tiếp sau khi bỏ qua). Nút bấm, không qua classify |
| POST | `/api/sessions/{id}/stop` | | `SessionSummaryBlock` |
| PATCH | `/api/sessions/{id}/mode` | `{mode}` | `SessionSummary` (server ghi sự kiện `MODE_CHANGE`) |

**Sự kiện SSE** (`event:` + `data:` JSON):

| `event` | `data` | Ý nghĩa |
|---|---|---|
| `message_start` | `{item_id, kind: "question" \| "event", event_type?: EventType}` | AI bắt đầu một lời mới |
| `token` | `{text}` | Một đoạn chữ |
| `message_done` | `{item: TranscriptItem}` | Lời đã xong, bản đầy đủ đã lưu |
| `user_item` | `{item: TranscriptItem}` | Câu trả lời / sự kiện của ứng viên đã được lưu (để web thay bản tạm) |
| `progress` | `{asked, planned}` | "Câu 4/~12" |
| `session_ended` | `SessionSummaryBlock` | Kết thúc, không còn lượt nào |
| `error` | `{code, message}` | Lỗi giữa stream; web lấy lại transcript |

### Xem lại
| Method | Path | Body | Trả về |
|---|---|---|---|
| GET | `/api/sessions/{id}/coverage` | | `Coverage[]` |
| PATCH | `/api/answers/{id}` | `{text_edited}` | `TranscriptItem` (answer). Giữ `text_original` |
| GET | `/api/answers/{id}/audio` | | File audio |

### Voice (chốt ở `BE-7`)
- `POST /api/sessions/{id}/voice/offer` trao đổi SDP cho transport `smallwebrtc`.
- Sự kiện qua data channel: chưa chốt.

## 4. Còn mở

1. `agents.md` A1 ghi "code loại mục không có câu gốc", nhưng trang Đối chiếu có cảnh báo "Không tìm thấy câu gốc". File này giả định: **claim** không tìm thấy câu gốc được giữ lại với `quote_status = "not_found"` để người dùng kiểm tra; skill/kinh nghiệm thì loại. Backend cần xác nhận.
2. Giới hạn ký tự ở mục 1 là đề xuất.
3. Sinh lời AI thất bại sau khi client đã ngắt (vd: `llm_error`): transcript sẽ không bao giờ có câu tiếp theo, web chờ 30s rồi chỉ cho "Thử lại" (tải lại transcript) hoặc dừng phiên. Cần quyết định: backend tự thử lại, hay thêm endpoint để web yêu cầu sinh lại lượt AI.
4. `email_taken` cho người khác biết một email đã đăng ký (lộ danh sách email). Chặn hẳn thì cần xác minh email qua thư, chưa có ở bản đầu. Tạm chấp nhận; backend nên giới hạn số lần đăng ký theo IP.
