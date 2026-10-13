# Trích xuất CV và JD: trích gì, không trích gì

- Cập nhật: 2026-10-13 (bỏ competency catalog, bỏ khối Đối chiếu)
- Vai trò: A1 CV Profiler, A2 JD Analyzer (`agents.md` mục 3).
- Công cụ: **LlamaExtract (LlamaCloud)** cho cả đọc file (có OCR) lẫn trích xuất theo schema. Các vai trò sau (A3 trở đi) dùng LLM khác.
- Task triển khai: `docs/tasks/backend-cv-jd.md`.

## 1. Nguyên tắc

1. **Chỉ trích thứ có người dùng.** Mỗi trường phải phục vụ ít nhất một nơi: Blueprint (A3), Turn Planner (A5), Speaker (A6), hoặc giao diện. Không có ai dùng thì không trích.
2. **Chép nguyên văn, không suy diễn.** Chữ giữ đúng như CV/JD (không dịch, không viết lại, giữ tên công nghệ gốc). CV không ghi thì để `null`, không đoán.
3. **Chỉ có ba loại việc được phép "nghĩ":** chuẩn hóa ngày tháng, gắn nhãn phân loại (theo danh sách cố định như `kind`), và viết câu tóm tắt ngắn (`statement` của claim, `name` của yêu cầu JD) chỉ bằng cách rút gọn. Mỗi việc có hướng dẫn trong mô tả trường.
4. **Code tính phần còn lại:** tổng số năm kinh nghiệm, danh sách claim, gộp kỹ năng trùng.
5. **Không map vào danh sách chủ đề cố định (catalog).** Trích tự do theo đúng chữ trong tài liệu, nên dùng được cho mọi ngành. Việc so CV với JD (yêu cầu nào CV đã có, yêu cầu nào thiếu) do A3 làm lúc lập kế hoạch, vì A3 đọc cả hai (mục 5).
6. **Không trích dữ liệu cá nhân không cần cho phỏng vấn.** CV là PII; thứ không trích thì không phải lưu, không phải bảo vệ.
7. **Mọi mục có trích dẫn nguyên văn** (`cite_sources` của LlamaExtract với CV; JD dán text thì code tự so với chữ gốc). Không có trích dẫn thì giao diện cảnh báo màu hổ phách.

## 2. CV

Cấu trúc CV IT phổ biến (ITviec, JSON Resume): thông tin cá nhân, giới thiệu/mục tiêu, kỹ năng, kinh nghiệm, dự án, học vấn, chứng chỉ, giải thưởng, ngoại ngữ, sở thích, người tham chiếu. Thứ tự thay đổi theo level (fresher đưa học vấn và dự án lên đầu), nên schema không dựa vào thứ tự mục.

### 2.1. Trích

| Nhóm | Trường | Dùng cho | Ghi chú |
|---|---|---|---|
| **Chung** | `headline`: chức danh tự ghi (vd: "Senior Backend Engineer") | A3 (dấu hiệu level) | Nguyên văn |
| | `stated_years`: số năm kinh nghiệm CV tự ghi | A3 | Chỉ khi CV ghi rõ; code vẫn tự tính từ kinh nghiệm để đối chiếu |
| | `cv_language`: `vi` / `en` / `mixed` | A6 | |
| **Kỹ năng** `skills[]` | `name` (nguyên văn), `source`: `skills_section` / `experience`, `group` (nhóm CV tự đặt, vd "Database"), `proficiency` (mức CV tự ghi, vd "Thành thạo"), `years` (chỉ khi ghi rõ) | A3, giao diện | Gồm **cả** công nghệ chỉ xuất hiện trong kinh nghiệm (`source = experience`), mỗi tên một lần, để A3 thấy đủ (CV dùng Kafka trong dự án nhưng không liệt kê ở mục Kỹ năng). Không tự gán mức thành thạo. Không suy năng lực từ công nghệ (dùng Redis không có nghĩa là giỏi system design) |
| **Kinh nghiệm** `experiences[]` | `kind`: `work` / `internship` / `freelance` / `project`; `name` (tên công ty hoặc tên dự án); `organization` (nếu dự án thuộc công ty); `role`; `period` (nguyên văn); `start`, `end` (YYYY-MM hoặc YYYY; `end = null` khi đang làm hoặc CV không ghi), `is_current` (CV ghi "nay", "present"); `team_size` (chỉ khi ghi); `technologies[]` (công nghệ ghi trong mục đó) | A3, A5/A6 (anchor: "Ở dự án X bạn…"), giao diện | Dự án cá nhân, đồ án tốt nghiệp, dự án trong công ty đều là `project`. Với Junior đây là nguồn câu hỏi chính |
| | `highlights[]`: **từng gạch đầu dòng, chép nguyên văn**, mỗi dòng kèm `kind`: `metric` (có số liệu/kết quả đo được) / `ownership` (tự thiết kế, xây dựng, dẫn dắt) / `task` (mô tả công việc thường); `metric` (vd "40%"), `subject` (vd "độ trễ p95 API"); với `metric` / `ownership` thêm `statement`: câu ngắn tóm lại (vd "Giảm 40% độ trễ API"), chỉ được rút gọn, không thêm ý | A3 chọn claim kiểm chứng, A5 | **Claim không trích riêng:** code lấy các highlight `metric` + `ownership` làm claim. Claim nằm trong kinh nghiệm nên luôn biết nó thuộc công ty/dự án nào, và không bị trùng với highlight |
| **Dấu hiệu level** `seniority_signals[]` | `kind`: `lead_team` / `mentoring` / `architecture` / `scale` / `cross_team`; `text` (nguyên văn) | A3 | Lấy từ cả headline, giới thiệu, kinh nghiệm. Backend lưu, chưa trả cho web |
| **Học vấn** `education[]` | `institution`, `degree`, `major`, `period` | A3 (Junior/fresher) | Không lấy GPA, môn học |
| **Chứng chỉ, giải thưởng** `credentials[]` | `kind`: `certificate` / `award`; `name`, `issuer`, `year` | A3 (vd: chứng chỉ AWS → câu hỏi cloud; giải ICPC → thuật toán) | Nguyên văn |
| **Ngoại ngữ** `languages[]` | `name`, `level` (nguyên văn, vd "IELTS 7.0") | A3 khi JD yêu cầu ngoại ngữ | |

### 2.2. Không trích

| Mục | Lý do |
|---|---|
| Họ tên, email, SĐT, địa chỉ, ngày sinh, giới tính, tình trạng hôn nhân, quốc tịch, ảnh, số CMND | PII, phỏng vấn không cần. Speaker không gọi tên ứng viên |
| Link GitHub, LinkedIn, portfolio, website | Định danh được người; hệ thống không đọc nội dung các link này |
| Mục tiêu nghề nghiệp, đoạn giới thiệu (phần văn tự do) | Chung chung; chỉ lấy `headline`, `stated_years` và dấu hiệu level từ đó |
| Sở thích, hoạt động ngoại khóa, CLB, tình nguyện | Không dùng cho phỏng vấn kỹ thuật |
| Người tham chiếu | PII của người khác |
| Mức lương mong muốn | Không liên quan |
| GPA, danh sách môn học | Không dùng; GPA dễ thành định kiến |
| Kỹ năng mềm tự khai chung chung ("làm việc nhóm tốt") | Vẫn trích vào `skills` nếu CV ghi, nhưng **không** thành claim |

## 3. JD

### 3.1. Trích

| Nhóm | Trường | Dùng cho | Ghi chú |
|---|---|---|---|
| **Chung** | `company`, `position` | Thư viện (`JdSummary`) | `null` nếu không ghi |
| | `stated_level` (vd "Senior"), `years_required` (số, vd 3) | A3, gợi ý Target Level | Chỉ khi ghi rõ |
| | `domain` (vd "thanh toán", "fintech") | A5 (tình huống sát thực tế) | Chỉ khi ghi rõ |
| | `jd_language` | A6 | |
| **Trách nhiệm** `responsibilities[]` | `text` (từng gạch đầu dòng, nguyên văn) | A3, A5 (câu hỏi tình huống: "hệ thống xử lý giao dịch bất đồng bộ") | Backend lưu, chưa trả cho web |
| **Yêu cầu** `requirements[]` | `name` (nhãn ngắn ≤ 8 từ, vd "PostgreSQL, tối ưu truy vấn"), `text` (nguyên văn), `kind`: `required` / `preferred`, `importance` 1–3 | A3, giao diện | Xem quy tắc 3.2 |
| **Dấu hiệu level** `level_signals[]` | `text` (vd "Mentor các bạn junior", "3+ năm kinh nghiệm") | A3 | Không phải yêu cầu kỹ năng, nên không vào `requirements` |

### 3.2. Quy tắc cho yêu cầu

- **Lấy từ phần yêu cầu** ("Yêu cầu", "Requirements", "Nice to have"…). Phần mô tả công việc đi vào `responsibilities`, không tự sinh yêu cầu (tránh suy gượng như "hệ thống thanh toán" → Xử lý lỗi).
- **Tách** một gạch đầu dòng có nhiều kỹ năng độc lập: "Thành thạo thiết kế API, PostgreSQL" → 2 yêu cầu, cùng trích dẫn. Không tách khi các ý thuộc cùng một việc ("PostgreSQL, tối ưu truy vấn" là một yêu cầu).
- **`name`** chỉ rút gọn chữ trong JD, không đổi sang từ khác, không gom nhiều yêu cầu thành một.
- **`kind = preferred`** khi có dấu hiệu "là lợi thế", "ưu tiên", "nice to have", "a plus", "bonus". Còn lại là `required`.
- **`importance`:** 3 = nhấn mạnh ("thành thạo", "must", "strong", "sâu"); 2 = liệt kê bình thường; 1 = phụ hoặc `preferred`.

### 3.3. Không trích

Lương, phúc lợi, địa điểm, giờ làm, cách ứng tuyển, thông tin liên hệ HR (PII), đoạn giới thiệu công ty (trừ `domain`).

## 4. Từ kết quả trích xuất ra API và giao diện

LlamaExtract trả về dữ liệu thô theo schema mục 2–3 (`CvExtraction`, `JdExtraction`), lưu nguyên trong bản phân tích. Code chuyển sang type web (`web/src/api/types.ts`, `api.md`). So với type web hiện có, chỉ **bỏ** `Skill.catalog_id`, `Requirement.catalog_id`, `JdRequirements.unmapped` (task web: `docs/tasks/ui.md` UI-5.5). Các trường thêm (học vấn, chứng chỉ, ngoại ngữ, highlights, dấu hiệu level, trách nhiệm JD) chỉ backend lưu, dùng cho A3 trở đi.

### 4.1. CV → `CandidateProfile` (trang 3, trang 8 Chi tiết CV)

| Giao diện hiện | Type web | Lấy từ |
|---|---|---|
| Tag kỹ năng ("Python ✕") | `Skill.name` | `skills[].name` |
| | `Skill.years` | `skills[].years` |
| | `Skill.source_quote` | trích dẫn của `skills[]` |
| "Backend Engineer @ Công ty ABC · 2022–nay" | `Experience.role`, `organization`, `period` | `role`; `organization`, hoặc `name` khi là dự án không thuộc công ty; `period` nguyên văn |
| | `Experience.technologies` | `experiences[].technologies` |
| | `Experience.source_quote` | trích dẫn của `experiences[]` |
| Thẻ claim: dòng đậm | `Claim.statement` | `highlights[].statement` (chỉ highlight `metric` / `ownership`) |
| Thẻ claim: câu gốc trong ngoặc kép | `Claim.source_quote` | `highlights[].text` (nguyên văn) |
| | `Claim.metric`, `subject` | `highlights[].metric`, `subject` |
| | `Claim.verifiable` | `kind == metric` |
| Cảnh báo hổ phách | `Claim.quote_status` | `found` khi có trích dẫn từ `cite_sources`, ngược lại `not_found`; claim người dùng tự thêm là `user_added` (web đặt) |

### 4.2. JD → `JdSummary`, `JdRequirements` (thư viện, trang 3, trang 9)

| Giao diện hiện | Type web | Lấy từ |
|---|---|---|
| Thư viện: "Backend Engineer · Công ty ABC" | `JdSummary.position`, `company` | `position`, `company` |
| Thư viện: "5 yêu cầu" | `JdSummary.requirement_count` | số yêu cầu |
| Trang 9: văn bản JD | `JdDetail.text` | text dán, hoặc text LlamaExtract đọc từ file |
| Dòng yêu cầu: tên | `Requirement.name` | `requirements[].name` |
| Dòng yêu cầu: câu gốc | `Requirement.source_quote` | `requirements[].text` (code kiểm tra có trong JD; không có thì `null`) |
| Nhãn Bắt buộc / Nên có | `Requirement.kind` | `requirements[].kind` |
| | `Requirement.importance` | `requirements[].importance` |

### 4.3. Các bước tiến trình (`AnalysisProgress`)

LlamaExtract đọc file và trích trong cùng một job, nên không tách được "đọc" và "trích". Giữ nguyên các bước mock để web không đổi:
- CV: `upload` (đã lưu file) → `extract` (job LlamaExtract đang chạy) → `profile` (code chuyển dữ liệu, gộp, tạo claim).
- JD: `receive` → `analyze` (job LlamaExtract + code chuyển dữ liệu).

## 5. Vì sao không dùng competency catalog (chốt 2026-10-13)

Phương án cũ: một file soạn tay liệt kê chủ đề cố định (`DATABASE`, `CACHING`…), mọi kỹ năng và yêu cầu bị ép gắn vào một mã, code so mã để biết JD và CV khớp nhau.

Bỏ vì:
- **Không mở rộng được:** mỗi ngành phải soạn tay một danh sách; thứ nằm ngoài danh sách rơi vào "không map được" và mất khỏi buổi phỏng vấn.
- **Không cần cho việc chính:** A3 nhận cả hồ sơ lẫn yêu cầu và tự thấy JD đòi "caching" mà CV có "Redis", hay JD đòi Kubernetes mà CV không có. So khớp là việc phán đoán ngữ nghĩa, đúng phần việc của LLM.

Hệ quả:
- **Không có bước so khớp riêng** và không có khối "Đối chiếu" do code tính ở trang 3. Trang 3 chỉ để người dùng kiểm tra và sửa kết quả trích xuất. Chỗ JD đòi mà CV thiếu nằm trong output của A3 (`jd_cv_gaps`), hiện ở trang 4 nếu cần (chốt ở BE-5).
- **Chủ đề phỏng vấn (competency) do A3 đặt tên tự do** cho từng phiên, code gán id trong phạm vi phiên.
- **Còn mở cho MVP-2:** rubric và "điểm yếu lặp lại giữa các phiên" cần mã chủ đề ổn định. Khi đó có thể cho LLM gom chủ đề từ dữ liệu thật đã tích lũy thay vì soạn tay từ đầu.

## 6. Lỗi trong dữ liệu mock cần tránh

Dữ liệu mẫu (`web/src/mocks/seed.ts`) có vài chỗ đi ngược quy tắc trên, ghi lại để không lặp lại khi viết prompt:
- JD ABC: yêu cầu "Xử lý lỗi" lấy trích dẫn "hệ thống thanh toán" là suy diễn từ phần mô tả công việc (vi phạm 3.2).
- "3+ năm kinh nghiệm backend", "Mentor các bạn junior" nằm trong `unmapped`; đúng ra là `level_signals`.

## 7. Còn mở

- **Gói LlamaExtract:** `cite_sources` chỉ có ở gói agentic/MULTIMODAL trở lên. Đo chi phí và chất lượng khi chạy thử.
- **Giới hạn schema của LlamaExtract** (tài liệu "Schema Design and Restrictions", kiểm tra 2026-10-13): root phải là `object`; lồng tối đa 7 tầng (khuyên 3–4); tối đa 5.000 thuộc tính, 120.000 ký tự chuỗi, 150.000 ký tự JSON; chỉ đọc tên khóa, `type`, `description` (không hỗ trợ `default`, định dạng); thiếu `required` thì mọi trường thành bắt buộc; `anyOf` + `null` dùng cho trường nullable; `$ref` được bung ra. Schema hiện tại (`cv-1`, `jd-1`) lồng 5 tầng (`experiences[].highlights[]`), khoảng 10.000 ký tự: **không có giới hạn ảnh hưởng**, giữ nguyên cấu trúc mục 2–3. **Chưa xác nhận:** tài liệu không nói rõ `enum` (từ `Literal`) có được tuân thủ không; kiểm tra ở BE-4.3, nếu không thì code chuẩn hóa nhãn sau khi nhận kết quả.
- **CV dài:** giới hạn số `highlights` mỗi kinh nghiệm nếu kết quả quá dài (đo khi chạy thử).
