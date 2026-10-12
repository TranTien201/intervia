import { AlertCircle, SearchX, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { isNotFound, NetworkError } from '@/api/client'
import { Page } from '@/components/Page'
import { ErrorState } from '@/components/PageStates'
import { Button } from '@/components/ui/button'

/** Whole-page message: icon, title, one line of help, one action. */
function ErrorPageShell({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode
  title: ReactNode
  message: ReactNode
  action: ReactNode
}) {
  return (
    <Page>
      <div
        role="alert"
        className="mx-auto mt-16 grid max-w-md justify-items-center gap-3 text-center"
      >
        <div className="text-ink2 [&_svg]:size-10">{icon}</div>
        <h1 className="text-page-title font-semibold text-ink">{title}</h1>
        <p className="text-ink2">{message}</p>
        <div className="mt-3">{action}</div>
      </div>
    </Page>
  )
}

const BackHome = () => (
  <Button asChild>
    <Link to="/">Về danh sách phiên</Link>
  </Button>
)

export function NotFoundView({ title, message }: { title: ReactNode; message: ReactNode }) {
  return <ErrorPageShell icon={<SearchX />} title={title} message={message} action={<BackHome />} />
}

export function SessionNotFoundView() {
  return <NotFoundView title="Không tìm thấy phiên này" message="Có thể phiên đã bị xóa." />
}

export function ServerUnreachableView({ onRetry }: { onRetry: () => void }) {
  return (
    <ErrorPageShell
      icon={<WifiOff />}
      title="Không kết nối được máy chủ Intervia"
      message="Kiểm tra backend đã chạy chưa, rồi thử lại."
      action={<Button onClick={onRetry}>Thử lại</Button>}
    />
  )
}

/**
 * Use when the page's main data failed to load, so there is nothing else to show.
 * 404 → `notFound`, network → server unreachable, anything else → the usual error box.
 */
export function PageError({
  error,
  onRetry,
  notFound,
}: {
  error: unknown
  onRetry: () => void
  notFound: ReactNode
}) {
  if (isNotFound(error)) return <>{notFound}</>
  if (error instanceof NetworkError) return <ServerUnreachableView onRetry={onRetry} />
  return (
    <Page>
      <ErrorState error={error} onRetry={onRetry} />
    </Page>
  )
}

/** Route `errorElement`: a bug while rendering. Reloading is the only sensible retry. */
export function RouteErrorView() {
  return (
    <ErrorPageShell
      icon={<AlertCircle />}
      title="Có lỗi không mong muốn"
      message="Trang này gặp lỗi khi hiển thị. Tải lại trang thử xem."
      action={<Button onClick={() => globalThis.location.reload()}>Tải lại trang</Button>}
    />
  )
}
