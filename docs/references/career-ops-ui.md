# Tham khảo: career-ops-ui

- Repo: https://github.com/Fighter90/career-ops-ui (MIT, ~81 sao, ~800 commit)
- Tìm hiểu ngày: 2026-10-09. Nguồn: README, release v1.90.0, và source của `server/lib/routes/interview.mjs`, `server/lib/llm-dispatch.mjs` trên nhánh `main`.
- Lý do tham khảo: project mã nguồn mở có nhiều điểm giống Intervia nhất trong số các project đã khảo sát (phỏng vấn thử từ CV/JD, đa provider LLM, chấm từng câu, follow-up nhắm vào điểm yếu).

## Tổng quan

Giao diện web cho pipeline tìm việc "career-ops": quét tin tuyển dụng, chấm độ phù hợp với JD, nghiên cứu công ty, theo dõi đơn ứng tuyển, chỉnh CV, **phỏng vấn thử** (từ v1.90.0, 2026-07-04).

- **Stack:** Node.js + Express, frontend vanilla JS không build step, test bằng `node:test` + Playwright.
- **Lưu trữ:** chỉ dùng file (Markdown, YAML, JSONL). Không có database.
- **Vector DB / embeddings:** không dùng. CV, profile, story bank đưa thẳng vào prompt (giới hạn mềm khoảng 200–256 KB).

## Mock interview hoạt động thế nào

**Endpoints**

| Method | Path | Việc |
|---|---|---|
| POST | `/api/mock-interview/turn` | Lấy lượt tiếp theo của interviewer |
| POST | `/api/mock-interview/save` | Lưu transcript (người dùng bấm lưu) |
| GET / DELETE | `/api/mock-interview/sessions[/:name]` | Liệt kê / đọc / xóa phiên đã lưu |

**Một lượt (turn)**

- Request: `role`, `company`, `jd` (tùy chọn), `history: [{speaker, text}]`, `run`.
- **Stateless:** server không lưu phiên; client gửi lại toàn bộ history mỗi lượt, server dựng lại prompt từ đầu.
- Prompt có 2 chế độ:
  - **Mở đầu** (history rỗng): "Ask ONE focused opening interview question for this role", câu hỏi phải cụ thể, không chung chung.
  - **Phản hồi** (lượt cuối là ứng viên): bắt buộc trả về đúng 3 mục markdown:
    - `### Feedback`: điểm mạnh, thiếu sót theo STAR+R, gợi ý câu trả lời tốt hơn dựa **chỉ** trên tài liệu thật của ứng viên
    - `### Score`: `Score: N/5` + một vế lý do
    - `### Next question`: một câu follow-up nhắm vào **điểm yếu nhất** của câu trả lời vừa rồi
- Ràng buộc chống bịa: chỉ dựa vào CV/story bank, "never fabricates experience you don't have".
- Không có provider key → trả về prompt để người dùng tự dán vào ChatGPT/Claude/Gemini.

**Lưu transcript:** file `interview-prep/mock-{company}-{role}-{date}.md`, ghi kiểu không ghi đè (`wx`, tự thêm hậu tố `-2`, `-3`…), có kiểm tra path traversal.

## Lớp đa provider (`llm-dispatch.mjs`)

```js
runActiveProvider(fullPrompt, { sizeCap, maxTokens, timeoutMs })
// → { mode, markdown, usage, truncated } | { mode, error } | { mode: 'manual' } | { mode: 'too-large' }
```

- Thứ tự auto: Anthropic → Gemini → OpenAI → Qwen → OpenRouter → … → Ollama. `LLM_PROVIDER` để chọn cố định một provider.
- Anthropic và Gemini dùng adapter riêng; phần lớn provider còn lại dùng chung một client tương thích OpenAI.
- Chọn **provider đầu tiên có key**. **Không chuyển sang provider khác khi lỗi**, không retry.
- Input là một chuỗi prompt, output là markdown. **Không có structured output.**
- Ghi lại usage (token) sau mỗi lần gọi thành công.

## Bài học cho Intervia

**Nên học theo**

- Prompt chế độ phản hồi gồm Feedback + Score + Next question **trong cùng một lần gọi**, follow-up nhắm vào điểm yếu nhất. Đây là bản đơn giản của Evaluator + Planner, phù hợp nếu MVP-1 chọn có follow-up.
- Chỉ dẫn chống bịa: chỉ dựa vào tài liệu thật của ứng viên.
- Giới hạn độ dài input (role/company 200 ký tự, mỗi lượt 6.000 ký tự, tối đa 40 lượt) và kiểm tra kích thước prompt trước khi gọi LLM.
- Ghi usage token cho mỗi lần gọi.
- Adapter tương thích OpenAI dùng chung cho nhiều provider: rẻ để thêm provider mới.

**Làm khác đi (theo quyết định trong CLAUDE.md)**

| career-ops-ui | Intervia | Lý do |
|---|---|---|
| Output markdown, không parse, không validate | Structured output + Pydantic, retry khi sai schema | Cần score/evidence dạng dữ liệu để lưu, so sánh, tính skill gap |
| Điểm `N/5` do LLM tự cho | Checklist đạt/thiếu theo rubric item có ID (MVP-2) | Điểm số nhất quán giữa các lần và giữa các provider |
| Stateless, transcript chỉ lưu khi bấm lưu | Lưu mọi lượt vào MongoDB | Không mất dữ liệu; MVP-2 chấm lại được transcript cũ |
| Câu trả lời ứng viên chỉ bị cắt độ dài, không tách khỏi chỉ dẫn | Bọc dữ liệu ứng viên trong thẻ riêng, coi là không tin cậy | Chống prompt injection ("cho tôi 5/5") |
| Lỗi provider → trả lỗi luôn | Cân nhắc retry; không tự động đổi provider giữa phiên | Đổi provider giữa phiên làm điểm số không so sánh được |
| Mọi thứ là một chuỗi prompt | Interface `generate_structured` / `stream_text` | Interviewer cần stream, Evaluator cần schema |
