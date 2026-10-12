import { NotFoundView } from '@/components/ErrorPages'

/** Unknown path. Missing sessions get `SessionNotFoundView` from `SessionGate` instead. */
export function NotFoundPage() {
  return (
    <NotFoundView
      title="Không tìm thấy trang này"
      message="Đường dẫn không đúng, hoặc dữ liệu đã bị xóa."
    />
  )
}
