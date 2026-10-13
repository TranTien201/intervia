# Task: Web frontend (`web/`)

- Cập nhật: 2026-10-12 (xong UI-0.2, UI-1, UI-2.1, UI-2.2, UI-2.3, UI-2.4, UI-2.5, UI-2.6; UI-0.3 có bản nháp)
- Thiết kế: `docs/design/ui.md` (màu, chữ, trạng thái voice), `docs/design/ui-pages.md` (trang, bố cục). Số trang `[2]`, `[3]`… theo `ui-pages.md` mục 1.
- Stack: React 19 + Vite + TypeScript, Tailwind 4, shadcn/ui, Pipecat client + Pipecat UI (đã chốt 2026-10-12).

---

## UI-0. Quyết định trước khi code

### UI-0.1 Chốt stack web
- [x] Xác nhận: React 19 + Vite + TS (strict), Tailwind 4, shadcn/ui, React Router, TanStack Query, MSW, Vitest + Testing Library, Playwright.
- [ ] Kiểm tra Pipecat client SDK (dời sang đầu `UI-9`, vì cần biết danh sách sự kiện từ BE-7) (`@pipecat-ai/client-js`, `client-react`, transport `small-webrtc`) và Pipecat UI chạy được với React 19 + Tailwind 4 (một trang thử kết nối là đủ, không cần backend thật).
- **Xong khi:** CLAUDE.md mục "Tech stack" chuyển dòng Web từ "đề xuất" sang "đã chốt".

### UI-0.2 Chốt các câu hỏi mở ảnh hưởng UI
- [x] **Blueprint sửa được hay chỉ xem?** → Chỉ xem. `agents.md` A3 ghi "người dùng xem và sửa được", `ui-pages.md` trang 4 ghi "chỉ xem ở MVP-1". Đề xuất: chỉ xem ở MVP-1 (ít màn hình, ít trường hợp validate), sửa `agents.md` cho khớp.
- [x] **Nút "Gợi ý":** → Giữ, gửi `HINT`. `agents.md` mục 3.4 đã xếp "xin gợi ý" vào `CLARIFY` + `hint_level`. Đề xuất: giữ nút, gửi sự kiện `HINT` (nút bấm không cần classify), cập nhật câu hỏi mở 1 của `ui-pages.md`.
- [ ] **Barge-in:** quyết định có nút "Dừng đọc" (chỉ cần nếu không cho ngắt lời bằng giọng). Có thể để tới `UI-9`.
- [x] **Đặt tên phiên:** → Không, chỉ "Role · Level · ngày". có hay chỉ "Role · Level · ngày" (ảnh hưởng menu ⋮ của sidebar).
- **Xong khi:** các câu đã chốt được ghi vào CLAUDE.md / `ui-pages.md` mục 5.

### UI-0.3 Hợp đồng API cho MVP-1
Viết `docs/design/api.md`: endpoint, request/response, mã lỗi. Làm cùng backend. **Đã có bản nháp do phía web viết, chờ backend duyệt.** Danh sách tối thiểu:

| Nhóm | Endpoint | Dùng ở trang |
|---|---|---|
| Danh mục | `GET /api/roles` (danh sách vị trí cố định) | 2 |
| CV | `GET/POST /api/cvs` (upload multipart), `GET/PATCH/DELETE /api/cvs/{id}`, `GET /api/cvs/{id}/versions[/{v}]`, `POST /api/cvs/{id}/versions` (lưu hồ sơ đã sửa = bản mới), `POST /api/cvs/{id}/reanalyze`, `GET /api/cvs/{id}/file`, `GET /api/cvs/{id}/sessions` | 2, 3, 7, 8 |
| JD | Tương tự CV; tạo bằng text (JSON) hoặc file PDF/DOCX (multipart) | 2, 3, 7, 9 |
| Phân tích | Trạng thái chạy A1/A2: các bước + lỗi (polling hoặc SSE) | 3 |
| Phiên | `GET /api/sessions` (sidebar), `POST /api/sessions`, `GET/PATCH/DELETE /api/sessions/{id}`, `GET /api/sessions/{id}/match` (khối đối chiếu do code tính) | 1, 2, 3, sidebar |
| Kế hoạch | `POST /api/sessions/{id}/blueprint` (tạo/tạo lại), `GET …/blueprint` (đã bỏ seed question và claim cần kiểm chứng) | 4 |
| Phỏng vấn | `POST …/start`, `GET …/transcript` (khôi phục), `POST …/turns` (câu trả lời text → stream lời AI), `POST …/events` (REPEAT/CLARIFY/HINT/SKIP), `POST …/stop`, `PATCH …/mode` | 5 |
| Xem lại | `PATCH /api/answers/{id}` (bản đã sửa), `GET /api/answers/{id}/audio` | 6 |
| Voice | Endpoint trao đổi SDP cho `smallwebrtc` + danh sách sự kiện server gửi qua data channel | 4, 5 |

- [x] Chốt cách stream lời AI ở chế độ Text (bản nháp): **SSE** (đề xuất: đơn giản, tự kết nối lại) hay fetch stream.
- [x] Chốt định dạng lỗi chung (bản nháp) (`{code, message}`), để UI hiện đúng câu báo lỗi theo `code`.
- [x] Chốt các sự kiện stream (bản nháp): `token`, `question_done`, `progress` (`{asked, planned}`), `session_ended` (kèm tóm tắt), `error`.
- **Xong khi:** `api.md` có đủ bảng trên, cả hai bên đồng ý. **Cần:** BE-0 (khung FastAPI) nếu muốn sinh OpenAPI ngay.

---

## UI-1. Khung dự án web

### UI-1.1 Tạo dự án
- [x] `web/` bằng Vite (template react-ts), TypeScript `strict`, alias `@/` → `src/`.
- [x] oxlint (template Vite mới, thay ESLint) + Prettier; script `dev`, `build`, `lint`, `typecheck`, `test`.
- [x] Cấu trúc thư mục:
  ```
  web/src/
    app/            # router, providers (Query, Router), layouts
    pages/          # mỗi trang một thư mục: home, session-new, session-match, session-plan,
                    # interview, review, library, cv-detail, jd-detail, not-found
    features/       # logic theo nghiệp vụ, dùng chung giữa các trang:
                    # sessions, library, profile (trình sửa hồ sơ), interview, voice
    components/ui/  # thành phần gốc của shadcn/ui
    components/     # thành phần dùng chung tự viết (UI-2)
    api/            # client, type sinh từ OpenAPI, hook TanStack Query
    mocks/          # MSW handlers + dữ liệu mẫu
    styles/         # tokens.css, fonts
  ```
- [x] Proxy `/api` tới backend (`VITE_API_URL`, mặc định `http://localhost:8000`).
- **Xong khi:** `npm run dev` hiện trang trống, `lint`, `typecheck`, `build` đều qua.

### UI-1.2 Token màu, chữ, font
- [x] `styles/tokens.css`: toàn bộ token bảng Sương lam (`ui.md` mục 2), khai báo trên `:root`. Không dùng `#FFFFFF` ở đâu cả.
- [x] Map token vào Tailwind 4 (`@theme`), để viết `bg-surface`, `text-ink2`, `bg-accent-soft`…
- [x] Be Vietnam Pro (400/500/600/700) và JetBrains Mono qua Fontsource, tự host. Kiểm tra dấu tiếng Việt hiển thị đúng ("Phỏng vấn", "Đối chiếu", "ượ", "ữ").
- [x] Lớp chữ theo `ui.md` mục 3: tiêu đề trang 28/600, câu hỏi AI 18/400 lh 1.6, thân 15, nhãn 12/600 hoa giãn 0.08em, code 14 mono.
- [x] Bo góc 8–12px, bóng rất nhẹ (một biến `--shadow-card`).
- **Xong khi:** một trang thử hiện đủ các màu và cỡ chữ, khớp `docs/design/ui-preview.html` ở chế độ Sương lam.

### UI-1.3 shadcn/ui
- [x] Khởi tạo shadcn/ui, trỏ biến màu của shadcn (`--primary`, `--background`, `--destructive`…) vào token Intervia.
- [x] Thêm các thành phần gốc cần dùng: button, input, textarea, radio-group, select, tabs, dropdown-menu, dialog/alert-dialog, tooltip, sheet (menu trượt điện thoại), skeleton, sonner (thông báo).
- **Xong khi:** các thành phần gốc dùng đúng màu Sương lam, không còn màu mặc định của shadcn.

### UI-1.4 Router và layout
- [x] React Router với đủ đường dẫn MVP-1 (`ui-pages.md` mục 1), mỗi trang tạm là tiêu đề.
- [x] 3 layout: `SidebarLayout` (trang 1–4, 6–9, lỗi), `FullscreenLayout` (trang 5, ẩn sidebar), `BlankLayout` (trang 11, để dành).
- [x] Độ rộng nội dung: trang form tối đa 1040px; cột hội thoại trang 5 tối đa 760px; trang 6 cột chính co giãn + cột phải 280px.
- [x] Route `*` → trang Không tìm thấy.
- **Xong khi:** gõ từng đường dẫn đều ra đúng layout.

### UI-1.5 Lớp dữ liệu
- [x] `api/client.ts`: fetch có kiểu, gắn base URL, đọc lỗi chung `{code, message}`, phân biệt lỗi mạng (không kết nối được máy chủ) với lỗi nghiệp vụ.
- [x] Sinh type từ OpenAPI của FastAPI (`openapi-typescript`), script `npm run gen:api`. Trước khi có backend: viết tay type theo `api.md` (`src/api/types.ts`).
- [x] TanStack Query: hook cho từng nhóm endpoint (`useSessions`, `useCv`, `useCreateSession`…), quy ước query key, invalidate sau khi sửa/xóa.
- [x] Hàm đọc SSE dùng chung (cho phân tích CV/JD và lời AI chế độ Text).
- **Xong khi:** một trang gọi được `GET /api/sessions` (qua mock) và hiện đủ 4 trạng thái.

### UI-1.6 API giả (MSW)
- [x] MSW bật khi `VITE_USE_MOCK=true`. Handler cho mọi endpoint ở `UI-0.3`. Dữ liệu lưu trong `sessionStorage` (giữ qua tải lại trang để thử khôi phục phiên ở `UI-6.5`; `__mock.reset()` để về dữ liệu mẫu).
- [x] Dữ liệu mẫu tiếng Việt: 2 CV (1 có claim không tìm thấy câu gốc), 3 JD, 4 phiên ở đủ 3 trạng thái, 1 transcript đầy đủ có sự kiện nhắc lại/gợi ý/bỏ qua.
- [x] Giả lập độ trễ và lỗi: phân tích CV mất ~5s qua từng bước; lời AI stream từng token; công tắc để ép lỗi (mạng, LLM lỗi, file scan không có chữ).
- **Xong khi:** đi hết luồng 2 → 3 → 4 → 5 → 6 chỉ bằng mock. (Phần mock đã có test `src/mocks/mock-api.test.ts`; đi bằng giao diện kiểm tra lại khi xong UI-5 → UI-7.)

### UI-1.7 Test
- [x] Vitest + Testing Library + MSW cho test thành phần.
- [x] Playwright (cấu hình sẵn, viết test ở `UI-10`).
- **Xong khi:** `npm test` chạy được một test mẫu.

---

## UI-2. Thành phần dùng chung

Mỗi thành phần có đủ trạng thái (thường, hover, focus thấy rõ, disabled) và có trong trang xem thử `/dev/components` (chỉ bật ở chế độ dev).

### UI-2.1 Thành phần cơ bản
- [x] `Button`: primary (accent), secondary, ghost, danger (chỉ cho xóa dữ liệu). Có trạng thái đang chạy.
- [x] `SectionLabel`: nhãn chữ hoa 12/600 ("HỒ SƠ CỦA BẠN", "YÊU CẦU CỦA JD").
- [x] `Card`: nền surface, viền line, bo 8–12px.
- [x] `Tag`: tag kỹ năng nền subtle, có nút ✕ tùy chọn; `TagInput` có "+ Thêm".
- [x] `Badge`: "Bắt buộc" (accent-soft), "Nên có" (subtle), "Đã lưu" (ok-soft).
- [x] `StatusDot`: chưa bắt đầu (subtle), đang dở (amber), đã xong (ok); luôn có chữ thay thế cho trình đọc màn hình.
- [x] `KebabMenu` (⋮) dựa trên dropdown-menu.
- [x] `WeightBar`: thanh trọng số / độ phủ ("██████░░ 30%").
- [x] `NotAssessed`: chữ "Chưa đánh giá" màu ink2, in nghiêng. **Không bao giờ màu đỏ.**
- **Đã xong (2026-10-12):** `src/components/` (`Badge`, `Card`, `KebabMenu`, `NotAssessed`, `SectionLabel`, `StatusDot`, `Tag`/`TagInput`, `WeightBar`; `Button` thêm biến thể `danger` và prop `loading`). Có trong `/dev/components`, test ở `src/components/base.test.tsx`.

### UI-2.2 Trạng thái trang
- [x] `PageSkeleton` (khung xám mờ đúng hình nội dung sắp hiện), `EmptyState` (chữ + nút hành động), `ErrorState` (lỗi gì + cách xử lý + nút thử lại).
- [x] `QueryView`: bọc một query, tự chọn 1 trong 4 trạng thái. Mọi trang dùng nó để không quên trạng thái nào.
- [x] `Banner`: thông tin / cảnh báo (amber) / lỗi (danger), có thể đóng.
- [x] Thông báo nhỏ "Đã lưu" (sonner, màu ok).
- **Đã xong (2026-10-12):** `src/components/PageStates.tsx` (`PageSkeleton` có 3 hình: `list`, `detail`, `transcript`; `EmptyState` thêm `title`), `src/components/Banner.tsx`, `src/lib/notify.ts` (`notifySaved()`); sonner bật `richColors`, cả 4 loại thông báo dùng token Intervia. Có trong `/dev/components`, test ở `src/components/page-states.test.tsx`.

### UI-2.3 Xác nhận trong trang
- [x] `InlineConfirm`: hộp xác nhận nằm ngay trong trang (không popup trình duyệt), có tiêu đề, mô tả hậu quả, nút danger + nút "Giữ lại". Dùng cho: xóa phiên, xóa CV/JD, dừng phỏng vấn.
- [x] Biến thể liệt kê dữ liệu bị xóa ("CV này được dùng trong 4 phiên…").
- **Đã xong (2026-10-12):** `src/components/InlineConfirm.tsx`. Focus sẵn vào nút an toàn, Esc để hủy, `pending` khóa cả hai nút trong lúc gọi API. Prop `affected` liệt kê tối đa 5 mục, còn lại gộp thành "và N phiên khác". "Dừng phỏng vấn" dùng `tone="default"` (nút thường, nhãn hủy "Tiếp tục") vì màu đỏ chỉ dành cho xóa dữ liệu. Có trong `/dev/components`, test ở `src/components/inline-confirm.test.tsx`.

### UI-2.4 Thanh bước
- [x] `Stepper`: ① Chọn CV & JD ── ② Đối chiếu ── ③ Kế hoạch; bước xong (ok), bước hiện tại (accent), bước sau (ink2).
- [x] Bước đã qua bấm được để quay lại; bước chưa tới không bấm được.
- [x] Điện thoại: rút gọn thành "Bước 2/3 · Đối chiếu".
- **Đã xong (2026-10-12):** `src/components/Stepper.tsx` (`Stepper` nhận `steps` + `current` tính từ 0; `SESSION_STEPS` là 3 nhãn). Bước xong có dấu ✓ và là link nếu có `href`; bước hiện tại có `aria-current="step"`. Trang nào truyền `href` cho bước nào là việc của UI-5. Có trong `/dev/components`, test ở `src/components/stepper.test.tsx`.

### UI-2.5 Tải file
- [x] `FileDropzone`: kéo thả hoặc "Chọn file", chỉ PDF/DOCX, tối đa 5 MB, báo lỗi ngay dưới ô (sai định dạng, quá lớn), hiện tên file đã chọn + nút đổi.
- [x] Ghi chú quyền riêng tư nhỏ dưới ô.
- **Đã xong (2026-10-12):** `src/components/FileDropzone.tsx`, kiểm tra file ở `src/lib/files.ts` (`validateCvFile`, `CV_MAX_BYTES`, `formatFileSize`). Kiểm tra theo đuôi file (trình duyệt hay để trống MIME của DOCX); chặn cả file rỗng và thả nhiều file một lúc. File sai không tới `onChange` và file đã chọn trước đó được giữ. Prop `error` để hiện lỗi từ máy chủ (`file_too_large`, `unsupported_file`). Có trong `/dev/components`, test ở `src/components/file-dropzone.test.tsx`.

### UI-2.6 Viên trạng thái voice
- [x] `VoiceStatusPill`: 6 trạng thái theo `ui.md` mục 4 (đang kết nối, đang nghe bạn, cứ từ từ suy nghĩ, đang xử lý, AI đang nói, không dùng được mic): màu, chữ, chuyển động (ba chấm / sóng âm / chấm tĩnh).
- [x] Tắt chuyển động khi `prefers-reduced-motion`.
- [x] `aria-live="polite"` cho chữ trạng thái.
- **Đã xong (2026-10-12):** `src/components/VoiceStatusPill.tsx` (type `VoiceState`: `connecting`, `listening`, `thinking`, `processing`, `speaking`, `mic_unavailable`). Chuyển động `animate-voice-dot`, `animate-voice-wave` khai báo trong `src/index.css`; tắt bằng `motion-reduce:animate-none`, kèm luật reduced-motion chung. Chữ nằm trong `role="status"` + `aria-live="polite"`; trang dùng phải giữ nguyên viên và chỉ đổi `state`, không gắn lại, để trình đọc màn hình không bỏ sót. Có trong `/dev/components` (công tắc 6 trạng thái), test ở `src/components/voice-status-pill.test.tsx`.
- **Xong khi:** trang `/dev/components` có công tắc chuyển qua 6 trạng thái.

---

## UI-3. Sidebar và khung trang

### UI-3.1 Sidebar: phần cố định
- [x] Rộng 260px, nền surface; logo "Intervia"; nút "+ Phiên mới" luôn trên cùng → `/sessions/new`.
- [x] Cuối sidebar: "Thư viện CV & JD"; "Tài khoản" ẩn tới khi bật đăng nhập; chừa chỗ "Tiến bộ", "Lộ trình" (không hiện ở MVP-1).

### UI-3.2 Sidebar: danh sách phiên
- [x] Nhóm theo thời gian: Hôm nay, 7 ngày qua, Cũ hơn. Mỗi dòng: `StatusDot` + "Role · Level".
- [x] Bấm phiên → trang theo trạng thái: chưa bắt đầu → bước đang dừng (2/3/4); đang dở → 5; đã xong → 6. API cần trả về bước hiện tại của phiên.
- [x] Phiên đang mở tô nền accent-soft.
- [x] Di chuột hiện ⋮: Xóa phiên và dữ liệu (`InlineConfirm`). Xóa phiên đang mở → về `/`.
- [x] Trống: dòng chữ phụ "Chưa có phiên nào".

### UI-3.3 Thu gọn và điện thoại
- [x] Thu gọn thành dải biểu tượng hẹp, nhớ lựa chọn (localStorage).
- [x] Điện thoại: menu trượt từ trái (sheet), mở bằng ☰.

### UI-3.4 Trang lỗi
- [x] Không tìm thấy (sai đường dẫn hoặc phiên đã xóa): "Không tìm thấy phiên này. Có thể phiên đã bị xóa." + nút về danh sách.
- [x] Không kết nối được máy chủ: "Không kết nối được máy chủ Intervia. Kiểm tra backend đã chạy chưa." + nút thử lại. Dùng chung cho mọi trang khi gặp lỗi mạng.

---

## UI-4. Thư viện CV & JD [7] [8] [9]

### UI-4.1 Trang Thư viện `/library` [7]
- [x] Tab CV (số lượng) / JD (số lượng), tab nhớ trên URL (`?tab=jd`).
- [x] Danh sách CV: tên, tên file, bản mấy, ngày sửa/thêm, "Dùng trong N phiên", ⋮.
- [x] Danh sách JD: tên, công ty/vị trí (nếu có), số yêu cầu, số phiên đã dùng, ⋮.
- [x] Nút "+ Tải CV mới" / "+ Thêm JD" (hộp thoại dùng lại form của trang 2).
- [x] ⋮: Đổi tên · Tạo phiên mới với CV/JD này (→ trang 2 chọn sẵn) · Xóa (hộp xác nhận ở UI-4.2).
- [x] Trống: "Chưa có CV nào. Thêm CV để dùng lại cho nhiều phiên luyện tập." + nút tải lên.

### UI-4.2 Xóa CV/JD
- [x] `InlineConfirm` liệt kê số phiên đang dùng: "Xóa CV sẽ xóa luôn N phiên đó, gồm transcript và file ghi âm." Hai nút: "Xóa CV và N phiên" / "Giữ lại". **Không** có lựa chọn xóa CV mà giữ phiên.
- [x] Xóa xong: cập nhật danh sách và sidebar.

### UI-4.3 Trình sửa hồ sơ (dùng chung trang 3 và 8) — `features/profile`
- [x] Kỹ năng: `TagInput` (thêm, xóa).
- [x] Kinh nghiệm: danh sách công ty/dự án · vai trò · thời gian, bấm ✎ sửa tại chỗ.
- [x] Claim: `ClaimCard` gồm phát biểu + câu gốc trong ngoặc kép (chữ phụ) + [Sửa] [Xóa].
- [x] Claim không tìm thấy câu gốc: viền/nền amber, "⚠ Không tìm thấy câu gốc trong CV · [Kiểm tra]" (mở file gốc / đoạn text đã trích).
- [x] Lưu = tạo bản mới. Sau khi lưu: "bản 3" → "bản 4", thông báo "Đã lưu". Có trạng thái đang lưu và lỗi lưu (không mất phần đã sửa).
- [x] Chế độ chỉ xem (cho bản cũ trong lịch sử).
- **Xong khi:** có test thành phần cho thêm/xóa kỹ năng, sửa claim, hiện cảnh báo câu gốc.

### UI-4.4 Trình sửa yêu cầu JD (dùng chung trang 3 và 9) — `features/profile`
- [x] Danh sách yêu cầu: tên competency + `Badge` Bắt buộc/Nên có, đổi qua lại được.
- [x] Mục "Không map được" (`unmapped`) để người dùng xem lại.
- [x] Lưu = tạo bản mới, như `UI-4.3`.

### UI-4.5 Chi tiết CV `/library/cv/:id` [8]
- [x] Đầu trang: "← Thư viện", tên CV ✎ (đổi tên tại chỗ), "Tạo phiên với CV này".
- [x] Dòng thông tin: tên file · [Xem file gốc] · bản N [▾ lịch sử]. Chọn bản cũ → chế độ chỉ xem + banner "Đang xem bản 2 (chỉ xem)". Hỗ trợ URL `?v=2` (trang 6 mở đúng bản).
- [x] Cột trái: trình sửa hồ sơ (`UI-4.3`). Cột phải: "Đã dùng trong" (phiên + bản CV đã dùng, bấm → trang 6).
- [x] ⋮: "Phân tích lại" (chạy lại A1 → bản mới, hiện tiến trình như trang 3).
- [x] Cuối trang: "Xóa CV và dữ liệu liên quan" (`UI-4.2`).

### UI-4.6 Chi tiết JD `/library/jd/:id` [9]
- [x] Bố cục như trang 8. Cột trái: văn bản JD gốc (thu gọn được) + trình sửa yêu cầu (`UI-4.4`). Cột phải: phiên đã dùng.
- [x] Lịch sử phiên bản, phân tích lại, xóa: như trang 8.

---

## UI-5. Luồng tạo phiên [2] [3] [4]

### UI-5.1 Tạo phiên `/sessions/new` [2]
- [x] Hai cột CV | JD. Mỗi cột: (•) Dùng có sẵn [chọn ▾] + dòng tình trạng ("Đã phân tích · sửa 08/10") / ( ) Tải CV mới (`FileDropzone`) hoặc Dán JD mới (textarea).
- [x] Ô tên CV/JD, gợi ý sẵn từ tên file / dòng đầu JD.
- [x] Thư viện trống: chỉ hiện ô tải mới và ô dán mới, không có lựa chọn "có sẵn".
- [x] Vị trí: chọn từ `GET /api/roles` + "Khác" (ô nhập). Cấp độ: Junior / Mid / Senior.
- [x] Validate trước khi gửi: có CV, có JD, JD không rỗng và không quá dài (giới hạn lấy từ `api.md`), có vị trí, có cấp độ. Lỗi hiện ngay dưới ô sai.
- [x] Nhận tham số chọn sẵn từ URL (`?cv=…&jd=…&level=…`) cho "Tạo phiên với CV này" và "Luyện lại".
- [x] "Tiếp tục" → tải lên CV/JD mới (nếu có) → tạo phiên → `/sessions/:id/match`. Nút có trạng thái đang chạy, chặn bấm hai lần.
- **Đã xong (2026-10-12):** `src/pages/session-new/index.tsx`, dùng lại `CvUploadFields`/`JdPasteFields` của thư viện (`Field` thêm prop `hideLabel`). Mặc định chọn CV/JD sửa hoặc thêm gần nhất (đầu danh sách). URL nhận thêm `role` (cho "Luyện lại" giữ nguyên vị trí); id không có trong thư viện thì bỏ qua. Ô chọn CV/JD/vị trí là `<select>` gốc (bàn phím, trình đọc màn hình chạy sẵn). Nếu CV/JD mới đã lưu xong mà bước sau lỗi, bấm lại không tải lên lần nữa (tránh trùng trong thư viện). Lỗi 422 của `POST /sessions` hiện dưới đúng ô. Test ở `src/pages/session-new/session-new.test.tsx` (cả 4 tổ hợp, thư viện trống, validate, URL, "Khác", bấm hai lần, thử lại). `src/test/setup.ts` thêm `ResizeObserver` giả cho Radix.
- **Xong khi:** cả 4 tổ hợp (CV có sẵn/mới × JD có sẵn/mới) đều tạo được phiên.
- [x] JD mới thêm được bằng file PDF/DOCX ngoài cách dán (trang 2 và hộp thoại "+ Thêm JD" ở thư viện).
- **Đã xong (2026-10-12):** `JdFields` (thay `JdPasteFields`) trong `src/features/library/fields.tsx`: hai tab "Dán nội dung" / "Tải file", giữ cả hai giá trị khi đổi tab, tên gợi ý từ tên file. `FileDropzone` và `src/lib/files.ts` dùng chung cho CV và JD (`validateUploadFile`, `UPLOAD_ACCEPT`). `useCreateJd` gửi JSON hoặc multipart. `no_text_in_file` của JD trả ngay khi tải lên và hiện dưới ô file. Nhãn đổi thành "Thêm JD mới" (trang 2) và "Thêm JD khác" (trang 3). Mock: `jdTextFromFile()` trong `src/mocks/db.ts` (tên file có "scan" → không có chữ). `api.md` đã ghi cách gửi file JD. Test ở `session-new.test.tsx` và `mock-api.test.ts`.

### UI-5.2 Đối chiếu `/sessions/:id/match` [3] — đang phân tích
- [x] Danh sách bước: ✓ xong / ◌ đang chạy (ba chấm) / ○ chưa chạy: "Đã tải CV", "Đang đọc CV…", "Phân tích JD".
- [x] Khung xám mờ ở vị trí nội dung sắp hiện.
- [x] Tải lại trang giữa chừng: tiếp tục theo dõi tiến trình, không chạy lại.
- [x] Lỗi: nói rõ lý do (file scan không có chữ, LLM lỗi) + "Thử lại" / "Tải file khác" (→ trang 2).
- **Đã xong (2026-10-12):** `src/pages/session-match/index.tsx`. Ghép bước của CV rồi JD thành một danh sách, dùng lại `AnalysisSteps` (đã có khung xám mờ). Trạng thái lấy từ `GET …/analysis` (polling), nên tải lại trang chỉ theo dõi tiếp, không gọi `reanalyze`. Khi xong thì làm mới danh sách CV/JD, phiên (bản CV/JD của phiên nháp) và `…/match`. Lỗi: câu báo theo `code` (`codeMessage` mới trong `src/lib/errors.ts`); file scan (`no_text_in_file`) không có "Thử lại" vì chạy lại vẫn lỗi; "Tải file khác" / "Dán JD khác" mở trang 2 giữ JD (hoặc CV), vị trí, cấp độ, qua `newSessionPath()` trong `session-nav.ts`. Trang 2 nhận thêm `cv=new` / `jd=new` để chọn sẵn ô tải mới. Bước ① trên thanh bước cũng dẫn về trang 2 theo cách này. Lưu ý: cách này tạo phiên mới, phiên nháp lỗi vẫn nằm trong sidebar (xóa tay được). Phần "đã xong" để `UI-5.3`. Test ở `src/pages/session-match/session-match.test.tsx`.

### UI-5.3 Đối chiếu [3] — đã xong
- [x] Hai cột: trái là hồ sơ CV (tên + bản N + "Sửa trong thư viện ↗"), phải là yêu cầu JD.
- [x] Dùng trình sửa `UI-4.3`, `UI-4.4`; lưu ở đây tạo bản mới và phiên chuyển sang dùng bản mới.
- [x] Khối "Đối chiếu" (dữ liệu từ `…/match`, do code tính): "✓ Có trong CV: 3/4 bắt buộc", "– Chưa thấy trong CV: …". Chữ trung tính, không phải điểm, không dùng đỏ.
- [x] CV/JD có sẵn đã phân tích: hiện ngay, không qua màn hình tiến trình.
- [x] Chân trang: "← Quay lại" / "Lưu và tạo kế hoạch →" (gọi tạo blueprint, sang trang 4).
- **Đã xong (2026-10-12):** `src/pages/session-match/MatchDone.tsx`. Mỗi cột hiện **bản mà phiên đang dùng** (không phải bản mới nhất). Nếu thư viện đã có bản mới hơn: cột đó chỉ xem (lưu từ bản cũ sẽ bị 409 `version_conflict`) + banner "Thư viện đã có bản N mới hơn" [Dùng bản N]. "Sửa trong thư viện ↗" mở thẻ mới để không mất phần đang sửa. Lưu trong trình sửa → `PATCH /sessions/:id` chuyển phiên sang bản mới. "Lưu và tạo kế hoạch": lưu phần chưa lưu của cả hai trình sửa (trình sửa có `ref` mới `VersionedEditorHandle.save()`), chuyển phiên sang bản mới, gọi `POST …/blueprint` rồi sang trang 4; không gọi lại nếu kế hoạch đã có (hoặc đang tạo) cho đúng bản đó. Lưu lỗi thì ở lại trang, giữ phần đã sửa. Khối "Đối chiếu" hiện cả bắt buộc lẫn nên có, ghi "tính theo bản đã lưu". Làm luôn phần chỉ xem khi phiên đã bắt đầu (banner + nút "Xem kế hoạch"). Lưu bản mới nạp sẵn vào cache (`setQueryData`) để trình sửa không nháy. Test ở `src/pages/session-match/session-match.test.tsx`.

### UI-5.4 Kế hoạch & chuẩn bị `/sessions/:id/plan` [4]
- [x] Đang tạo blueprint: tiến trình + khung xám mờ (cùng kiểu trang 3).
- [x] Bảng kế hoạch: Chủ đề · Trọng số (`WeightBar` + %) · Độ sâu (L3–L4) · Số câu; tiêu đề "khoảng N câu". **Không** hiện seed question, claim cần kiểm chứng.
- [x] "ⓘ Độ sâu L1–L7 là gì?" mở đoạn giải thích ngắn.
- [x] Hồ sơ đổi sau khi đã có kế hoạch: banner "Hồ sơ đã thay đổi, tạo lại kế hoạch?" + nút tạo lại.
- [x] Chế độ bắt đầu: Text / Nói → Chữ / Nói → Nói, kèm "Đổi được trong lúc phỏng vấn."
- [x] Ô kiểm tra mic (chỉ hiện khi chọn chế độ có nói): ở bước này làm giao diện + xin quyền mic + thanh mức âm (Web Audio), phần nối voice thật ở `UI-9.2`. Mic lỗi → chế độ tự chuyển sang Text, ghi lý do và cách bật lại quyền.
- [x] "Bắt đầu phỏng vấn →" → `POST …/start` → trang 5. Sau khi bắt đầu, trang 2–4 của phiên này chuyển sang chỉ xem (đầu vào đã khóa).
- [x] Bấm thanh bước quay lại trang 3, 2 khi phiên chưa bắt đầu.
- **Đã xong (2026-10-12):** `src/pages/session-plan/` (`index.tsx`, `PlanTable.tsx`, `ModePicker.tsx`, `MicCheck.tsx`, `use-mic-test.ts`). Đang tạo: dùng lại `AnalysisSteps` ("Đã đối chiếu CV–JD" ✓, "Đang lập kế hoạch phỏng vấn…"). Mở thẳng trang khi chưa có kế hoạch thì tự gọi `POST …/blueprint` một lần. Tạo lỗi: banner + "Thử lại" / "Về trang Đối chiếu". **Kế hoạch cũ (`stale`) thì khóa nút "Bắt đầu"** tới khi tạo lại, vì phiên khóa bản CV/JD mới mà kế hoạch lại lập từ bản cũ. Mic lỗi chia 5 loại (bị chặn quyền, không có mic, mic đang bận, trình duyệt không hỗ trợ, khác), mỗi loại có lý do + cách sửa; kiểm tra mic không ghi âm, tắt mic khi dừng hoặc rời trang. "Bắt đầu": `startInterview()` trong `src/features/sessions/start-interview.ts` gọi `POST …/start`, sang trang 5 ngay khi server nhận (sự kiện SSE đầu tiên), stream câu hỏi đầu vẫn chạy tiếp và được giữ lại; **`UI-6` đọc nó bằng `takeStartStream(id)`** để hiện câu hỏi đầu đang stream (nếu không có thì lấy transcript). Lỗi 409 thì ở lại trang, báo lý do và làm mới phiên + kế hoạch. Phiên đã bắt đầu: banner "kế hoạch đã khóa", ẩn chọn chế độ/mic, nút "Vào phỏng vấn" / "Xem lại phiên", thanh bước không còn link. Thêm `MODE_LABEL` (`src/lib/format.ts`), mã lỗi `blueprint_not_ready` (`src/lib/errors.ts`). Test ở `src/pages/session-plan/session-plan.test.tsx` (mic giả bằng `getUserMedia` + `AudioContext` giả).

---

### UI-5.5 Bỏ competency catalog và khối Đối chiếu (đổi thiết kế 2026-10-13)
Lý do: `docs/design/extraction.md` mục 5. Type mới: `docs/design/api.md`.
- [ ] `src/api/types.ts`: bỏ `Skill.catalog_id`, `Requirement.catalog_id`, `JdRequirements.unmapped`, `MatchResult`. `Requirement.name` giờ là nhãn ngắn rút từ JD (không còn là tên competency).
- [ ] Trình sửa yêu cầu (`UI-4.4`, `RequirementsEditor.tsx`): bỏ mục "Không map được"; mỗi dòng hiện `name` + câu gốc như cũ.
- [ ] Trình sửa hồ sơ (`ProfileEditor.tsx`): kỹ năng người dùng thêm không còn `catalog_id`.
- [ ] Trang 3 (`MatchDone.tsx`): bỏ khối "Đối chiếu" và lời gọi `GET …/match` (hook, query key, chỗ làm mới sau khi phân tích xong ở `UI-5.2`). Bố cục còn hai cột hồ sơ + yêu cầu.
- [ ] Mock: bỏ `CATALOG`, `competencyName`, hàm `match()` và handler `…/match` (`src/mocks/seed.ts`, `db.ts`, `handlers.ts`); yêu cầu JD mẫu có `name` là nhãn rút từ JD; `buildBlueprint` đặt tên competency từ `name` của yêu cầu.
- [ ] Sửa các test liên quan (`profile-editor`, `requirements-editor`, `session-match`, `mock-api`).
- **Xong khi:** `npm test`, `npm run typecheck`, `npm run lint` qua; `grep -r "catalog_id\|unmapped\|MatchResult" web/src` không còn kết quả.

### UI-5.6 Chọn chế độ trích xuất (thêm 2026-10-13)
Thiết kế: `docs/design/ui-pages.md` trang 2 ("Tùy chọn phân tích"), trang 7, 8, 9 ("Phân tích lại"); `docs/design/extraction.md` mục 8; type ở `docs/design/api.md`.
- [ ] `src/api/types.ts`: thêm `ExtractionMode`; `CvVersion.mode`, `JdVersion.mode`. Hàm API tải CV / thêm JD / phân tích lại nhận `mode`.
- [ ] Thành phần `ExtractionModePicker` (dùng chung): 3 lựa chọn dạng radio có mô tả và nhãn chi phí, thời gian; prop `kind: "cv" | "jd"` (JD ẩn "Đọc bố cục"). Nhãn tiếng Việt để trong một hằng, không rải trong trang.
- [ ] Trang 2 và nút tải ở Thư viện: mục "Tùy chọn phân tích" thu gọn dưới ô CV mới / JD mới, mặc định Tiêu chuẩn; gửi `mode` cùng form.
- [ ] "Phân tích lại" (trang 8, 9): hộp thoại chọn chế độ, chọn sẵn chế độ của bản mới nhất, có dòng gợi ý khi kết quả chưa tốt.
- [ ] Lịch sử phiên bản: hiện chế độ của từng bản (bản người dùng sửa thì không có).
- [ ] Mock: nhận và lưu `mode`; JD nhận `layout` → 422 `fields.mode`; thời gian giả lập theo chế độ (vd `precise` lâu hơn) để thấy tiến trình.
- [ ] Test: picker (JD không có "Đọc bố cục"), gửi đúng `mode` khi tạo CV/JD và khi phân tích lại.
- **Xong khi:** `npm test`, `npm run typecheck`, `npm run lint` qua.

## UI-6. Phỏng vấn chế độ Text `/sessions/:id/interview` [5]

Làm chế độ Text trọn vẹn trước; voice thêm ở `UI-9` trên cùng màn hình này.

### UI-6.1 Khung trang
- [x] Thanh trên: "Intervia · Role · Level · Câu 4/~12", chọn chế độ [Text | Nói→Chữ | Nói→Nói] (2 chế độ voice tạm khóa tới `UI-9`), nút "Dừng".
- [x] Ẩn sidebar. Cột hội thoại tối đa 760px, căn giữa.
- [x] Khu banner ở đầu cột hội thoại (mất mạng, đã khôi phục phiên, mic lỗi).
- **Đã xong (2026-10-12):** `src/pages/interview/` (`index.tsx`, `InterviewTopBar.tsx`, `ModeSwitch.tsx`). Thanh trên dính khi cuộn, xuống dòng được trên điện thoại. Chọn chế độ là radio group (phím mũi tên); chế độ voice hiện nhưng khóa, có chữ "chưa dùng được" cho trình đọc màn hình. **Tới `UI-9`, mọi phiên chạy ở Text** dù trang 4 đã chọn voice, nên trang chưa gọi `PATCH …/mode`. Nút "Dừng" có sẵn nhưng tắt tới khi `UI-6.4` truyền `onStop`. Khu banner nhận danh sách `InterviewNotice` (state của trang), hiện chưa có gì đẩy vào; `UI-6.5` (khôi phục, mất mạng) và `UI-9` (mic) sẽ dùng. Thanh dưới là khung trống dính đáy, nội dung ở `UI-6.3`. `progressLabel()` ở `src/lib/format.ts`. Test ở `src/pages/interview/interview.test.tsx`.

### UI-6.2 Hội thoại
- [x] Lượt AI: nhãn "NGƯỜI PHỎNG VẤN" (màu ai), câu hiện tại 18px màu ink; câu cũ chữ nhỏ hơn, màu phụ.
- [x] Lượt ứng viên: nhãn "BẠN", bong bóng nền surface căn phải. Code trong câu trả lời hiện bằng JetBrains Mono.
- [x] Sự kiện không phải ANSWER (nhắc lại, giải thích, gợi ý, bỏ qua) hiện thành ghi chú nhỏ màu amber giữa các lượt.
- [x] Lời AI stream: chữ hiện dần + con trỏ ▌; render text thuần (lời Speaker không có markdown).
- [x] Tự cuộn xuống khi có chữ mới, trừ khi người dùng đang cuộn lên đọc câu cũ (hiện nút "↓ Mới nhất").
- [x] Không hiện điểm, dấu đúng/sai, tên competency đang hỏi.
- **Đã xong (2026-10-12):** `src/pages/interview/` (`Conversation.tsx`, `conversation-state.ts`, `use-conversation.ts`, `use-follow-latest.ts`). Hội thoại = transcript đã lưu + phần stream thêm vào (gộp theo `id`, không trùng). `useConversation` trả về `apply(event)`: **`UI-6.3` đưa stream của `POST …/turns` và `…/events` vào đây**. Câu hỏi đầu đang stream từ trang 4 được phát lại rồi theo tiếp; `takeStartStream` đổi thành `getStartStream` (đọc không xóa, để StrictMode render hai lần không mất stream) + `dropStartStream` (trang 5 xóa khi stream đã xong). Câu AI hiện tại là dòng AI cuối cùng (kể cả lời gợi ý/giải thích). Sự kiện nhắc lại/giải thích/gợi ý = ghi chú amber + lời AI; bỏ qua, suy nghĩ, lạc đề = ghi chú amber; đổi chế độ, dừng = ghi chú màu phụ. Không hiện mức gợi ý trong phiên (để trang 6). Code trong câu trả lời: khối ``` (thiếu dấu đóng thì coi là code tới hết) và `inline`; **`UI-6.3` khi gửi ở chế độ mono nên bọc nội dung trong ``` để hiện đúng**. Stream lỗi giữa chừng: bỏ nửa câu, tải lại transcript (phần còn lại của `UI-6.5`: banner, mất mạng). Trình đọc màn hình: `role="log"` + `aria-busy` lúc đang stream để không đọc từng token. Tự cuộn cuộn cả cửa sổ (cách đáy ≤ 80px coi là đang theo dõi); nút "↓ Mới nhất" nằm trên thanh dưới. Test ở `conversation-state.test.ts`, `interview.test.tsx`.

### UI-6.3 Thanh dưới chế độ Text
- [x] Ô nhập nhiều dòng, tự giãn; Enter xuống dòng, Ctrl/⌘+Enter gửi (có ghi chú nhỏ). Nút "Gửi".
- [x] Gõ code: nút/công tắc chuyển ô sang phông mono (hoặc tự nhận khi dán đoạn có ``` ), giữ khoảng trắng.
- [x] Nút nhanh: [Nhắc lại] [Giải thích] [Gợi ý] [Bỏ qua] → `POST …/events`, không qua classify. Khóa khi AI đang trả lời.
- [x] Khóa ô nhập trong lúc AI đang stream; giữ nguyên nội dung đang gõ nếu gửi lỗi.
- [x] Giới hạn độ dài câu trả lời (theo `api.md`), hiện bộ đếm khi gần chạm.
- **Đã xong (2026-10-12):** `src/pages/interview/` (`TextComposer.tsx`, `use-turns.ts`; `answerToSend` ở `conversation-state.ts`). `useTurns` gửi `POST …/turns` và `…/events`, đưa stream vào `useConversation().apply`; mỗi lúc chỉ một request. **Ô nhập chỉ xóa khi server báo đã lưu (`user_item`)**, nên gửi lỗi (mạng, 409, 422) thì giữ nguyên chữ và hiện lỗi ngay dưới ô (`role="alert"`). Stream đóng giữa một câu AI (không có `message_done`) cũng coi là đứt: bỏ nửa câu, tải lại transcript. Khóa thanh dưới khi đang gửi, khi AI đang stream (kể cả câu đầu từ trang 4) và khi chưa có câu hỏi nào. Khóa ô bằng `readOnly` (không `disabled`) để giữ focus, gửi xong gõ tiếp được ngay. Nút nhanh không đụng tới chữ đang gõ. Chế độ code: nút `</> Code` (`aria-pressed`) hoặc tự bật khi dán đoạn có ```; phông mono, không tự xuống dòng, tắt kiểm tra chính tả; khi gửi bọc trong ``` (trừ khi đã có sẵn), tắt lại sau khi gửi xong. **Phím Tab không chèn thụt lề** (để không bẫy bàn phím); thụt lề bằng dấu cách. Bộ đếm hiện từ 90% giới hạn (7.200/8.000), quá giới hạn thì chữ đỏ + khóa "Gửi" (không cắt bớt khi dán). Ghi chú phím ghi ⌘ trên Mac, Ctrl trên máy khác. Chưa có bong bóng tạm cho câu vừa gửi: chữ nằm trong ô (đã khóa) tới khi server lưu; mock trả `user_item` ngay. Sự kiện `progress`/`session_ended` đã đi qua `apply` nhưng chưa dùng (`UI-6.4`). Test ở `interview.test.tsx`.

### UI-6.4 Tiến độ, dừng, kết thúc
- [x] "Câu 4/~12" cập nhật theo sự kiện `progress`.
- [x] "Dừng": `InlineConfirm` "Dừng ở đây? Các câu đã trả lời vẫn được lưu." → `POST …/stop`.
- [x] Kết thúc (người dùng dừng hoặc server báo `session_ended`): thanh dưới thay bằng khối tóm tắt: số câu, thời gian, "Đã hỏi: …", "Chưa đánh giá: …" (`NotAssessed`), [Về danh sách] [Xem lại phiên →].
- **Đã xong (2026-10-12):** `src/pages/interview/` (`SessionEndBlock.tsx`; `progress`/`ended` trong `conversation-state.ts`, `use-conversation.ts`). Tiến độ lấy từ sự kiện `progress` mới nhất, chưa có thì dùng của phiên. "Dừng" mở `InlineConfirm` (tông thường, không đỏ) ở thanh dưới, **ô nhập vẫn giữ bên dưới** nên bấm "Tiếp tục" không mất chữ đang gõ; dừng lỗi thì hộp xác nhận ở lại kèm lý do. Dừng lúc AI đang stream: bỏ request đang chạy (`useTurns().cancel()`), bỏ nửa câu, tải lại transcript (có ghi chú "Bạn đã dừng phiên"); token đến sau khi kết thúc bị bỏ qua. Kết thúc (dừng, `session_ended`, hoặc transcript đã có `summary`): thanh dưới thành khối tóm tắt ("Buổi phỏng vấn đã kết thúc · N câu · M phút", "Đã hỏi", "Chưa đánh giá" bằng `NotAssessed`, chỉ hiện khi có), focus chuyển vào khối; thanh trên khóa chọn chế độ và ẩn "Dừng". "Về danh sách" → `/`. `session_ended` làm mới cache phiên + sidebar. `durationLabel()` ở `src/lib/format.ts`. Test ở `interview.test.tsx`, `conversation-state.test.ts`.

### UI-6.5 Khôi phục và lỗi mạng
- [x] Tải lại trang: `GET …/transcript` dựng lại hội thoại, banner "Đã khôi phục phiên". Nếu đang dở một câu AI, hiện câu hỏi đầy đủ đã lưu.
- [x] Mất mạng: banner "Đang kết nối lại…", tự thử lại; câu trả lời chưa gửi được giữ trong ô nhập (và localStorage theo phiên).
- [x] Stream đứt giữa chừng: lấy lại câu hỏi đã lưu từ transcript, không hiện nửa câu.
- [x] Mở trang phỏng vấn của phiên đã xong → chuyển sang trang 6. Phiên chưa bắt đầu → trang 4.
- **Xong khi:** với mock, đi được trọn một phiên ~5 câu gồm đủ 4 nút nhanh, dừng giữa chừng, tải lại trang giữa lúc AI đang stream.
- **Đã xong (2026-10-12):** `src/pages/interview/` (`use-connection.ts`, `use-await-reply.ts`, `use-answer-draft.ts`; `owesReply` ở `conversation-state.ts`), `src/lib/answer-draft.ts`. **Chuyển trang:** phiên nháp → bước phiên đang ở (`sessionPath`: trang 3 hoặc 4, không nhảy cóc qua Đối chiếu), trừ khi trang 4 vừa bắt đầu nó; phiên đã xong *trước khi mở trang* → trang 6 (kết thúc ngay trên trang 5 thì vẫn hiện khối tóm tắt). **Khôi phục:** mở lại phiên đang dở (không phải vừa bắt đầu từ trang 4) → banner "Đã khôi phục phiên" (đóng được, ẩn khi phiên kết thúc), kèm câu "câu trả lời đang gõ dở vẫn còn" nếu có bản nháp. **AI còn nợ một lượt** (transcript kết thúc bằng câu trả lời / `SKIP` / chưa có câu hỏi, và không có stream nào đang chạy): khóa ô nhập, hiện "Đang lấy lại câu hỏi của người phỏng vấn…", polling transcript mỗi 1s; sau 30s dừng và hiện banner lỗi có "Thử lại" (không bị kẹt). Cách này dùng chung cho tải lại giữa stream và stream đứt. **Mất mạng:** khi trình duyệt báo `offline` hoặc request lỗi `NetworkError` (gửi, dừng, tải transcript) → banner "Đang kết nối lại…"; vẫn gõ được nhưng khóa "Gửi" và nút nhanh; thử lại mỗi 3s (và ngay khi có sự kiện `online`) bằng `GET /sessions/:id`; có mạng lại thì tải lại phiên + transcript, banner "Đã kết nối lại" (tự ẩn sau 4s). **Không gửi trùng:** câu trả lời gửi đi mà mất mạng trước khi server báo đã lưu thì khi có mạng lại so với câu trả lời cuối trong transcript; nếu server đã lưu thì xóa khỏi ô nhập. **Bản nháp** lưu localStorage theo phiên (`intervia.draft.<id>`), xóa khi gửi xong, khi phiên kết thúc, khi xóa phiên. `SessionGate` chỉ hiện trang lỗi khi chưa có dữ liệu phiên (refetch lỗi lúc mất mạng không thay cả trang). **Mock:** lời AI được lưu ngay khi bắt đầu stream nhưng transcript chỉ trả về khi đáng lẽ stream xong (`hidden_until`), giống backend sinh trọn kể cả khi client ngắt; yêu cầu này đã ghi vào `api.md` §1, câu hỏi về lượt AI lỗi ở `api.md` §4. Test ở `interview.test.tsx`; đã đi thử trọn luồng bằng Playwright với mock (không giữ lại spec, test E2E viết ở `UI-10`).

---

## UI-7. Xem lại `/sessions/:id/review` [6]

### UI-7.1 Đầu trang
- [x] "Role · Level · ngày · N câu"; CV và JD đã dùng (tên + bản, bấm → trang 8/9 `?v=`).
- [x] Hàng tab: [Transcript] + "Báo cáo" mờ, ghi "MVP-2".
- [x] Nút "Luyện lại với CV & JD này" (→ trang 2 chọn sẵn, dùng bản mới nhất), "Xóa phiên và dữ liệu" (`InlineConfirm`, xong về `/`).
- **Đã xong (2026-10-12):** `src/pages/review/` (`index.tsx`, `ReviewHeader.tsx`). Tiêu đề trang là "Role · Level", dòng dưới "ngày tạo · N câu" (N = `progress.asked`, ngày theo `created_at` cho khớp sidebar). CV/JD là link "Tên · bản N" tới `/library/cv|jd/:id?v=N`. **Phiên chưa xong mở trang 6 thì chuyển sang bước đang ở** (`sessionPath`: phiên đang dở → trang 5, nháp → trang 3/4). "Luyện lại" dùng lại `newSessionPath()` (trang 2 tự lấy bản mới nhất). Xóa: `InlineConfirm` ngay dưới đầu trang, cùng lời với sidebar; xóa xong về `/` trước khi query phiên tải lại thành "không tìm thấy"; lỗi thì hộp xác nhận ở lại + toast lỗi. Tab "Báo cáo" là tab bị khóa, kèm chữ "(MVP-2)". Nội dung tab Transcript còn trống, làm ở `UI-7.2`/`UI-7.3`. Test ở `src/pages/review/review.test.tsx`.

### UI-7.2 Transcript
- [x] Mỗi câu: tiêu đề "CÂU 4 · XỬ LÝ LỖI · L3", câu hỏi (màu ai), câu trả lời.
- [x] Trình phát audio cho câu trả lời bằng giọng (▶, thanh tua, thời gian). Câu trả lời gõ chữ thì không có.
- [x] Chuyển [Bản STT gốc | Đã sửa] (chỉ hiện khi có bản sửa). "Sửa transcript": sửa tại chỗ, lưu bản sửa, giữ bản gốc.
- [x] Sự kiện (nhắc lại, gợi ý mức 1…) thành ghi chú amber dưới câu trả lời.
- [x] Câu bị bỏ qua: "Đã bỏ qua", không hiện như câu trả lời rỗng.
- [x] Câu ngoài kế hoạch (`unplanned`): nhãn nhỏ phân biệt.
- **Đã xong (2026-10-12):** `src/pages/review/Transcript.tsx`, logic gom theo câu ở `transcript-blocks.ts` (`toBlocks`: câu trả lời/sự kiện gắn theo `question_id`, không có thì gắn vào câu ngay trước). Mỗi câu có trạng thái `answered | skipped | unanswered`; phiên dừng giữa chừng thì câu cuối ghi "Chưa trả lời". Ghi chú: amber cho việc ứng viên xin (nhắc lại, giải thích, gợi ý mức N, thêm thời gian, ngoài nội dung), màu ink2 cho đổi chế độ và dừng phiên; `SKIP` không thành ghi chú mà thành "Đã bỏ qua". **Chỉ câu trả lời từ STT mới có "Sửa transcript"**: việc sửa là để chữa lỗi nhận dạng, câu gõ chữ giữ nguyên như đã gửi. Lưu lại đúng bản gốc thì bản sửa bị xóa (theo mock). `AudioPlayer` (`src/components/`) tự viết: không tải file trước khi bấm phát, thời lượng lấy từ `duration_ms`, phát một câu thì dừng câu khác. `AnswerText` (hiện code trong câu trả lời) tách ra dùng chung với trang 5, `splitCode` chuyển sang `src/lib/code-blocks.ts`. Badge thêm biến thể `unplanned` ("Ngoài kế hoạch"). Mỗi câu có anchor `#cau-N` để `UI-7.3` nhảy tới. Test ở `src/pages/review/transcript.test.tsx`, `transcript-blocks.test.ts`.

### UI-7.3 Cột phải (dính khi cuộn)
- [x] Độ phủ: mỗi competency một `WeightBar` + "N câu"; chưa hỏi → `NotAssessed`.
- [x] Danh sách số câu [1] [2] [3]… bấm để nhảy tới; câu đang xem được đánh dấu.
- [x] Điện thoại: cột phải chuyển lên trên, thu gọn được.
- **Đã xong (2026-10-12):** `src/pages/review/ReviewSide.tsx`, hook `use-active-question.ts`. Màn hình rộng (`lg`): cột phải 280px, dính khi cuộn (`sticky top-6`, tự cuộn riêng nếu dài hơn màn hình). Độ phủ lấy từ `GET /sessions/:id/coverage`; thanh = `question_count / planned`, nhãn "N câu"; 0 câu → "Chưa đánh giá" (không có thanh). Danh sách câu là link `#cau-N`: bấm thì cuộn mượt tới câu (tắt hiệu ứng khi người dùng chọn giảm chuyển động) và chuyển focus vào câu đó (cho người dùng bàn phím/trình đọc màn hình). **Câu đang xem** = câu cuối cùng có mép trên đã qua vạch 120px tính từ đỉnh màn hình; cuộn tới cuối trang thì là câu cuối. Câu vừa bấm được giữ đánh dấu cho tới khi người dùng tự cuộn (để câu ngắn gần cuối không bị câu sau "giành"). Dưới `lg`: cột này nằm trên transcript, mặc định thu gọn sau nút "Độ phủ và danh sách câu". Transcript vẫn đứng trước trong DOM, chỉ đổi thứ tự hiển thị. Trên điện thoại, `scroll-mt` của mỗi câu tăng lên để thanh trên cùng không che tiêu đề. Test ở `src/pages/review/review-side.test.tsx`.

---

## UI-8. Trang chào `/` [1]

- [x] "Chào bạn, hôm nay luyện phỏng vấn gì?" + "+ Phiên mới".
- [x] TIẾP TỤC: phiên đang dở gần nhất ("Role · Level · Câu 5/~12 · hôm qua" + [Tiếp tục →]). Không có thì ẩn mục.
- [x] LUYỆN LẠI NHANH: cặp CV + JD + level dùng gần nhất, [Phiên mới →] tạo phiên mới bỏ qua trang 2 (vẫn qua trang 3 để xem hồ sơ, vì CV có thể đã có bản mới).
- [x] Lần đầu dùng: ba bước (thêm CV và JD, kiểm tra hồ sơ, phỏng vấn) + "Bắt đầu phiên đầu tiên".

---

## UI-9. Voice (Nói → Chữ, Nói → Nói)

**Cần:** backend xong spike voice (BE-7): chọn provider STT/TTS, chốt danh sách sự kiện qua data channel, quyết định barge-in.

### UI-9.1 Kết nối
- [ ] `features/voice`: Pipecat client + transport `small-webrtc`, một client cho mỗi phiên, tạo khi vào chế độ voice, đóng khi rời trang / đổi sang Text.
- [ ] Ánh xạ sự kiện Pipecat → trạng thái `VoiceStatusPill`: đang kết nối; VAD bắt đầu nói → "Đang nghe bạn" (không chờ STT); im lặng quá ngưỡng → "Cứ từ từ suy nghĩ"; hết lượt → "Đang xử lý"; bot bắt đầu nói → "AI đang nói".
- [ ] Kết nối thất bại sau vài giây: hiện nút "Chuyển sang gõ chữ".

### UI-9.2 Kiểm tra mic ở trang 4
- [ ] Nối ô kiểm tra mic (`UI-5.4`) với thiết bị thật: chọn mic (nếu có nhiều), sóng âm theo mức âm, "✓ Nghe rõ" khi đủ to.
- [ ] Bị từ chối quyền: hướng dẫn bật lại theo trình duyệt, chế độ chuyển sang Text.

### UI-9.3 Nói → Chữ
- [ ] Chữ STT tạm hiện dần trong bong bóng "BẠN", in nghiêng màu ink2; khi chốt thì thành chữ thường.
- [ ] Nhiều đoạn nói bổ sung sau khi ngừng gộp vào cùng một bong bóng.
- [ ] Ô gõ nhỏ để chèn code/công thức xen kẽ lời nói.
- [ ] Nút "Tôi đã trả lời xong" (kết thúc lượt thủ công).
- [ ] Lời AI: text stream như chế độ Text.

### UI-9.4 Nói → Nói
- [ ] Như Nói → Chữ, thêm phát TTS; chữ của AI hiện dần đồng bộ với giọng đọc (theo sự kiện từng câu).
- [ ] Nút "Dừng đọc" khi AI đang nói (nếu không cho barge-in bằng giọng).
- [ ] Không phát lại TTS cũ khi khôi phục phiên.

### UI-9.5 Đổi chế độ giữa phiên
- [ ] Đổi Text ↔ Nói→Chữ ↔ Nói→Nói không mất hội thoại; gửi `PATCH …/mode` để server ghi sự kiện.
- [ ] Đổi khi AI đang nói/đang nghe: chờ hết lượt hiện tại hoặc hỏi xác nhận (chốt khi làm).

### UI-9.6 Lỗi voice
- [ ] Mic hỏng / bị rút giữa phiên: trạng thái "Không dùng được mic", tự chuyển sang Text, banner giải thích.
- [ ] Mất kết nối WebRTC: banner "Đang kết nối lại", tự nối lại; không được thì chuyển sang Text và giữ hội thoại.
- **Xong khi:** đi trọn một phiên bằng giọng tiếng Việt có chen thuật ngữ tiếng Anh với backend thật, gồm ngắt mạng và tắt mic giữa chừng.

---

## UI-10. Hoàn thiện

- [ ] **Điện thoại:** mọi trang ở 375px không cuộn ngang; trang hai cột thành một cột.
- [ ] **Bàn phím và trình đọc màn hình:** đi hết luồng chính bằng bàn phím; focus thấy rõ; nhãn cho nút chỉ có biểu tượng (⋮, ✎, ✕, ☰); trạng thái không chỉ dựa vào màu.
- [ ] **Độ tương phản:** kiểm tra lại các cặp màu thực tế bằng axe / Lighthouse (mục tiêu AA).
- [x] **E2E Playwright** (chạy với mock): tạo phiên 4 tổ hợp; sửa hồ sơ tạo bản mới; phỏng vấn Text trọn phiên; tải lại giữa phiên; xem lại + sửa transcript; xóa CV kèm phiên.
- **Đã xong (2026-10-12):** `web/e2e/` (`session-new.spec.ts`, `library.spec.ts`, `interview.spec.ts`, `review.spec.ts`, `helpers.ts`). Mỗi test có context trình duyệt riêng nên DB giả bắt đầu từ seed, không phụ thuộc nhau. Chạy cả `desktop` và `mobile`; `mobile` dùng khung iPhone 13 **trên Chromium** (chỉ cần `npx playwright install chromium`). Phỏng vấn trọn phiên: đi từ trang 4 (s-plan), dùng đủ 4 nút nhanh, gửi bằng nút và Ctrl+Enter tới khi mock kết thúc (5 câu), sang trang 6, mở lại trang 5 thì về trang 6. Tải lại: ngay lúc AI đang stream câu sau; kiểm tra banner khôi phục, câu hỏi về đủ, bản nháp gõ dở còn sau khi tải lại. **Sửa lỗi tìm được:** ô nhập (và bản nháp localStorage) chỉ xóa khi cả lượt stream xong, nên tải lại giữa stream thì câu trả lời đã lưu hiện lại như bản nháp, dễ gửi trùng. Giờ xóa ngay khi nhận `user_item` (`onSend(text, onSaved)` ở `TextComposer`, `sendAnswer(text, onSaved)` ở `use-turns.ts`), thêm test ở `interview.test.tsx`.
- [ ] **PII:** không `console.log` nội dung CV/câu trả lời; không đưa nội dung đó vào URL.
- [ ] Cập nhật mục "Lệnh" trong CLAUDE.md (cách chạy `web/`).

## UI-11. Đăng nhập (chỉ làm khi bật đăng nhập thật)

Web làm trước theo `api.md` (mục "Đăng nhập"); backend chưa bật thì `GET /api/auth/me` trả `auth_enabled: false` và web chạy như MVP-1 (không có trang đăng nhập, không có mục Tài khoản).

### UI-11.1 Đăng nhập, đăng ký, bảo vệ route
- [x] Trang 11 `/login`, `/signup` (`BlankLayout`): báo lỗi chung "Email hoặc mật khẩu không đúng"; mật khẩu tối thiểu 10 ký tự, nhập lại mật khẩu.
- [x] Bảo vệ route: chưa đăng nhập → `/login`, đăng nhập xong quay về trang định vào.
- **Đã xong (2026-10-12):** hợp đồng ở `api.md` (cookie phiên `HttpOnly` do backend đặt, web không giữ token; `GET /auth/me`, `POST /auth/signup|login|logout`; mã lỗi `unauthenticated`, `invalid_credentials`, `email_taken`, `too_many_attempts`). `src/features/auth/` (`AuthRoot`, `RequireAuth`, `next-path.ts`), `src/pages/login/` (`LoginPage`, `SignupPage` dùng chung một form), hook `useMe`/`useLogin`/`useSignup` ở `src/api/hooks.ts`. **Mọi request trả 401 `unauthenticated`** (kể cả stream SSE) đánh dấu đã đăng xuất → chuyển về `/login?next=<trang đang mở>` (`setUnauthenticatedHandler` ở `client.ts`). `next` chỉ nhận đường dẫn trong app (chặn chuyển hướng ra trang ngoài). Đăng nhập/đăng ký thành công thì xóa cache của lần trước. Đăng nhập chỉ kiểm tra có nhập đủ (luật mật khẩu là của server, lỗi giữ chung chung); đăng ký kiểm tra ≥ 10 ký tự và nhập lại khớp; lỗi hiện dưới ô, focus vào ô sai đầu tiên. Đã đăng nhập (hoặc chưa bật đăng nhập) mà mở `/login` thì đi thẳng tới `next`. **Mock:** cờ `auth` (mặc định tắt), tài khoản mẫu `nguyenvana@example.com` / `matkhau-mau-123`, sai 5 lần liền thì `too_many_attempts`; mọi tài khoản dùng chung dữ liệu mẫu (`src/mocks/auth.ts`). `renderRoute()` trong test nạp sẵn người dùng mặc định; `{ auth: 'fetch' }` để hỏi mock. Test ở `src/pages/login/login.test.tsx`, `src/features/auth/next-path.test.ts`, `e2e/login.spec.ts`.

- [x] Nút hình con mắt để hiện/ẩn mật khẩu (`src/components/PasswordInput.tsx`), dùng cho mọi ô mật khẩu (đăng nhập, đăng ký, đổi mật khẩu); mỗi ô bật/tắt riêng. (2026-10-12)

### UI-11.2 Tài khoản và đăng xuất
- [x] Trang 10 `/account`: email, đổi mật khẩu, khung "Dữ liệu của bạn" (số CV, JD, phiên, file ghi âm + dung lượng), "Xóa tài khoản và toàn bộ dữ liệu" (gõ lại email để xác nhận).
- [x] Hiện mục "Tài khoản" ở sidebar (chỉ khi `auth_enabled`).
- [x] "Đăng xuất": `POST /auth/logout`, xóa cache và bản nháp câu trả lời trong localStorage (PII), về `/login`.
- **Đã xong (2026-10-12):** `api.md` thêm mục "Tài khoản": `GET /account/data` (`AccountData`), `POST /account/password` (sai mật khẩu hiện tại → 422 `fields.current_password`; đăng xuất các nơi khác), `DELETE /account` body `{email}`. `src/pages/account/` (`AccountPage`); hook `useAccountData`, `useChangePassword`, `useLogout`, `useDeleteAccount` ở `src/api/hooks.ts`. Đăng xuất và xóa tài khoản dùng chung một bước dọn: xóa mọi bản nháp (`dropAllDrafts()` ở `src/lib/answer-draft.ts`), xóa cache, đánh dấu chưa đăng nhập, về `/login` (không kèm `next`). Hết hạn đăng nhập (401) thì **không** xóa bản nháp, để đăng nhập lại còn gõ tiếp. Nút "Đăng xuất" ở đầu trang Tài khoản. Đổi mật khẩu là form mở ngay trong trang (mật khẩu hiện tại, mới ≥ 10 ký tự và khác mật khẩu cũ, nhập lại). Xóa tài khoản dùng `InlineConfirm` (thêm `children` và `confirmDisabled`): nút "Xóa vĩnh viễn" chỉ bật khi email gõ lại khớp (không phân biệt hoa thường). Chưa bật đăng nhập thì `/account` hiện trang "Không tìm thấy" và sidebar không có mục này (bỏ cờ `SIDEBAR_FEATURES.auth`, đọc `auth_enabled` từ `useMe`). **Mock:** dung lượng ghi âm ước theo thời lượng câu trả lời (~4 KB/s); xóa tài khoản xóa toàn bộ dữ liệu mẫu (dữ liệu dùng chung mọi tài khoản). Test ở `src/pages/account/account.test.tsx`, `e2e/login.spec.ts`.
