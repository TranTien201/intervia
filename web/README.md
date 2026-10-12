# web

Web frontend của Intervia: mọi màn hình, kể cả phiên phỏng vấn voice (WebRTC qua Pipecat client).

- Chỉ gọi HTTP/WebRTC tới `backend/`, không chứa logic nghiệp vụ.
- Thiết kế: `docs/design/ui.md`, `docs/design/ui-pages.md`. Hợp đồng API: `docs/design/api.md`.
- Việc cần làm: `docs/tasks/ui.md`.

## Lệnh

Cần Node ≥ 22.22.

| Lệnh | Việc |
|---|---|
| `npm install` | Cài thư viện |
| `npm run dev:mock` | Chạy với API giả (MSW), không cần backend. Mở http://localhost:5173 |
| `npm run dev:hybrid` | API giả, trừ các nhóm backend đã làm (`VITE_REAL_API`, hiện là `auth`) đi tới backend thật. Cần chạy backend |
| `npm run dev` | Chạy với backend thật (proxy `/api` → `VITE_API_URL`, mặc định `http://localhost:8000`) |
| `npm test` | Test thành phần (Vitest + Testing Library + MSW) |
| `npm run e2e` | Test E2E (Playwright, tự bật server với API giả). Lần đầu: `npx playwright install chromium` |
| `npm run typecheck` / `lint` / `format` | Kiểm tra kiểu / lint (oxlint) / định dạng (Prettier) |
| `npm run build` | Build production vào `dist/` |
| `npm run gen:api` | Sinh type từ OpenAPI của backend vào `src/api/schema.gen.ts` (khi backend đã chạy) |

## API giả (MSW)

Bật bằng `VITE_USE_MOCK=true` (`npm run dev:mock`). Dữ liệu mẫu ở `src/mocks/seed.ts`. Dữ liệu được lưu trong `sessionStorage` nên tải lại trang vẫn giữ (để thử khôi phục phiên); đóng tab là mất.

Trong Console của trình duyệt:

```js
__mock.reset()                              // về dữ liệu mẫu
__mock.reset(true)                          // thư viện trống (lần đầu dùng)
__mock.setFlags({ network: true })          // giả lập mất kết nối máy chủ
__mock.setFlags({ analysis_fail: true })    // phân tích CV/JD lỗi LLM
__mock.setFlags({ blueprint_fail: true })   // tạo kế hoạch lỗi
__mock.setFlags({ stream_fail: true })      // lời AI đứt giữa chừng
__mock.setFlags({ latency: 0 })             // bỏ độ trễ giả lập
__mock.setFlags({ auth: true })             // bật đăng nhập (tài khoản mẫu: nguyenvana@example.com / matkhau-mau-123)
```

Tải lên file có chữ `scan` trong tên (vd: `ban-scan.pdf`) để giả lập lỗi "file scan không có chữ".

## Cấu trúc

```
src/
  app/          # router, providers, layouts
  pages/        # mỗi trang một thư mục
  features/     # logic theo nghiệp vụ dùng chung giữa các trang
  components/   # thành phần dùng chung; components/ui/ là shadcn/ui
  api/          # client, type, SSE, hook TanStack Query
  mocks/        # MSW handlers + dữ liệu mẫu
  styles/       # tokens.css (bảng màu Sương lam)
```
