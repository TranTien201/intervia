import { ApiError, NetworkError } from '@/api/client'

// User-facing Vietnamese messages per error code (docs/design/api.md §1).
const MESSAGES: Record<string, string> = {
  unauthenticated: 'Bạn cần đăng nhập lại.',
  // Never says which part is wrong, so it does not reveal which emails have an account.
  invalid_credentials: 'Email hoặc mật khẩu không đúng.',
  email_taken: 'Email này đã có tài khoản. Hãy đăng nhập.',
  too_many_attempts: 'Bạn đã thử sai nhiều lần. Đợi vài phút rồi thử lại.',
  validation_error: 'Dữ liệu chưa hợp lệ.',
  not_found: 'Không tìm thấy dữ liệu này. Có thể nó đã bị xóa.',
  file_too_large: 'File lớn hơn 5 MB. Hãy chọn file nhỏ hơn.',
  unsupported_file: 'Chỉ nhận file PDF hoặc DOCX.',
  no_text_in_file: 'File này là ảnh scan, không có chữ để đọc. Hãy tải bản PDF/DOCX có chữ.',
  session_locked: 'Phiên đã bắt đầu nên không đổi được đầu vào.',
  session_not_active: 'Phiên không còn đang diễn ra.',
  blueprint_not_ready: 'Kế hoạch phỏng vấn chưa tạo xong.',
  turn_in_progress: 'AI chưa trả lời xong lượt trước.',
  version_conflict: 'Đã có bản mới hơn. Tải lại trang để xem bản mới nhất.',
  llm_error: 'Dịch vụ AI đang lỗi. Bạn thử lại sau ít phút.',
  internal_error: 'Có lỗi xảy ra ở máy chủ.',
}

/** Message for an error carried in a response body (e.g. `AnalysisProgress.error`). */
export function codeMessage(error: { code: string; message: string }): string {
  return MESSAGES[error.code] ?? error.message
}

export function errorMessage(err: unknown): string {
  if (err instanceof NetworkError) return 'Không kết nối được máy chủ Intervia.'
  if (err instanceof ApiError) return MESSAGES[err.code] ?? err.message
  return 'Có lỗi không mong muốn.'
}
