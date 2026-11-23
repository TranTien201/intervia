# Task chi tiết: Lớp provider LLM (BE-3)

- Cập nhật: 2026-10-25
- Phạm vi: nhóm BE-3 trong `backend.md`. Gồm OpenAI, Gemini và model tự serving trên Modal.
- Người đọc: người được giao task. Đọc **mục 0** trước khi nhận bất kỳ task nào. Mỗi task ở mục 3 đọc độc lập được.
- Đánh dấu tiến độ ở `backend.md` (ô `[ ]`), không đánh dấu ở file này. Task đổi phạm vi thì sửa luôn file này.

---

## 0. Đọc trước khi làm

### 0.1. Nhóm việc này làm gì

Mọi lời gọi LLM của backend (A3 Blueprint, A4 Intent Classifier, A5 Turn Planner, A6 Speaker; sau này A7 Evaluator) đi qua **một lớp duy nhất**. `domain/` chỉ nói "vai trò X cần output theo schema Y" hoặc "vai trò X cần stream text"; lớp này chọn endpoint và model, gọi API, kiểm tra schema, retry, ghi `llm_calls`.

A1, A2 **không** đi qua lớp này (dùng LlamaExtract, `providers/extract/`).

```
domain/ (A3, A4, A5, A6)
   │  llm.structured(role, schema, system, messages)   /   llm.stream(role, ...)
   ▼
LlmService (app/domain/llm.py)
   │  - chọn endpoint + model theo vai trò (cấu hình, hoặc bản chụp của phiên)
   │  - validate Pydantic, retry khi sai schema (tối đa 2 lần, gửi kèm lỗi)
   │  - timeout theo vai trò, hủy được
   │  - ghi llm_calls (cả lời gọi lỗi / bị hủy)
   ▼
LlmProvider (app/providers/llm/): chỉ dịch request sang API của hãng
   ├─ openai_compat ──HTTPS──► api.openai.com
   ├─ openai_compat ──HTTPS──► https://<app>.modal.run/v1  (vLLM trên GPU Modal)
   ├─ gemini ─────────HTTPS──► Gemini API (SDK google-genai)
   └─ fake (chạy trong process, cho test và dev không có key)
```

**Một adapter cho cả OpenAI lẫn Modal:** model trên Modal được serving bằng vLLM (hoặc SGLang), mở API tương thích OpenAI (`/v1/chat/completions`, có `response_format` JSON Schema và stream). Backend gọi nó y như gọi OpenAI, chỉ khác `base_url`, khóa và vài cờ. Không dùng `modal` SDK trong backend: dính chặt vào Modal, phải tự làm stream, đổi nơi serving phải sửa code.

**Phần serving trên Modal là một dự án con riêng** (`serving/modal/`, BE-3.5): script deploy vLLM lên Modal, có thư viện và lệnh riêng, không nằm trong `backend/`. Backend chỉ biết URL + khóa. Đổi nơi serving (máy GPU riêng, RunPod…) thì backend không đổi.

**Gemini có adapter riêng** dù có endpoint tương thích OpenAI, vì CLAUDE.md chốt dùng structured output native của từng hãng và SDK native hỗ trợ schema đầy đủ hơn.

**Anthropic chưa làm** (chưa có ngân sách). Interface không cần đổi khi thêm sau.

### 0.2. Quyết định của nhóm việc này

Các quyết định dưới đây là **đề xuất**, người dùng chốt trước khi bắt đầu task liên quan; dòng nào đã chốt ghi "Đã chốt (ngày)". Chốt xong thì chép vào CLAUDE.md (BE-3.7).

| # | Quyết định | Đề xuất | Lý do | Ảnh hưởng task |
|---|---|---|---|---|
| D1 | Provider | **Đã chốt 2026-10-28.** `openai_compat` (OpenAI, Modal/vLLM, sau này Ollama/OpenRouter…), `gemini`, `fake`. Anthropic thêm sau | Một adapter phủ được OpenAI và mọi nơi tự serving | 3.4, 3.6, 3.7 |
| D2 | API của OpenAI | **Chat Completions**, không dùng Responses API | vLLM và các dịch vụ tương thích chỉ chắc chắn hỗ trợ Chat Completions; dùng chung một đường code | 3.4 |
| D3 | Cấu hình | File `backend/llm.yaml`: các **endpoint có tên** + bảng **vai trò → endpoint + model**. Key nằm trong `.env`, YAML chỉ ghi tên biến | Một biến `LLM_PROVIDER` không đủ khi dùng nhiều nơi cùng lúc | 3.2 |
| D4 | Không tự đổi provider khi lỗi | Giữ (`agents.md` mục 6) | Đổi giữa phiên làm điểm không so sánh được | 3.1 |
| D5 | Bản chụp cấu hình theo phiên | Khi phiên bắt đầu, lưu bảng vai trò → endpoint + model vào phiên; cả phiên dùng bảng đó | Sửa `llm.yaml` không ảnh hưởng phiên đang chạy; các vai trò dùng hãng khác nhau vẫn được, miễn cố định suốt phiên | 3.2 (hàm), BE-6 (lưu vào phiên) |
| D6 | `llm_calls` lưu input | **Lưu toàn bộ** system + messages đã ghép, gắn `user_id` + `ref`, xóa cùng phiên / CV / JD | Chạy lại đúng cần đúng input; ghép lại từ dữ liệu cũ dễ lệch khi code ghép prompt đổi | 3.2 |
| D7 | Modal: cold start | Lúc đầu chỉ dùng Modal cho vai trò không gấp (A3); có hàm `warmup()` để domain gọi trước (vd: khi mở trang 4). Chuyển A4–A6 sang Modal chỉ khi số đo ở BE-3.6 đạt | Cold start vài chục giây tới vài phút, vượt xa mục tiêu ~1,5s | 3.5, 3.6 |
| D8 | Serving trên Modal | vLLM, mở API tương thích OpenAI, code ở `serving/modal/` (ngoài `backend/`), weight lưu trong Modal Volume | vLLM có structured output + stream qua API OpenAI, có ví dụ chính thức của Modal; Volume giảm cold start vì không tải lại weight | 3.5 |

### 0.3. Tài liệu phải đọc

| Tài liệu | Phần cần đọc | Để biết |
|---|---|---|
| `CLAUDE.md` | "Hệ thống agent", "Nguyên tắc thiết kế" | Structured output bắt buộc, dữ liệu không tin cậy, `llm_calls`, PII |
| `docs/design/agents.md` | Mục 1.4, 2, 4, 5, 6 | Vai trò nào dùng model gì, ai thấy gì, độ trễ, xử lý lỗi |
| `docs/references/career-ops-ui.md` | "Lớp đa provider", "Bài học" | Adapter tương thích OpenAI dùng chung, những gì làm khác |

### 0.4. Code hiện có phải dùng lại

| Thứ | Ở đâu | Dùng thế nào |
|---|---|---|
| Mẫu provider | `app/providers/extract/` (`base.py`, `fake.py`, `llamacloud.py`, `__init__.py`) | Cùng cách: interface `Protocol` trong `base.py`, hàm tạo theo cấu hình trong `__init__.py`, retry tự đếm (tắt retry của SDK), lỗi có `code` |
| `llm_calls` | `app/schemas/llm_call.py`, `app/db/llm_calls.py` | Đã có cho A1/A2. Mở rộng, không tạo collection mới |
| Cách ghi `llm_calls` | `app/domain/extraction.py` (quanh dòng 185–235) | Ghi cả lời gọi lỗi |
| Prompt có version | `app/prompts/__init__.py`: `load_prompt(name)` | Dùng tiếp, không viết lại |
| Cấu hình | `app/config.py`: `Settings` | Thêm `LLM_CONFIG_PATH`; biến mới ghi vào `backend/.env.example` |

### 0.5. Quy ước bắt buộc

1. **`domain/` không import SDK nào** (`openai`, `google.genai`). Chỉ import `app.providers.llm.base`.
2. **Không log nội dung** prompt, CV, câu trả lời, output ở mức INFO. Chỉ log vai trò, endpoint, model, độ trễ, token, mã lỗi.
3. **Tắt retry của SDK** (`max_retries=0`); retry do code mình làm và đếm, ghi vào `llm_calls.retries`.
4. **Không tự đổi sang endpoint khác khi lỗi** (D4).
5. **Test không gọi API thật.** Test gọi thật đánh dấu `@pytest.mark.llm_live`, mặc định bỏ qua, chạy bằng `RUN_LLM_LIVE_TESTS=1` (giống `llamacloud`).

### 0.6. Định nghĩa "xong" chung

Như `backend-cv-jd.md` mục 0.5: đủ **Output**, test bắt buộc qua, `uv run ruff check .` sạch, tài liệu bị ảnh hưởng đã sửa, đánh dấu `[x]` ở `backend.md` kèm một dòng "Đã xong (ngày): …".

---

## 1. Thứ tự và phụ thuộc

```
BE-3.1 Interface + fake + LlmService ─► BE-3.2 Cấu hình + llm_calls ─► BE-3.3 Prompt + dữ liệu không tin cậy
    ─► BE-3.4 openai_compat (OpenAI) ─┐
                                      ├─► BE-3.6 Nối Modal + đo ─► BE-3.7 Gemini + cập nhật tài liệu
BE-3.5 Serving trên Modal ────────────┘   (độc lập với backend, làm song song từ đầu được)
```

Xong **BE-3.1 → 3.3** là BE-5 (Blueprint) bắt đầu được, chạy bằng adapter fake. BE-3.4 → 3.7 làm song song với BE-5 được.

| Task | Tên | Cần xong trước | Ước lượng |
|---|---|---|---|
| BE-3.1 | Interface, adapter fake, `LlmService` (validate, retry, timeout, hủy) | — | 1,5 ngày |
| BE-3.2 | `llm.yaml`, chọn theo vai trò, bản chụp, mở rộng `llm_calls` | 3.1 | 1 ngày |
| BE-3.3 | Ghép prompt, bọc dữ liệu không tin cậy | 3.1 | 0,5 ngày |
| BE-3.4 | Adapter `openai_compat` (đủ đặc tính endpoint), bộ kiểm tra chung `llm_check`, thử với OpenAI | 3.2, key OpenAI | 2 ngày |
| BE-3.5 | Serving model trên Modal (vLLM, API tương thích OpenAI, có khóa) | Tài khoản Modal, chọn model | 1–1,5 ngày |
| BE-3.6 | Nối backend với Modal: khóa, warmup, đo cold start / độ trễ / tỉ lệ đúng schema | 3.4, 3.5 | 1 ngày |
| BE-3.7 | Adapter `gemini` + cập nhật CLAUDE.md, README, `agents.md` | 3.2, key Gemini | 1 ngày |

---

## 2. Thiết kế chung (các task dùng lại)

### 2.1. Interface provider (`app/providers/llm/base.py`)

```python
class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class LlmRequest(BaseModel):
    model: str
    system: str
    messages: list[Message]
    max_output_tokens: int
    temperature: float | None = None

class Usage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0

class JsonResult(BaseModel):
    text: str                 # reply as returned, NOT parsed: LlmService parses + validates
    usage: Usage
    model: str                # model actually used (as reported by the API)

class TextChunk(BaseModel):
    text: str
    usage: Usage | None = None   # set on the last chunk only

LlmErrorCode = Literal["timeout", "rate_limited", "unavailable", "auth", "bad_request", "refused",
                       "bad_output"]   # bad_output: set by LlmService only

class LlmError(Exception):
    code: LlmErrorCode
    retryable: bool           # default: code in {timeout, rate_limited, unavailable}

class LlmProvider(Protocol):
    name: str      # adapter kind: "openai_compat" | "gemini" | "fake"
    async def generate_json(self, req: LlmRequest, schema: type[BaseModel]) -> JsonResult: ...
    def stream_text(self, req: LlmRequest) -> AsyncGenerator[TextChunk, None]: ...
    async def warmup(self) -> None: ...      # no-op except endpoints that scale to zero
    async def aclose(self) -> None: ...
```

- Adapter nhận **class Pydantic** và tự đổi sang dạng JSON Schema mà hãng đó chấp nhận (mục 2.3). Adapter **không** validate kết quả: việc đó của `LlmService`, để mọi hãng retry giống nhau.
- Adapter **không retry** (retry của SDK cũng tắt), chỉ đổi lỗi sang `LlmError`. Retry lỗi tạm thời (`rate_limited`, `unavailable`, `timeout` của một request) do `LlmService` làm, có backoff, trong giới hạn timeout của vai trò. Đổi so với bản đầu (2026-10-28, BE-3.1): một chỗ retry và đếm cho mọi hãng, adapter mỏng hơn.
- Stream: chỉ retry khi **chưa có chữ nào** được trả ra; đã stream rồi mà đứt thì báo lỗi (domain có phương án dự phòng, `agents.md` mục 6).
- Hủy (`asyncio.CancelledError`) phải đóng kết nối HTTP và lan ra ngoài, không bị nuốt.

### 2.2. `LlmService` (`app/domain/llm.py`)

```python
class LlmService:
    async def structured(self, role: LlmRole, schema: type[T], *, system: str, messages: list[Message],
                         prompt_version: str, ctx: CallContext, roles: RoleSnapshot | None = None) -> T
    def stream(self, role: LlmRole, *, system: str, messages: list[Message],
               prompt_version: str, ctx: CallContext, roles: RoleSnapshot | None = None) -> AsyncIterator[str]
    async def warmup(self, roles: Iterable[LlmRole], snapshot: RoleSnapshot | None = None) -> None
```

- `CallContext`: `user_id`, `ref` (vd: `{"kind": "session", "id": ...}`) để ghi `llm_calls` và xóa theo.
- `roles`: bản chụp của phiên (D5). Không truyền thì dùng cấu hình hiện tại.
- **Retry khi sai schema** (JSON hỏng hoặc Pydantic báo lỗi): gọi lại tối đa 2 lần, thêm vào cuối hội thoại lượt `assistant` (output sai) + lượt `user` (lỗi validate, rút gọn). Hết 2 lần: `LlmError("bad_output")`, domain dùng phương án dự phòng.
- **Timeout theo vai trò** bọc toàn bộ lời gọi kể cả retry (`asyncio.timeout`). Stream có hai mốc: chờ chữ đầu tiên và tổng thời gian.
- **Ghi `llm_calls` mọi trường hợp:** `ok`, `error`, `timeout`, `cancelled`. Ghi trong `finally`, lỗi khi ghi DB chỉ log, không che lỗi gốc.
- Bản ghi đếm riêng `retries` (sai schema) và `transient_retries` (lỗi tạm thời), để so sánh độ tuân thủ schema giữa các endpoint.

### 2.3. Quy tắc viết schema output (cho A3–A7)

Mỗi hãng nhận một tập con JSON Schema khác nhau. Schema của Intervia viết trong tập con chung để chạy được ở mọi adapter:

- Chỉ dùng: `str`, `int`, `float`, `bool`, `Literal[...]` (enum), `list[...]`, model lồng nhau, `X | None`.
- Không dùng: giá trị mặc định có ý nghĩa (mọi trường đều bắt buộc, "không có" thì là `None`), `dict[str, Any]`, union giữa các model, ràng buộc regex. Ràng buộc số lượng / khoảng giá trị thì code kiểm tra sau.
- Mô tả trường (`Field(description=...)`) bằng tiếng Anh, ngắn: model đọc phần này.
- Mỗi adapter có hàm `to_provider_schema(model_cls)`. **Test bắt buộc:** mọi schema output đã đăng ký đổi được sang dạng của mọi adapter không lỗi (`tests/test_llm_schemas.py`), để thêm schema mới mà vi phạm quy tắc thì biết ngay.

### 2.4. Vai trò và giá trị mặc định

Mở rộng `LlmRole` trong `app/schemas/llm_call.py`:

| Vai trò | Kiểu | Timeout mặc định | Ghi chú |
|---|---|---|---|
| `A3_blueprint` | structured | 90s | Người dùng chờ ở trang 4, có tiến trình |
| `A4_intent` | structured | 3s | Model nhỏ; quá giờ thì coi như `ANSWER` (quyết định ở BE-6) |
| `A5_turn_planner` | structured | 8s | Quá giờ thì dùng seed question |
| `A6_speaker` | stream | chữ đầu 5s, tổng 30s | |

Đây là **mốc báo lỗi**, không phải mục tiêu độ trễ. Chỉnh sau khi đo (BE-3.6, spike voice).

### 2.5. Tích hợp nhiều loại model (trả phí và tự serving)

**Nguyên tắc:** `domain/` và các vai trò **không bao giờ** rẽ nhánh theo kiểu "model trả phí hay tự serving". Mọi khác biệt nằm ở **cấu hình endpoint**. Có 3 lớp, thêm thứ mới thì sửa lớp thấp nhất có thể:

| Lớp | Là gì | Thêm mới khi | Tốn gì |
|---|---|---|---|
| `kind` (adapter) | Giao thức API: `openai_compat`, `gemini`, `fake` | Gặp API không tương thích OpenAI (vd: Anthropic) | Viết code adapter |
| `endpoint` | Một nơi cụ thể: URL + khóa + **đặc tính** | Thêm nhà cung cấp / server mới nói được giao thức đã có | Sửa `llm.yaml` |
| `roles` | Vai trò nào dùng endpoint + model nào | Đổi model cho một vai trò | Sửa `llm.yaml` |

**Thêm một loại model cần gì:**

| Loại | Ví dụ | Cách thêm |
|---|---|---|
| API trả phí tương thích OpenAI | OpenAI, OpenRouter, DeepSeek, Groq | Cấu hình |
| Tự serving trên cloud | Modal (vLLM / SGLang), RunPod | Cấu hình (+ code serving ở `serving/`) |
| Chạy trên máy mình | Ollama, LM Studio, vLLM local | Cấu hình |
| API trả phí riêng | Gemini (đã có adapter), Anthropic (sau) | Adapter mới |

"Tương thích OpenAI" mỗi nơi một khác (có nơi không có JSON Schema, không báo token khi stream…), nên mỗi endpoint khai báo **đặc tính**, không đoán:

```yaml
endpoints:
  <tên>:
    kind: openai_compat
    base_url: ...
    api_key_env: ...               # hoặc headers_env: {Header-Name: ENV_NAME}
    structured_output: json_schema # json_schema | json_object | none
    strict_schema: true            # chỉ OpenAI có "strict"
    stream_usage: true             # có báo token ở mẩu stream cuối không
    scales_to_zero: false          # true: warmup() có tác dụng, timeout kết nối dài hơn
    max_context_tokens: 128000     # chặn trước request quá dài thay vì đợi lỗi
    billing: per_token             # per_token | gpu_time | free
    price_per_mtok: { input: 0.0, output: 0.0 }   # tùy chọn, chỉ cho per_token
```

- **`structured_output`:**
  - `json_schema`: gửi schema qua `response_format`, server ép đúng schema.
  - `json_object`: server chỉ hỗ trợ "trả JSON"; adapter đưa JSON Schema vào cuối system prompt. Pydantic vẫn validate, sai thì retry như mọi khi.
  - `none`: endpoint chỉ dùng được cho vai trò stream (A6). Gán vai trò structured cho nó thì app **không khởi động**, báo rõ.
- **`billing` + `price_per_mtok`:** `llm_calls` ghi thêm `billing` và `est_cost_usd` (khi có giá) để so sánh chi phí giữa các nơi. Với `gpu_time` (Modal) không chia được tiền cho từng lời gọi: chỉ ghi token và thời gian, chi phí thật đọc từ hóa đơn Modal (BE-3.6 ghi cách ước tính).
- **Giá trị mặc định theo `kind`:** endpoint OpenAI không cần khai báo gì thêm; chỉ endpoint khác thường mới phải ghi đặc tính.

**Bộ kiểm tra chung cho mọi endpoint (`llm_check`, làm ở BE-3.4):** một endpoint mới chỉ được gán cho vai trò sau khi qua bộ kiểm tra này. Cùng một bộ cho OpenAI, Gemini, Modal hay bất kỳ nơi nào:

1. Khóa sai → lỗi `auth` (không phải lỗi lạ).
2. Structured output với **mọi schema đã đăng ký** (dùng dữ liệu mẫu tiếng Việt): tỉ lệ đúng ngay lần đầu, số lần phải retry.
3. Stream tiếng Việt: thời gian tới chữ đầu tiên, tổng thời gian, có nhận được usage không.
4. Hủy giữa chừng: kết nối được đóng.

Kết quả in thành bảng, lưu được ra file (`--out`) để so sánh các endpoint với nhau. Test tự động (`tests/test_llm_contract.py`) chạy cùng các bước 2–4 trên adapter `fake` và trên HTTP giả của từng `kind`, để adapter mới phải đạt cùng một hợp đồng.

---

## 3. Các task

### BE-3.1. Interface, adapter fake, `LlmService`

**Việc:**
- `app/providers/llm/base.py`: mọi thứ ở mục 2.1.
- `app/providers/llm/fake.py`: `FakeLlm` có kịch bản lập trình được, dùng trong test:
  - Trả output cố định theo schema (đăng ký theo class schema), hoặc chuỗi output theo thứ tự (vd: lần 1 sai schema, lần 2 đúng).
  - Stream một đoạn chữ cố định thành nhiều mẩu.
  - Giả lập chậm (để thử timeout), lỗi (`LlmError`), treo (để thử hủy).
  - Ghi lại các request đã nhận, để test kiểm tra prompt gửi đi.
  - Chạy dev không có key: trả output hợp lệ tối thiểu cho mỗi schema đã đăng ký (giống `EXTRACTOR_PROVIDER=fake`).
- `app/domain/llm.py`: `LlmService` (mục 2.2). Ở task này chọn provider theo một dict truyền vào khi tạo; `llm.yaml` làm ở BE-3.2. Ghi `llm_calls` qua một hàm truyền vào (BE-3.2 nối với DB thật).

**Output:** `base.py`, `fake.py`, `domain/llm.py`, `tests/test_llm_service.py`.

**Test bắt buộc:**
- Output đúng schema → trả object Pydantic.
- Lần 1 JSON hỏng, lần 2 đúng → thành công, `retries=1`, request lần 2 có lượt chứa lỗi validate.
- Sai 3 lần → `LlmError("bad_output")`, ghi 1 bản ghi `error`.
- Quá timeout → `LlmError("timeout")`, bản ghi `timeout`.
- Hủy task đang chờ → `CancelledError` lan ra ngoài, bản ghi `cancelled`.
- Stream: nhận đủ chữ theo thứ tự; lỗi trước chữ đầu tiên thì retry; lỗi sau chữ đầu tiên thì báo lỗi, không retry.
- Người dùng ngừng đọc stream giữa chừng (đóng async generator) → provider bị đóng, bản ghi `cancelled` kèm phần chữ đã có.

**Xong khi:** test trên qua; `domain/llm.py` không import SDK nào.

---

### BE-3.2. Cấu hình theo vai trò, bản chụp, mở rộng `llm_calls`

**Việc:**
- Thêm thư viện `pyyaml` (rubric MVP-2 cũng dùng YAML).
- `backend/llm.example.yaml` (commit) và `backend/llm.yaml` (gitignore, giống `.env`). `Settings.llm_config_path` (mặc định `llm.yaml`). **Không có file** thì mọi vai trò dùng `fake`, log cảnh báo một lần; `APP_ENV=prod` mà không có file thì không khởi động.

```yaml
endpoints:
  openai:
    kind: openai_compat
    api_key_env: OPENAI_API_KEY
  modal-qwen:
    kind: openai_compat
    base_url: https://<workspace>--<app>.modal.run/v1
    api_key_env: MODAL_LLM_API_KEY
    strict_schema: false        # vLLM: no OpenAI "strict" mode
    scales_to_zero: true        # warmup() does something; longer connect timeout
    billing: gpu_time           # full list of endpoint traits: section 2.5
  gemini:
    kind: gemini
    api_key_env: GEMINI_API_KEY

default: { endpoint: openai, model: <model> }
roles:
  A3_blueprint:    { endpoint: modal-qwen, model: <model đã deploy> }
  A4_intent:       { endpoint: openai, model: <model nhỏ>, timeout_s: 3 }
  A6_speaker:      { endpoint: gemini, model: <model>, temperature: 0.7 }
```

- Validate bằng Pydantic khi khởi động: endpoint được tham chiếu phải tồn tại, biến môi trường chứa key phải có giá trị, vai trò structured không được gán cho endpoint `structured_output: none` (mục 2.5). Sai thì không khởi động, báo rõ chỗ sai (đường dẫn trong file, vd `roles.A5_turn_planner.endpoint`; YAML không cho số dòng sau khi parse).
- **Đã làm (BE-3.2):** chỉ endpoint **đang được vai trò nào dùng** mới cần key và mới được tạo client, để file mẫu khai báo sẵn Gemini/Modal mà chưa có key vẫn chạy được. Key đọc từ biến môi trường và `.env` (`Settings.env()`, biến môi trường thật thắng). Trường lạ (gõ sai tên) bị từ chối. Endpoint có `kind` chưa có adapter (hiện: `openai_compat`, `gemini`) thì không khởi động, báo rõ.
- Đặc tính endpoint (mục 2.5) có giá trị mặc định theo `kind`; `llm_calls` thêm `billing`, `est_cost_usd`.
- `app/providers/llm/__init__.py`: `create_llm_registry(config) -> dict[str, LlmProvider]`, tạo mỗi endpoint một client, dùng chung suốt đời app (tạo trong `lifespan` của `main.py`, `aclose()` khi tắt).
- **Bản chụp (D5):** `LlmService.snapshot() -> RoleSnapshot` (dict vai trò → `{endpoint, kind, model, temperature, timeout_s}`, không chứa key). Việc lưu bản chụp vào document phiên làm ở BE-6 (collection `sessions` chưa có). Bản chụp trỏ tới endpoint không còn trong cấu hình → `LlmError("unavailable")` có thông điệp rõ, domain tạm dừng phiên.
- **Mở rộng `llm_calls`** (`app/schemas/llm_call.py`, `app/db/llm_calls.py`):
  - `LlmRole` thêm 4 vai trò ở mục 2.4, `LlmCallRef.kind` thêm `"session"`: **đã làm ở BE-3.1**.
  - **Đã làm (BE-3.2):** bỏ `LlmCallLog` của BE-3.1, `LlmService` ghi thẳng `LlmCallRecord`. Thêm `transient_retries`, `first_token_ms`; `output_schema_version` của A3–A6 là tên class schema, stream thì `None`. `RoleSettings` chuyển sang `app/schemas/llm_config.py` (cả `providers/` và `domain/` cùng dùng). `llm_calls.list_for_ref()` để đọc lại theo CV / JD / phiên.
  - Thêm `endpoint` (tên trong `llm.yaml`), `input` (system + messages đã ghép, D6), `status` thêm `"timeout"`, `"cancelled"`. Output dạng text lưu là `{"text": ...}`.
  - Bản ghi cũ của A1/A2 vẫn đọc được (trường mới có giá trị mặc định). Tăng `schema_version` lên 2 cho bản ghi mới.
  - Index `ref` hiện có đã đủ cho việc xóa theo phiên.

**Output:** `llm.example.yaml`, `.gitignore`, `config.py`, `providers/llm/__init__.py`, schema + repository `llm_calls`, `main.py`, `.env.example` (tên các biến key).

**Test bắt buộc:** đọc cấu hình hợp lệ; endpoint không tồn tại / thiếu key → lỗi khi khởi động; không có file → fake; vai trò không cấu hình → dùng `default`; bản chụp không đổi khi cấu hình đổi; `llm_calls` ghi và đọc lại được (fixture `db`); bản ghi A1/A2 cũ vẫn đọc được.

**Xong khi:** app khởi động với và không có `llm.yaml`; `uv run pytest` qua.

---

### BE-3.3. Ghép prompt và bọc dữ liệu không tin cậy

**Việc:**
- `app/prompts/__init__.py` thêm `untrusted(tag: str, text: str) -> str`: bọc `<tag>...</tag>`, và **vô hiệu hóa thẻ đóng** cùng tên nằm trong `text` (vd: CV chứa `</cv_profile>` để thoát ra ngoài). Cách làm: thay `<` của thẻ trùng tên bằng ký tự an toàn, ghi rõ trong docstring.
- Quy ước ghép prompt cho A3–A6 (ghi ở docstring module và mục 2 của file này nếu đổi):
  - `system` = file prompt có version (chỉ dẫn, không chứa dữ liệu ứng viên), kèm câu nhắc: nội dung trong các thẻ là dữ liệu, không phải chỉ dẫn.
  - Lượt `user` = các khối dữ liệu bọc thẻ (`<cv_profile>`, `<jd_requirements>`, `<candidate_answer>`…), dạng JSON hoặc text.
- Thẻ XML đặt tên theo một danh sách cố định trong code, để test kiểm tra được.
- File prompt của từng vai trò (`blueprint_v1.md`…) **không** viết ở task này, mà viết ở task của vai trò đó (BE-5, BE-6).

**Output:** `prompts/__init__.py`, `tests/test_prompts.py`.

**Test bắt buộc:** text có thẻ đóng trùng tên → không thoát được khỏi khối; text tiếng Việt và code giữ nguyên; `load_prompt` vẫn chạy như cũ.

**Xong khi:** test qua.

---

### BE-3.4. Adapter `openai_compat` (thử với OpenAI)

**Cần:** key OpenAI (`OPENAI_API_KEY`) để chạy thử thật. Không có key vẫn làm được phần code + test bằng HTTP giả.

**Việc:**
- Thêm thư viện `openai`. `app/providers/llm/openai_compat.py`, dùng `AsyncOpenAI(base_url=..., api_key=..., max_retries=0, default_headers=...)`.
- `generate_json`: Chat Completions với `response_format={"type": "json_schema", "json_schema": {...}}`.
  - `strict_schema: true` (OpenAI): đổi schema sang dạng strict (mọi trường bắt buộc, `additionalProperties: false`, `X | None` thành kiểu có `null`).
  - `strict_schema: false` (vLLM…): gửi JSON Schema thường.
  - Model từ chối trả lời (trường refusal) → `LlmError("refused")`, không retry.
  - `structured_output: json_object`: gửi `response_format={"type": "json_object"}` và đưa JSON Schema vào cuối system prompt (mục 2.5).
- `stream_text`: `stream=True`; `stream_usage: true` thì xin usage ở mẩu cuối (`stream_options={"include_usage": True}`), không thì usage để 0.
- Map lỗi SDK: 401/403 → `auth`; 429 → `rate_limited`; 5xx, mất kết nối → `unavailable`; quá giờ → `timeout`; 400 → `bad_request` (không retry).
- Tham số khác nhau giữa các model (vd: tên tham số giới hạn token, model không nhận `temperature`): xử lý bằng cờ trong cấu hình endpoint/vai trò khi gặp, không đoán trước.
- `to_provider_schema` cho cả hai chế độ strict / không strict (mục 2.3).
- `max_context_tokens`: ước lượng độ dài request (đếm thô theo ký tự, không cần tokenizer), vượt thì `LlmError("bad_request")` trước khi gửi.
- **Bộ kiểm tra chung** `uv run python -m app.scripts.llm_check --endpoint <tên> [--out file.json]` (mục 2.5): khóa sai, structured với mọi schema đã đăng ký, stream tiếng Việt, hủy giữa chừng; in bảng độ trễ, token, tỉ lệ đúng schema.
- `tests/test_llm_contract.py`: cùng hợp đồng chạy trên `fake` và HTTP giả của `openai_compat` (BE-3.7 thêm `gemini`).

**Output:** `openai_compat.py`, `app/scripts/llm_check.py`, test.

**Test bắt buộc:**
- Bằng HTTP giả (`httpx.MockTransport` truyền vào `AsyncOpenAI`): request gửi đúng `response_format` ở cả hai chế độ; parse output; stream nhiều mẩu + usage; map đúng từng mã lỗi; header tùy chỉnh được gửi đi.
- `llm_live` (mặc định bỏ qua): gọi OpenAI thật một lần structured, một lần stream.

**Xong khi:** test qua; `llm_check` chạy được với OpenAI thật (nếu có key), ghi kết quả vào mục "Đã xong" ở `backend.md`.

---

### BE-3.5. Serving model trên Modal

**Cần:** tài khoản Modal (`modal token new`), ngân sách GPU. Không phụ thuộc task nào của backend, làm song song được từ đầu.

**Việc:**
- Dự án con `serving/modal/` ở gốc repo (ngoài `backend/`), có `pyproject.toml` riêng (thư viện `modal`), quản lý bằng `uv`. Backend không import gì từ đây.
- **Chọn model** và ghi lý do vào `serving/modal/README.md`. Tiêu chí:
  1. Tiếng Việt tốt (lời của A6 Speaker là tiếng Việt, văn nói).
  2. Làm theo JSON Schema ổn định (A3, A4, A5 dùng structured output).
  3. Vừa GPU dự định (kích thước weight + bộ nhớ cho ngữ cảnh dài cỡ CV + JD + transcript).
  4. Giấy phép cho phép dùng.

  Thử nhanh 1–2 ứng viên trước khi chốt (gọi tay vài prompt tiếng Việt + một schema mẫu).
- `serving/modal/llm_server.py`: Modal app chạy vLLM với API tương thích OpenAI, theo ví dụ vLLM chính thức của Modal (kiểm tra tên tham số theo phiên bản Modal SDK đang dùng):
  - **GPU** và **image** (vLLM ghim version cụ thể).
  - **Weight trong Modal Volume:** tải một lần, lần khởi động sau đọc từ Volume. Cache biên dịch của vLLM cũng để trong Volume. Đây là cách chính để giảm cold start.
  - **Khóa:** vLLM chạy với `--api-key` lấy từ Modal Secret, mọi request thiếu khóa bị từ chối. Không để endpoint mở.
  - **Structured output** bật được qua `response_format` JSON Schema (kiểm tra bằng request thử).
  - **Scale:** thời gian chờ trước khi tắt container khi không có request (scaledown), số container chạy sẵn tối thiểu (mặc định 0), số request đồng thời mỗi container. Mọi giá trị là hằng số ở đầu file, có comment ảnh hưởng chi phí.
  - **Region** gần người dùng (Việt Nam / châu Á) nếu gói Modal cho phép.
  - Tên model, độ dài ngữ cảnh tối đa, phần trăm bộ nhớ GPU: hằng số ở đầu file.
- **Không log nội dung request** phía server (tắt log request của vLLM), vì request chứa CV và câu trả lời.
- `serving/modal/README.md`: cách tạo Secret, `modal deploy`, lấy URL, thử bằng `curl`, cách tắt hẳn (`modal app stop`), ước tính chi phí theo giờ GPU.
- `serving/modal/smoke.py`: gọi endpoint bằng thư viện `openai` (một câu stream tiếng Việt + một structured output với schema mẫu), in thời gian.

**Output:** `serving/modal/` (`pyproject.toml`, `llm_server.py`, `smoke.py`, `README.md`).

**Kiểm tra bắt buộc:**
- Request không có khóa / sai khóa → 401.
- `GET /v1/models` trả đúng tên model.
- `smoke.py` chạy được: stream ra chữ tiếng Việt; structured output trả JSON đúng schema mẫu.
- Để container tắt hẳn rồi gọi lại: thành công (chỉ chậm), weight không tải lại từ Hugging Face.

**Xong khi:** kiểm tra trên qua; URL và tên Secret ghi trong README (không ghi khóa); `CLAUDE.md` mục "Cấu trúc thư mục" có `serving/` (sửa ở BE-3.7).

---

### BE-3.6. Nối backend với Modal: khóa, warmup, đo đạc

**Cần:** BE-3.4 (adapter `openai_compat`) và BE-3.5 (endpoint Modal có khóa).

**Việc:**
- Thêm endpoint `modal-...` vào `llm.yaml` (dùng adapter của BE-3.4). Khóa qua `api_key_env`, hoặc `headers_env: {Header-Name: ENV_NAME}` nếu dùng proxy auth của Modal (thêm hỗ trợ `headers_env` vào cấu hình nếu chưa có).
- `warmup()` cho endpoint `scales_to_zero: true`: gửi một request rẻ (`GET /v1/models`, hoặc chat 1 token nếu `/models` không làm container khởi động), timeout dài (vd: 300s), chạy nền, không báo lỗi lên người dùng. Gọi nhiều lần liên tiếp chỉ chạy một lần.
- Lời gọi thật tới endpoint `scales_to_zero` dùng timeout kết nối dài hơn, nhưng vẫn trong timeout của vai trò.
- **Đo và ghi vào `docs/spikes/llm-modal.md`:**
  - Cold start: thời gian từ request đầu tới khi có trả lời, sau khi container tắt hẳn.
  - Khi nóng: thời gian tới chữ đầu tiên (TTFT) và tổng thời gian, với prompt cỡ A5 và A6.
  - Tỉ lệ trả đúng schema ngay lần đầu, trên 20–30 lần gọi với schema mẫu (trước khi có schema thật của A3/A5).
  - Chất lượng tiếng Việt của lời nói (đọc tay vài mẫu), so với OpenAI/Gemini cùng prompt.
  - Chi phí ước tính theo giây GPU.
- **Kết luận trong file spike:** Modal dùng được cho vai trò nào (đối chiếu mục tiêu ~1,5s ở `agents.md` mục 5), có cần giữ container chạy sẵn không.

**Output:** cấu hình mẫu cho Modal trong `llm.example.yaml`, `warmup()`, `docs/spikes/llm-modal.md`.

**Test bắt buộc:** `warmup()` gọi đúng một request dù được gọi nhiều lần cùng lúc; endpoint không `scales_to_zero` thì `warmup()` không gọi gì; `headers_env` được gửi.

**Xong khi:** có file spike với số đo và kết luận; người dùng đã đọc và chốt vai trò nào dùng Modal.

---

### BE-3.7. Adapter `gemini` và cập nhật tài liệu

**Cần:** key Gemini (`GEMINI_API_KEY`).

**Việc:**
- Thêm thư viện `google-genai`. `app/providers/llm/gemini.py`: structured output native (`response_mime_type="application/json"` + schema), stream, map lỗi như BE-3.4. Kiểm tra trong tài liệu SDK phiên bản đang dùng nên truyền schema qua tham số nào (SDK có hơn một cách), ghi lựa chọn vào docstring.
- `to_provider_schema` cho Gemini; test ở mục 2.3 phủ thêm Gemini.
- `llm_check --endpoint gemini` chạy được.
- **Cập nhật tài liệu** (sau khi người dùng chốt D1–D8):
  - `CLAUDE.md`: mục "Đa provider LLM" (OpenAI-compatible gồm OpenAI và Modal/vLLM, Gemini; Anthropic thêm sau; cấu hình `llm.yaml`); mục "Quy ước" (model mặc định không còn là `claude-opus-5-5` khi chưa có adapter Anthropic; cấu hình theo vai trò qua `llm.yaml` thay cho `LLM_PROVIDER` / `LLM_MODEL`); mục "Trạng thái hiện tại"; mục "Cấu trúc thư mục" thêm `serving/` (code serving model tự host, hiện có `modal/`).
  - `backend/README.md`: cách cấu hình `llm.yaml`, chạy `llm_check`, chạy test `llm_live`.
  - `docs/design/agents.md` mục 1.4 và 6: bản chụp cấu hình theo phiên, `llm_calls` lưu input.

**Output:** `gemini.py`, test, tài liệu.

**Test bắt buộc:** như BE-3.4 (HTTP giả + `llm_live`).

**Xong khi:** test qua; tài liệu không còn nhắc `LLM_PROVIDER` / `LLM_MODEL` như cách cấu hình duy nhất.

---

## 4. Chưa làm ở BE-3 (để không làm thừa)

- Adapter Anthropic; vòng lặp tool cho agent (A8, A9); embedding.
- Tự đổi sang endpoint khác khi lỗi (D4).
- Prompt cache, batch API: thêm khi có số liệu dùng thật. Chi phí chỉ ước tính từ `price_per_mtok` trong cấu hình (mục 2.5), không tự cập nhật bảng giá.
- Lưu bản chụp vào phiên và gọi `warmup()` từ API: làm ở BE-5 / BE-6, nơi có phiên và trang 4.
