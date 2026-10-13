# Các trang giao diện

- Cập nhật: 2026-10-12
- Trạng thái: đề xuất, chưa chốt. Màu, font, trạng thái voice: xem `ui.md`. Quy tắc dữ liệu (user_id, thư viện, phiên bản): xem `CLAUDE.md` mục "Người dùng và dữ liệu".
- Phạm vi: các trang cho MVP-1, cộng các trang dự kiến cho MVP-2 trở đi (chỉ để chừa chỗ trong điều hướng, chưa làm).

---

## 1. Danh sách trang

| # | Trang | Đường dẫn | Giai đoạn | Khung |
|---|---|---|---|---|
| – | Sidebar | (mọi trang trừ Phỏng vấn, Đăng nhập) | MVP-1 | – |
| 1 | Trang chào | `/` | MVP-1 | Sidebar |
| 2 | Tạo phiên | `/sessions/new` | MVP-1 | Sidebar + thanh bước (1/3) |
| 3 | Đối chiếu CV–JD | `/sessions/:id/match` | MVP-1 | Sidebar + thanh bước (2/3) |
| 4 | Kế hoạch & chuẩn bị | `/sessions/:id/plan` | MVP-1 | Sidebar + thanh bước (3/3) |
| 5 | Phỏng vấn | `/sessions/:id/interview` | MVP-1 | Toàn màn hình, ẩn sidebar |
| 6 | Xem lại | `/sessions/:id/review` | MVP-1 (MVP-2 thêm tab Báo cáo) | Sidebar |
| 7 | Thư viện | `/library` (tab CV, tab JD) | MVP-1 | Sidebar |
| 8 | Chi tiết CV | `/library/cv/:id` | MVP-1 | Sidebar |
| 9 | Chi tiết JD | `/library/jd/:id` | MVP-1 | Sidebar |
| 10 | Tài khoản | `/account` | Khi bật đăng nhập | Sidebar |
| 11 | Đăng nhập / Đăng ký | `/login`, `/signup` | Khi bật đăng nhập | Trang trống, không sidebar |
| – | Không tìm thấy / lỗi kết nối | `*` | MVP-1 | Sidebar |
| – | Tiến bộ | `/progress` | MVP-2+ | Sidebar |
| – | Lộ trình học | `/roadmap` | MVP-3+ | Sidebar |

**Luồng chính:**

```
              ┌──────────── Thư viện CV & JD [7][8][9] ◄──── sửa hồ sơ / yêu cầu
              │ chọn CV, JD có sẵn                                     ▲
              ▼                                                        │
Sidebar ─► [2] Tạo phiên ─► [3] Đối chiếu ─► [4] Kế hoạch ─► [5] Phỏng vấn ─► [6] Xem lại
  ▲                                                                              │
  └──────────────────────── phiên mới xuất hiện trong sidebar ◄──────────────────┘
```

Mỗi bước có đường dẫn riêng và dữ liệu nằm trong DB, nên tải lại trang hay đóng trình duyệt vẫn quay về đúng chỗ.

## 2. Quy tắc chung

**Khung trang với sidebar:**

```
┌──────────────────┬───────────────────────────────────────────┐
│ Intervia         │                                           │
│ [+ Phiên mới]    │                                           │
│                  │                                           │
│ HÔM NAY          │        nội dung, rộng tối đa 1040px       │
│ ● Backend · Mid  │                                           │
│ ◐ AI Eng · Senior│                                           │
│ TUẦN TRƯỚC       │                                           │
│ ● Backend · Jr   │                                           │
│ (Tiến bộ)        │                                           │
│ (Lộ trình)       │                                           │
│──────────────────│                                           │
│ Thư viện CV & JD │                                           │
│ Tài khoản        │                                           │
└──────────────────┴───────────────────────────────────────────┘
  rộng 260px, nền surface; nội dung nền bg
```

**Sidebar:**
- Nút "+ Phiên mới" luôn ở trên cùng.
- Danh sách phiên nhóm theo thời gian (Hôm nay, 7 ngày qua, Cũ hơn). Mỗi dòng: chấm trạng thái + "Role · Level". Chấm: Chưa bắt đầu (`subtle`), Đang dở (`amber`), Đã xong (`ok`).
- Bấm vào phiên → trang phù hợp với trạng thái: chưa bắt đầu → bước đang dừng (2/3/4); đang dở → 5; đã xong → 6.
- Di chuột vào một phiên hiện nút ⋮: Xóa phiên và dữ liệu (hộp xác nhận trong trang). Phiên không đặt tên được, chỉ hiện "Role · Level · ngày".
- Phiên đang mở được tô nền `accent-soft`.
- Cuối sidebar: Thư viện CV & JD, Tài khoản (khi có đăng nhập). "Tiến bộ" và "Lộ trình" chưa hiện ở MVP-1, đã chừa chỗ.
- Thu gọn được thành dải biểu tượng hẹp. Điện thoại: thành menu trượt từ cạnh trái, mở bằng nút ☰.
- **Trang Phỏng vấn ẩn sidebar** để tập trung; muốn rời phiên thì bấm "Dừng".

**Độ rộng nội dung:** trang form (2, 3, 4, 8, 9) tối đa 1040px; cột hội thoại ở trang 5 tối đa 760px để dòng chữ không quá dài; trang 6 gồm cột chính co giãn + cột phải 280px.

**Mỗi trang phải có đủ 4 trạng thái:** đang tải (khung xám mờ thay cho nội dung), trống, lỗi (nói rõ lỗi gì và cách xử lý), có dữ liệu.

**Điện thoại:** trang hai cột xếp thành một cột. Thanh bước rút gọn thành "Bước 2/3 · Đối chiếu".

**Khóa dữ liệu sau khi bắt đầu phỏng vấn:** phiên ghi lại phiên bản CV/JD và blueprint đã dùng; từ lúc bắt đầu, các thứ này không đổi nữa. Sửa CV trong thư viện sau đó chỉ tạo phiên bản mới, không ảnh hưởng phiên cũ. Lý do: CLAUDE.md yêu cầu lưu đủ dữ liệu để chạy lại Evaluator.

---

## 3. Chi tiết từng trang

### Trang 1. Trang chào `/`

**Mục đích:** điểm vào khi mở app. Danh sách phiên đầy đủ đã nằm ở sidebar, nên trang này gọn.

```
┌──────────────────────────────────────────────────────────────┐
│ Chào bạn, hôm nay luyện phỏng vấn gì?                        │
│                                                              │
│ [+ Phiên mới]                                                │
│                                                              │
│ TIẾP TỤC                                                     │
│ ◐ AI Engineer · Senior · Câu 5/~12 · hôm qua    [Tiếp tục →] │
│                                                              │
│ LUYỆN LẠI NHANH                (dùng CV + JD có sẵn)         │
│ CV Backend 2026 + JD Công ty ABC · Mid          [Phiên mới →]│
└──────────────────────────────────────────────────────────────┘
```

- **Tiếp tục:** phiên đang dở gần nhất (nếu có).
- **Luyện lại nhanh:** cặp CV + JD + level dùng gần nhất, bấm là tạo phiên mới bỏ qua bước nhập (phục vụ phỏng vấn lại).
- **Trống (lần đầu dùng):** giới thiệu ba bước (thêm CV và JD, kiểm tra hồ sơ, phỏng vấn) và nút "Bắt đầu phiên đầu tiên".

### Trang 2. Tạo phiên `/sessions/new`

**Mục đích:** chọn đầu vào cho phiên: CV, JD (có sẵn hoặc mới), vị trí, cấp độ.

```
┌──────────────────────────────────────────────────────────────┐
│ ① Chọn CV & JD ──── ② Đối chiếu ──── ③ Kế hoạch             │
├──────────────────────────────┬───────────────────────────────┤
│ CV                           │ Mô tả công việc (JD)          │
│ (•) Dùng CV có sẵn           │ (•) Dùng JD có sẵn            │
│   [CV Backend 2026 ▾]        │   [Công ty ABC · Backend ▾]   │
│   Đã phân tích · sửa 08/10   │   Đã phân tích · 5 yêu cầu    │
│ ( ) Tải CV mới               │ ( ) Thêm JD mới               │
│                              │   [Dán nội dung | Tải file]   │
│   ┌────────────────────────┐ │   ┌─────────────────────────┐ │
│   │ Kéo thả PDF/DOCX       │ │   │ Dán JD vào đây…         │ │
│   │ hoặc [Chọn file] · 5 MB│ │   │                         │ │
│   └────────────────────────┘ │   └─────────────────────────┘ │
│   Tên CV [CV Backend 2026 ]  │   Tên JD [ABC · Backend    ]  │
├──────────────────────────────┴───────────────────────────────┤
│ Vị trí  [Backend Engineer ▾]                                 │
│ Cấp độ  ( ) Junior  (•) Mid  ( ) Senior                      │
│                                               [Tiếp tục →]   │
└──────────────────────────────────────────────────────────────┘
```

- **Lần đầu (thư viện trống):** chỉ hiện ô tải CV mới và ô thêm JD mới, không có lựa chọn "có sẵn".
- **JD mới:** dán nội dung hoặc tải file PDF/DOCX (≤ 5 MB). Đổi qua lại giữa hai cách không mất phần đã nhập. Server trích chữ từ file ngay khi tải lên; file scan không có chữ thì báo lỗi ngay dưới ô file. Chữ trích được xem lại ở trang Chi tiết JD.
- **Tùy chọn phân tích** (dưới ô CV mới và ô JD mới, thu gọn mặc định, chỉ hiện khi tải/thêm mới): chọn chế độ trích xuất (`extraction.md` mục 8). Mặc định **Tiêu chuẩn**; mỗi lựa chọn có một dòng mô tả ngắn và nhãn chi phí, thời gian tương đối:
  - **Tiêu chuẩn** · "Nhanh, tiết kiệm. Phù hợp hầu hết CV." · `~30 giây`
  - **Đọc bố cục** · "Cho CV scan, CV 2 cột hoặc nhiều bảng." · `~1 phút · tốn hơn` (không có ở JD)
  - **Chính xác cao** · "Đọc kỹ nhất, chậm và tốn nhất. Dùng khi kết quả chưa tốt." · `~2 phút · tốn gấp 4`
- **CV/JD mới** được lưu vào thư viện với tên người dùng đặt (gợi ý sẵn tên từ tên file hoặc dòng đầu của JD dán).
- **Vị trí:** chọn từ danh sách cố định (vì rubric MVP-2 theo role) + "Khác".
- **Kiểm tra trước khi gửi:** đúng định dạng file, kích thước, JD không rỗng và không quá dài. Báo lỗi ngay dưới ô sai.
- **Ghi chú quyền riêng tư** nhỏ dưới ô CV: "CV được lưu trong thư viện của bạn, bạn xóa được bất cứ lúc nào."
- Bấm "Tiếp tục" → tạo phiên, sang trang 3. CV/JD mới thì trang 3 hiện tiến trình phân tích; CV/JD có sẵn thì hiện kết quả ngay.

### Trang 3. Đối chiếu CV–JD `/sessions/:id/match`

**Mục đích:** người dùng kiểm tra nhanh những gì AI đọc được từ CV và JD (A1 CV Profiler, A2 JD Analyzer) trước khi tạo kế hoạch. Việc sửa chi tiết diễn ra ở thư viện (trang 8, 9), vì hồ sơ thuộc về CV chứ không thuộc về phiên; trang này cho sửa nhanh và ghi thành phiên bản mới của CV/JD.

**Khi đang phân tích** (khoảng 10–30 giây):

```
┌──────────────────────────────────────────────────────────────┐
│ ✓ Đã tải CV                                                  │
│ ◌ Đang đọc CV…           ← bước đang chạy có ba chấm         │
│ ○ Phân tích JD                                               │
│ ░░░░░░░░░░░░░░  (khung xám mờ ở vị trí nội dung sắp hiện)    │
└──────────────────────────────────────────────────────────────┘
```

**Khi đã xong:**

```
┌──────────────────────────────────────────────────────────────┐
│ ① Chọn CV & JD ──── ② Đối chiếu ──── ③ Kế hoạch             │
├──────────────────────────────┬───────────────────────────────┤
│ CV BACKEND 2026 · bản 3      │ ABC · BACKEND · bản 1         │
│ [Sửa trong thư viện ↗]       │ [Sửa trong thư viện ↗]        │
│ HỒ SƠ CỦA BẠN · từ CV        │ YÊU CẦU CỦA JD                │
│ Kỹ năng                      │ Thiết kế API        [Bắt buộc]│
│ [Python ✕][FastAPI ✕][+ Thêm]│ PostgreSQL          [Bắt buộc]│
│                              │ Hàng đợi            [Bắt buộc]│
│ Kinh nghiệm                  │ Docker, CI/CD       [Nên có]  │
│ • Backend @ ABC · 2022–nay ✎ │                               │
│                              │                               │
│ Điều CV khẳng định           │                               │
│ ┌──────────────────────────┐ │                               │
│ │ Giảm 40% độ trễ API      │ │                               │
│ │ "…giảm 40% độ trễ p95…"  │ │                               │
│ │              [Sửa] [Xóa] │ │                               │
│ └──────────────────────────┘ │                               │
│ ┌──────────────────────────┐ │                               │
│ │ ⚠ Không tìm thấy câu gốc │ │                               │
│ │   trong CV · [Kiểm tra]  │ │                               │
│ └──────────────────────────┘ │                               │
├──────────────────────────────┴───────────────────────────────┤
│ [← Quay lại]                        [Lưu và tạo kế hoạch →]  │
└──────────────────────────────────────────────────────────────┘
```

- **Hai cột cạnh nhau** để so CV với JD.
- **Mỗi claim kèm câu gốc** (`source_quote`). Claim mà code không tìm thấy câu gốc trong CV hiện cảnh báo màu hổ phách: có thể AI đọc sai hoặc tự bịa.
- **Không có khối "Đối chiếu" do code tính** (bỏ ngày 2026-10-13 cùng competency catalog, xem `extraction.md` mục 5). Trang này để người dùng kiểm tra và sửa kết quả trích xuất; việc so CV với JD do A3 làm khi lập kế hoạch.
- **Sửa nhanh tại chỗ:** bấm ✎ để sửa, ✕ để xóa, "+ Thêm" để thêm. Mỗi lần lưu tạo phiên bản mới của CV/JD trong thư viện ("bản 3" → "bản 4"), phiên này chuyển sang dùng bản mới. Có dòng "Đã lưu" màu xanh lá.
- **Nếu sửa hồ sơ sau khi đã có kế hoạch:** trang 4 hiện "Hồ sơ đã thay đổi, tạo lại kế hoạch?".
- **CV/JD có sẵn đã phân tích:** hiện kết quả ngay, không gọi lại LLM.
- **Lỗi** (file scan không có chữ, LLM lỗi): nói rõ lý do, cho thử lại hoặc tải file khác.

### Trang 4. Kế hoạch & chuẩn bị `/sessions/:id/plan`

**Mục đích:** cho người dùng biết buổi phỏng vấn sẽ hỏi về những gì (A3 Blueprint Builder), chọn chế độ và kiểm tra mic.

```
┌──────────────────────────────────────────────────────────────┐
│ ① Chọn CV & JD ──── ② Đối chiếu ──── ③ Kế hoạch             │
├──────────────────────────────────────────────────────────────┤
│ KẾ HOẠCH PHỎNG VẤN · khoảng 12 câu                           │
│ Chủ đề          Trọng số      Độ sâu    Số câu               │
│ Thiết kế API    ██████░░ 30%  L3–L4     3–4                  │
│ Database        █████░░░ 25%  L3–L4     3                    │
│ Xử lý lỗi       ████░░░░ 20%  L2–L3     2–3                  │
│ Giao tiếp       ███░░░░░ 15%  L2–L3     2                    │
│ ⓘ Độ sâu L1–L7 là gì?                                         │
├───────────────────────────────┬──────────────────────────────┤
│ CHẾ ĐỘ BẮT ĐẦU                │ KIỂM TRA MIC                 │
│ ( ) Text                      │ [Bắt đầu kiểm tra]           │
│ ( ) Nói → Chữ                 │ ▁▃▅▃▁  ✓ Nghe rõ             │
│ (•) Nói → Nói                 │ Hãy nói thử một câu.         │
│ Đổi được trong lúc phỏng vấn. │                              │
├───────────────────────────────┴──────────────────────────────┤
│ [← Đối chiếu]                         [Bắt đầu phỏng vấn →]  │
└──────────────────────────────────────────────────────────────┘
```

- **Không hiện seed question và danh sách claim cần kiểm chứng**: blueprint có chứa chúng, nếu hiện ra thì ứng viên biết trước câu hỏi.
- **Blueprint chỉ xem**, không cho sửa ở MVP-1.
- **Kiểm tra mic** chỉ hiện khi chọn chế độ có nói. Mic lỗi thì nút "Bắt đầu" vẫn bấm được nhưng chế độ tự chuyển sang Text, kèm lý do.
- **"Độ sâu L1–L7 là gì?"** mở một đoạn giải thích ngắn, vì người dùng không biết các mức này.

### Trang 5. Phỏng vấn `/sessions/:id/interview`

**Mục đích:** hỏi đáp. Đây là trang quan trọng và phức tạp nhất.

```
┌──────────────────────────────────────────────────────────────┐
│ Intervia · Backend · Mid · Câu 4/~12  [Text|Nói→Chữ|Nói→Nói] [Dừng] │
├──────────────────────────────────────────────────────────────┤
│  (banner khi cần: mất mạng / mic lỗi)                         │
│                                                              │
│  NGƯỜI PHỎNG VẤN                         ← câu cũ: chữ nhỏ, màu phụ │
│  Bạn kể về hệ thống hàng đợi đã làm nhé.                      │
│                                BẠN                           │
│                 Bên mình dùng RabbitMQ… (bong bóng)          │
│                                                              │
│  NGƯỜI PHỎNG VẤN                         ← câu hiện tại: 18px │
│  Khi gọi API thanh toán bị timeout, bạn xử lý retry thế nào │
│  để không trừ tiền khách hai lần?▌                           │
│                                BẠN                           │
│        Mình sẽ gửi kèm idempotency key, ừm… (chữ STT nghiêng)│
├──────────────────────────────────────────────────────────────┤
│ ● Đang nghe bạn…   [Nhắc lại] [Giải thích] [Gợi ý] [Bỏ qua]  │
│ ┌────────────────────────────────────────┐ ┌───────────────┐ │
│ │ Gõ thêm code hoặc công thức…           │ │ Tôi đã trả    │ │
│ └────────────────────────────────────────┘ │ lời xong      │ │
│                                            └───────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Phần dưới thay đổi theo chế độ:**

| Chế độ | Thanh dưới |
|---|---|
| Text | Ô nhập lớn (nhiều dòng, phông mono khi gõ code), nút "Gửi". Không có viên trạng thái mic |
| Nói → Chữ | Viên trạng thái, ô gõ nhỏ, nút "Tôi đã trả lời xong" |
| Nói → Nói | Như Nói → Chữ, thêm nút "Dừng đọc" khi AI đang nói (nếu không cho ngắt lời bằng giọng) |

- **Viên trạng thái:** 6 trạng thái theo `ui.md` mục 4.
- **Nút nhanh** (Nhắc lại, Giải thích, Gợi ý, Bỏ qua) ánh xạ thẳng vào intent, không cần classify: nhanh và chắc hơn nói. Nút "Gợi ý" gửi sự kiện `HINT` (không qua classify), backend ghi `hint_level`.
- **Tiến độ** chỉ có "Câu 4/~12". Không có điểm, không có dấu đúng/sai, không hiện tên competency đang hỏi.
- **Dừng phiên:** hỏi xác nhận ngay trong trang ("Dừng ở đây? Các câu đã trả lời vẫn được lưu").
- **Tải lại trang / mất mạng:** lấy lại hội thoại từ API, hiện banner "Đã khôi phục phiên".
- **Kết thúc:** thanh dưới được thay bằng khối tóm tắt:

```
┌──────────────────────────────────────────────────────────────┐
│ Buổi phỏng vấn đã kết thúc · 12 câu · 24 phút                 │
│ Đã hỏi: Thiết kế API · Database · Xử lý lỗi                   │
│ Chưa đánh giá: Giao tiếp                                      │
│                       [Về danh sách]  [Xem lại phiên →]       │
└──────────────────────────────────────────────────────────────┘
```

### Trang 6. Xem lại `/sessions/:id/review`

**Mục đích:** đọc lại, nghe lại, sửa transcript, xóa dữ liệu. Từ MVP-2 thêm tab "Báo cáo".

```
┌──────────────────────────────────────────────────────────────┬────────────────┐
│ Backend · Mid · 10/10/2026 · 12 câu      [Xóa phiên và dữ liệu] │ ĐỘ PHỦ         │
│ [Transcript] (Báo cáo: MVP-2)                                 │ Thiết kế API   │
├──────────────────────────────────────────────────────────────┤ ████ 3 câu     │
│ CÂU 4 · XỬ LÝ LỖI · L3                                        │ Database       │
│ Khi gọi API thanh toán bị timeout…            (màu giọng AI)  │ ████ 3 câu     │
│ Mình sẽ gửi kèm idempotency key…                              │ Xử lý lỗi      │
│ ▶ ━━━━━○──── 0:52 / 1:24                                      │ ███░ 2 câu     │
│ [Bản STT gốc | Đã sửa]                    [Sửa transcript]    │ Giao tiếp      │
│ Nhắc lại câu hỏi · Xin gợi ý mức 1         (ghi chú hổ phách) │ Chưa đánh giá  │
│ ──────────────────────────────────────────────────────────── │                │
│ CÂU 5 · DATABASE · L4                                         │ [Câu 1] [2] [3]│
│ …                                                             │ ← nhảy tới câu │
└──────────────────────────────────────────────────────────────┴────────────────┘
```

- **Cột phải dính khi cuộn:** độ phủ competency và danh sách số câu để nhảy nhanh.
- **"Chưa đánh giá"** màu chữ phụ, in nghiêng, không phải đỏ.
- **Sửa transcript sau khi gửi:** lưu bản sửa, giữ nguyên bản STT gốc; chuyển qua lại giữa hai bản.
- **Các sự kiện không phải ANSWER** (nhắc lại, gợi ý, bỏ qua) hiện thành ghi chú nhỏ dưới câu trả lời.
- **Câu bị bỏ qua** hiện "Đã bỏ qua", không hiện như câu trả lời rỗng.
- **Xóa:** hộp xác nhận trong trang, xóa xong quay về trang 1.
- **Đầu trang ghi CV và JD đã dùng** (tên + phiên bản), bấm vào mở trang 8/9 ở đúng phiên bản đó.
- **Nút "Luyện lại với CV & JD này"**: tạo phiên mới với cùng đầu vào (dùng phiên bản mới nhất).

### Trang 7. Thư viện `/library`

**Mục đích:** quản lý các CV và JD đã thêm, dùng lại cho nhiều phiên.

```
┌──────────────────────────────────────────────────────────────┐
│ Thư viện                                                     │
│ [ CV (2) | JD (3) ]                          [+ Tải CV mới]  │
├──────────────────────────────────────────────────────────────┤
│ CV Backend 2026     nguyen-van-a.pdf · bản 3 · sửa 08/10     │
│                     Dùng trong 4 phiên             [⋮]       │
│ CV AI Engineer      cv-ai.docx · bản 1 · thêm 05/10          │
│                     Dùng trong 1 phiên             [⋮]       │
└──────────────────────────────────────────────────────────────┘
 ⋮ = Đổi tên · Tạo phiên mới với CV này · Xóa
```

- Hai tab CV và JD, cùng bố cục danh sách. Bấm vào một dòng mở trang chi tiết.
- Tab JD: tên, công ty/vị trí (nếu trích được), số yêu cầu, số phiên đã dùng.
- **Trống:** "Chưa có CV nào. Thêm CV để dùng lại cho nhiều phiên luyện tập." + nút tải lên.
- **Tải CV / thêm JD từ thư viện:** có "Tùy chọn phân tích" như trang 2.
- **Xóa CV/JD:** hộp xác nhận liệt kê các phiên đang dùng nó: "CV này được dùng trong 4 phiên. Xóa CV sẽ xóa luôn 4 phiên đó, gồm transcript và file ghi âm." Hai lựa chọn: "Xóa CV và 4 phiên" hoặc "Giữ lại". Không có lựa chọn xóa CV mà giữ phiên, vì hồ sơ trích từ CV trong các phiên cũ vẫn là PII.

### Trang 8. Chi tiết CV `/library/cv/:id`

**Mục đích:** xem và sửa hồ sơ trích từ một CV, xem lịch sử phiên bản và các phiên đã dùng.

```
┌──────────────────────────────────────────────────────────────┐
│ ← Thư viện                                                   │
│ CV Backend 2026 ✎                     [Tạo phiên với CV này] │
│ nguyen-van-a.pdf · [Xem file gốc] · bản 3 [▾ lịch sử]        │
├──────────────────────────────┬───────────────────────────────┤
│ HỒ SƠ                        │ ĐÃ DÙNG TRONG                 │
│ Kỹ năng                      │ ● Backend · Mid · 10/10 · b3  │
│ [Python ✕][FastAPI ✕][+ Thêm]│ ● Backend · Mid · 07/10 · b2  │
│ Kinh nghiệm                  │ ● Backend · Jr  · 05/10 · b1  │
│ • Backend @ ABC · 2022–nay ✎ │                               │
│ Điều CV khẳng định           │                               │
│ ┌ Giảm 40% độ trễ API ─────┐ │                               │
│ │ "…giảm 40% độ trễ p95…"  │ │                               │
│ └──────────── [Sửa] [Xóa] ─┘ │                               │
├──────────────────────────────┴───────────────────────────────┤
│                                  [Xóa CV và dữ liệu liên quan]│
└──────────────────────────────────────────────────────────────┘
```

- Hồ sơ dùng cùng thành phần với trang 3 (tag kỹ năng, thẻ claim kèm câu gốc, cảnh báo khi không tìm thấy câu gốc).
- **Mỗi lần lưu tạo phiên bản mới.** Menu "lịch sử" cho xem phiên bản cũ (chỉ xem). Các phiên cũ vẫn trỏ tới phiên bản chúng đã dùng.
- **"Phân tích lại"** (trong ⋮): mở hộp thoại nhỏ chọn chế độ trích xuất (như "Tùy chọn phân tích" ở trang 2, chọn sẵn chế độ của lần trước, kèm dòng gợi ý "Kết quả thiếu hoặc sai? Thử Đọc bố cục hoặc Chính xác cao"), rồi chạy lại A1 trên file gốc, tạo phiên bản mới. Lịch sử phiên bản ghi chế độ đã dùng của từng bản.
- **"Đã dùng trong"**: danh sách phiên kèm phiên bản CV, bấm để mở trang 6.

### Trang 9. Chi tiết JD `/library/jd/:id`

Bố cục giống trang 8: cột trái là văn bản JD gốc (thu gọn được) và danh sách yêu cầu đã trích (sửa được, đổi Bắt buộc/Nên có); cột phải là các phiên đã dùng JD này. Cũng lưu theo phiên bản. "Phân tích lại" như trang 8, nhưng chỉ có Tiêu chuẩn và Chính xác cao.

### Trang 10. Tài khoản `/account` (khi bật đăng nhập)

```
┌──────────────────────────────────────────────────────────────┐
│ Tài khoản                                                    │
│ Email        nguyenvana@example.com                          │
│ Mật khẩu     ••••••••                        [Đổi mật khẩu]  │
├──────────────────────────────────────────────────────────────┤
│ DỮ LIỆU CỦA BẠN                                              │
│ 2 CV · 3 JD · 6 phiên · 48 file ghi âm (120 MB)              │
│                                                              │
│ [Xóa tài khoản và toàn bộ dữ liệu]        (màu danger)       │
└──────────────────────────────────────────────────────────────┘
```

- **Đăng xuất:** nút ở đầu trang (cạnh tiêu đề). Xóa cả bản nháp câu trả lời lưu trên trình duyệt.
- **Đổi mật khẩu:** form mở ngay tại dòng "Mật khẩu": mật khẩu hiện tại, mật khẩu mới, nhập lại.
- **Xóa tài khoản:** hộp xác nhận yêu cầu gõ lại email, ghi rõ những gì bị xóa và không hoàn tác được.
- Khung "Dữ liệu của bạn" để người dùng biết hệ thống đang giữ gì về họ.

### Trang 11. Đăng nhập / Đăng ký (khi bật đăng nhập)

```
┌──────────────────────────────────────────────────────────────┐
│                         Intervia                             │
│              Luyện phỏng vấn với AI, theo CV và JD của bạn   │
│            ┌────────────────────────────────────┐            │
│            │ Email     [                      ] │            │
│            │ Mật khẩu  [                      ] │            │
│            │ [          Đăng nhập             ] │            │
│            │ Chưa có tài khoản? Đăng ký         │            │
│            └────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────────┘
```

- Một khối giữa trang, không có sidebar.
- Báo lỗi chung "Email hoặc mật khẩu không đúng", không nói rõ sai phần nào (tránh lộ email nào đã đăng ký).
- Đăng ký: email, mật khẩu (tối thiểu 10 ký tự), nhập lại mật khẩu.
- Quên mật khẩu cần gửi email: để sau, chưa có trong phiên bản đầu của đăng nhập.

### Trang lỗi

- **Không tìm thấy phiên** (sai đường dẫn hoặc đã xóa): "Không tìm thấy phiên này. Có thể phiên đã bị xóa." + nút về danh sách.
- **Không kết nối được máy chủ:** "Không kết nối được máy chủ Intervia. Kiểm tra backend đã chạy chưa." + nút thử lại.

---

## 4. Trang dự kiến cho sau MVP-1 (chưa làm)

| Trang | Nội dung chính | Liên quan |
|---|---|---|
| Xem lại → tab **Báo cáo** (MVP-2) | Tiêu chí đạt/thiếu theo rubric, trích dẫn bằng chứng từ câu trả lời, điểm mạnh và điểm cần cải thiện | A7 Evaluator, A8 Coach |
| **Tiến bộ** `/progress` (MVP-2+) | So sánh các phiên theo thời gian, tiêu chí thiếu lặp lại | Truy vấn theo ID tiêu chí |
| **Lộ trình học** `/roadmap` (MVP-3+) | Ưu tiên, mục tiêu học, bài tập, câu hỏi luyện | A8 Coach |

Bố cục MVP-1 đã chừa chỗ: sidebar có chỗ cho "Tiến bộ" và "Lộ trình", trang 6 đã có hàng tab.

## 5. Câu hỏi còn mở

1. ~~Có intent `HINT` không?~~ **Đã chốt (2026-10-12):** giữ nút "Gợi ý", gửi sự kiện `HINT` không qua classify; lời nói/gõ xin gợi ý vẫn là `CLARIFY`.
2. Barge-in: nếu không cho ngắt lời bằng giọng, cần nút "Dừng đọc".
3. ~~Có cho đặt tên phiên không?~~ **Đã chốt (2026-10-12):** không, chỉ dùng "Role · Level · ngày".
4. Trang 3 và 4 có nên gộp thành một trang để bớt một bước không? Đề xuất: giữ riêng, vì trang 3 là nơi kiểm tra đầu vào còn trang 4 là nơi chuẩn bị thiết bị.
5. Bật đăng nhập thật trong MVP-1 hay ngay sau? Phụ thuộc việc có cho người khác dùng thử sớm không. Trang 10, 11 chỉ làm khi bật.
