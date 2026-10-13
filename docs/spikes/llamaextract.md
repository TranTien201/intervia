# Spike: LlamaExtract cho trích xuất CV/JD (BE-4.3)

- Ngày: 2026-10-13. Trạng thái: **bản nháp, mới chạy 1 CV + 1 JD**. Chưa đủ bộ thử ở `docs/tasks/backend-cv-jd.md` (BE-4.3), nên kết luận dưới đây là tạm thời.
- Script: `backend/scripts/try_extract.py` (chạy trích xuất, tự kiểm tra; tùy chọn `--tier`, `--parse-tier`, `--as-text`), `backend/scripts/show_extract.py` (xuất kết quả ra Markdown để đọc). Kết quả thô ở `backend/.spike/out/` (không đưa lên git vì có dữ liệu CV).
- SDK: `llama-cloud` 2.18.0 (Extract v2). Đọc PDF tại chỗ: `pypdf` 6.20 (`extraction_mode="layout"`).

## Bộ thử

| File | Mô tả |
|---|---|
| CV | PDF **4 trang**, tiếng Anh, 1 cột, có chữ (không phải scan). AI Engineer ~3 năm: 3 công việc, 6 dự án, 35 gạch đầu dòng, 21 kỹ năng ở mục Skills |
| JD | PDF 2 trang, tiếng Anh, AI Engineer (UAV). 8 trách nhiệm, 5 gạch "Required", 4 gạch "Preferred / Nice-to-have" |

**Chưa thử:** CV scan, CV 2 cột, CV tiếng Việt, CV lẫn Việt–Anh, CV DOCX, CV Junior; JD dán text, JD tiếng Việt.

## Cách LlamaCloud tính phí

Theo [bảng giá](https://developers.llamaindex.ai/llamaparse/general/pricing/) (khớp với credit đo được ở mọi lần chạy):

- **Phí = (extract + parse) × số trang.** Extract: `cost_effective` 5, `agentic` 15, `agentic_plus` 50 credit/trang. Parse (bước đọc file, mặc định cùng gói với extract): `fast` 1, `cost_effective` 3, `agentic` 10 credit/trang.
- **File text (`.txt`, `.md`) chỉ tính phí extract, không có phí parse;** 600 token tính là một trang.
- Giá: $1,25 / 1.000 credit (trang giá chính ghi $1; kiểm tra lại khi lên kế hoạch chi phí). Gói Free: 10.000 credit/tháng.

## Các lần chạy

Prompt: CV `cv_extract_v1`; JD `jd_extract_v2` (trừ dòng ghi v1). Tất cả bật `cite_sources`.

**CV (4 trang):**

| Cấu hình | Thời gian | Credit | ≈ USD | Đúng schema | Kỹ năng mục Skills (đúng: 21) | Kinh nghiệm (đúng: 9) | Highlight |
|---|---|---|---|---|---|---|---|
| `agentic` (parse `agentic`) | 122–138 s | 100 | 0,125 | ✅ | 21 | 9 | 41 |
| `agentic` + parse `fast` | 113 s | 64 | 0,080 | ✅ | ❌ 31 (gắn nhầm nhãn) | ❌ 10 | 41 |
| `agentic` + chữ tự đọc (`.txt`) | 85 s | 75 | 0,094 | ✅ | 21 | 9 | 38 |
| `cost_effective` (parse `cost_effective`) | 68 s | 32 | 0,040 | ❌ thiếu khóa `technologies` | 22 | 9 | 41 |
| `cost_effective` + parse `fast` | 55 s | 24 | 0,030 | ❌ một kinh nghiệm hỏng hẳn | ❌ 31 | ❌ 10 | 40 |
| **`cost_effective` + chữ tự đọc (`.txt`)** | **31 s** | **25** | **0,031** | ✅ | ✅ 21 | ✅ 9 | 36 |

**JD (2 trang):**

| Cấu hình | Thời gian | Credit | ≈ USD | Số yêu cầu | Tên yêu cầu "at least one of SLAM…" |
|---|---|---|---|---|---|
| `agentic`, prompt v1 | 78–94 s | 50 | 0,063 | ❌ 56 | tách thành 9 yêu cầu |
| `agentic` | 87 s | 50 | 0,063 | 23 | "relevant area such as SLAM, VIO, LIO/LIVO" |
| `agentic` + parse `fast` | 96 s | 32 | 0,040 | 23 | "SLAM, VIO, LIO/LIVO, SfM" |
| `agentic` + chữ tự đọc | 54 s | 30 | 0,038 | 29 | "SLAM, VIO, LIO/LIVO, SfM" |
| `cost_effective` | 37 s | 16 | 0,020 | 23 | ❌ "at least one relevant area" (mất nội dung) |
| **`cost_effective` + chữ tự đọc** | **25 s** | **10** | **0,013** | 23 | "SLAM, VIO, LIO/LIVO, SfM" |

Server chấp nhận schema (`validate_schema`), không sửa gì, kể cả `enum` (từ `Literal`); kết quả không có nhãn nào ngoài danh sách.

## Tối ưu chi phí: tự đọc chữ, gửi `.txt`, dùng gói `cost_effective`

**Cách làm:** backend tự đọc chữ từ file (PDF bằng `pypdf`, DOCX bằng thư viện đọc DOCX; JD dán text thì có sẵn), gộp khoảng trắng, rồi tải lên LlamaExtract dưới dạng `.txt` với gói `cost_effective`.

**Kết quả trên bộ thử:** CV từ 100 còn **25 credit (giảm 75%)**, JD từ 50 còn **10 credit (giảm 80%)**, và **nhanh hơn** (31 s / 25 s). Một CV + một JD ≈ $0,044; gói Free 10.000 credit đủ ≈ 285 cặp CV + JD mỗi tháng.

**Chất lượng so với `agentic` đầy đủ:**
- Như nhau: 21/21 kỹ năng mục Skills, 9/9 kinh nghiệm, đủ 35/35 gạch đầu dòng, 4/4 giải thưởng, nhãn `metric` (7/7). JD: 23 yêu cầu, tên còn rõ hơn bản `cost_effective` đọc PDF.
- Kém hơn: bỏ 5 câu mô tả mở đầu của dự án (không phải gạch đầu dòng, ít giá trị); 7 kỹ năng bị lặp (vừa ở mục Skills vừa ở kinh nghiệm), code gộp được.
- Tốt hơn: mọi trường chữ đều tìm thấy nguyên văn trong chữ gốc (229/229).

**Lợi ích thêm:**
- Chữ dùng để kiểm tra trích dẫn chính là chữ ta gửi đi, không phải gọi thêm API lấy kết quả parse.
- Có thể **bỏ dòng liên hệ (email, SĐT, link) trước khi gửi**, để ít dữ liệu cá nhân rời khỏi server hơn.

**Vì sao không dùng parse `fast`:** rẻ gần bằng (24 credit) nhưng làm hỏng cấu trúc: gắn nhãn nhầm 10 kỹ năng, tách sai một kinh nghiệm; với `cost_effective` thì một kinh nghiệm mất hẳn tên và nội dung.

**Rủi ro, phải có đường dự phòng:**
1. **CV scan** (PDF chỉ có ảnh): `pypdf` không đọc được chữ. Khi chữ đọc được quá ít so với số trang, gửi file gốc với parse `cost_effective` (8 credit/trang).
2. **CV 2 cột:** `pypdf` có thể trộn dòng của hai cột. **Chưa thử, phải thử trước khi chốt.** Nếu hỏng thì cần cách nhận biết bố cục, hoặc chuyển sang đường gửi file gốc.
3. **PDF tiếng Việt lỗi font:** một số PDF có bảng mã font khiến chữ tiếng Việt đọc ra bị sai dấu. Cần kiểm tra chữ đọc được (vd tỷ lệ ký tự lạ); lỗi thì dùng đường dự phòng.
4. Text tính theo 600 token/trang nên CV nhiều chữ có thể bị tính nhiều "trang" hơn bản PDF (CV thử: 4 trang PDF, tính 5 trang text). Vẫn rẻ hơn vì không có phí parse.

**Các cách tiết kiệm khác, nên làm:**
- **Không trích lại file trùng:** lưu hash file; tải lại đúng file đó thì dùng lại kết quả cũ.
- **Giới hạn số trang** (`max_pages`, vd 6 trang cho CV) để một file lạ không tốn nhiều credit.
- Gói (tier) và cách đọc (chữ tự đọc / file gốc) đặt bằng biến môi trường, để đổi mà không phải sửa code.

## Trả lời 11 câu hỏi

Số liệu theo cấu hình đề xuất (`cost_effective` + chữ tự đọc), so với `agentic` khi cần.

| # | Câu hỏi | Kết quả |
|---|---|---|
| 1 | Trích đủ không? | **Đủ.** Kỹ năng mục Skills 21/21, gạch đầu dòng 35/35, kinh nghiệm/dự án 9/9, giải thưởng 4/4, học vấn và ngoại ngữ đủ, 37 kỹ năng chỉ có trong phần kinh nghiệm. JD: 8/8 trách nhiệm, đủ các gạch yêu cầu |
| 2 | Có bịa không? | **Không thấy mục bịa.** Code đối chiếu mọi trường chữ với chữ gốc: 229/229 (CV), 57/57 (JD). Ở bản `agentic`, vài trường không khớp đều là `metric` / `subject` ghép nhiều đoạn nguyên văn bằng `;`, không phải bịa |
| 3 | Có chép nguyên văn không? | Có. `highlights[].text` giữ nguyên câu gốc, không dịch, không gộp. `statement` được viết lại ngắn, đúng như thiết kế |
| 4 | Gắn nhãn đúng không? | Có, trừ khi dùng parse `fast` (xem trên). `source` của kỹ năng đúng; highlight có số liệu gắn `metric`. JD: `kind` required/preferred đúng; `importance` 3 cho "Strong", "Solid", 2 cho phần còn lại, 1 cho preferred, đúng quy tắc |
| 5 | Nhãn yêu cầu JD dùng được không? | **Prompt v1: không.** 13 gạch thành 56 yêu cầu: tách cả danh sách "chỉ cần một trong" (vd *"at least one relevant area such as SLAM, VIO, LIO/LIVO, SfM…"* thành 9 yêu cầu bắt buộc), tách cả chữ thừa ("related optimization methods"), "3DGS" xuất hiện 2 lần. **Prompt v2: dùng được.** 23 yêu cầu; danh sách lựa chọn giữ thành một yêu cầu (vd "ROS2, MAVLink, PX4, or ArduPilot"). Còn lỗi nhỏ: một vài `name` dài hơn 8 từ |
| 6 | Có lọt thông tin cá nhân không? | **Không.** Tên, SĐT, email, LinkedIn, GitHub trong CV và email HR trong JD đều không có trong kết quả |
| 7 | Trích dẫn dùng được không? | Trích dẫn trỏ được tới từng phần tử (vd `skills[3].name`), kèm số trang. **Nhưng không dựa vào được:** với PDF ở gói `agentic`, ~25% trích dẫn chỉ ghi đường dẫn trường (vd `"experiences.0.kind"`) thay vì câu gốc; một số bị cắt cụt hoặc có ký tự Markdown. Với file `.txt`, 25–50% `matching_text` không khớp với chữ đã gửi. → Không dùng `citation`; code tự kiểm tra bằng chữ gốc |
| 8 | CV scan, CV 2 cột | **Chưa thử** (chưa có file). Quan trọng hơn trước, vì cấu hình đề xuất tự đọc chữ (xem "Rủi ro") |
| 9 | Lấy được chữ đầy đủ của tài liệu không? | **Có**, theo hai cách: tự đọc (`pypdf`, miễn phí, cấu hình đề xuất), hoặc lấy từ parse job (`parsing.get(parse_job_id, expand=["text"])`, phải lấy trước khi xóa job) |
| 10 | Độ trễ, chi phí | Cấu hình đề xuất: CV 31 s / 25 credit (≈ $0,031), JD 25 s / 10 credit (≈ $0,013). Dưới ngưỡng 60 s. Bảng đầy đủ ở trên |
| 11 | Gói nào | `cost_effective` + chữ tự đọc; dự phòng: `cost_effective` + file gốc (parse `cost_effective`). Gói `cost_effective` vẫn có `cite_sources` (khác ghi chú cũ ở `extraction.md` mục 7) |

Xóa dữ liệu trên LlamaCloud: xóa được cả file, extract job và parse job qua API (`files.delete`, `extract.delete`, `parsing.delete`). Có đặt `disable_cache: true` để LlamaCloud không giữ lại kết quả.

## Đã sửa trong lúc spike

- `app/prompts/jd_extract_v2.md` (mới): quy tắc tách yêu cầu theo cách JD viết: "cần tất cả" thì tách; "chỉ cần một trong" (A, B, or C / such as / một trong / hoặc) thì giữ một yêu cầu; không tạo yêu cầu cho chữ thừa; mỗi yêu cầu chỉ xuất hiện một lần. Thêm ví dụ tiếng Việt.
- `app/schemas/extraction.py`: sửa `description` của `requirements[].name` và `.text` cho khớp (LlamaExtract đọc `description` như chỉ dẫn); `JD_SCHEMA_VERSION` lên `jd-2`.

## Việc code phải làm (đưa vào BE-4.4 / BE-4.5 / BE-4.6)

1. **Đọc chữ tại chỗ** (PDF, DOCX) rồi gửi `.txt`; **đường dự phòng** gửi file gốc khi không đọc được chữ, hoặc chữ đọc được có dấu hiệu lỗi (scan, lỗi font). Lưu chữ đã gửi cùng bản phân tích.
2. **Không tin `citation`; tự kiểm tra trích dẫn bằng chữ đã gửi.** So sánh sau khi chuẩn hóa: bỏ ký tự Markdown và dấu gạch đầu dòng, gộp khoảng trắng, không phân biệt hoa thường. `metric` / `subject` thì tách theo `;` rồi kiểm tra từng đoạn.
3. **Chịu được output thiếu khóa:** trường danh sách thiếu thì coi là `[]` rồi mới validate. Thiếu trường bắt buộc khác thì chạy lại một lần.
4. **Gộp kỹ năng trùng** không phân biệt hoa thường; ưu tiên giữ bản có `source = skills_section`.
5. **`name` yêu cầu JD dài hơn 8 từ:** chỉ ghi log, không chặn (người dùng sửa được).
6. **Tiết kiệm:** hash file để không trích lại file trùng; `max_pages`; gói và cách đọc đặt bằng biến môi trường.

## Kết luận (tạm thời)

**Dùng tiếp có điều kiện, với cấu hình `cost_effective` + chữ tự đọc.** Trên bộ thử: không bịa, không lọt PII, trích đủ như gói `agentic`, rẻ hơn 4–5 lần và nhanh hơn.

**Phải chạy nốt bộ thử trước khi chốt**, ưu tiên: CV 2 cột, CV scan, CV tiếng Việt (PDF xuất từ Word/Canva/TopCV), CV DOCX, JD tiếng Việt. Ba loại đầu là nơi cách tự đọc chữ dễ hỏng; nếu hỏng nhiều thì dùng đường dự phòng thường xuyên hơn, chi phí tăng lên mức 32 credit/CV 4 trang.

**Quyết định sau báo cáo (2026-10-13):** không chọn cứng một cấu hình mà cho người dùng chọn chế độ: Tiêu chuẩn (mặc định, cấu hình đề xuất ở trên) / Đọc bố cục / Chính xác cao. Chi tiết: `docs/design/extraction.md` mục 8.
