import type { UseQueryResult } from '@tanstack/react-query'
import { AlertCircle, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { isNotFound, NetworkError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

/** Grey placeholder block. Matches the subtle background used by tags and empty bars. */
function Bone({ className }: { className?: string }) {
  return <Skeleton className={cn('bg-subtle', className)} />
}

/**
 * Grey placeholder shaped like the content about to appear, so the page does not jump.
 * - `list`: rows of a list (home, library, sidebar-like lists)
 * - `detail`: a title then two side-by-side cards (match page, CV/JD detail)
 * - `transcript`: alternating question / answer blocks (review, interview restore)
 */
export function PageSkeleton({
  variant = 'list',
  rows = 4,
}: {
  variant?: 'list' | 'detail' | 'transcript'
  rows?: number
}) {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Đang tải">
      <span className="sr-only">Đang tải…</span>
      <Bone className="h-8 w-1/3" />
      {variant === 'list' &&
        Array.from({ length: rows }, (_, i) => <Bone key={i} className="h-14 w-full" />)}
      {variant === 'detail' && (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((col) => (
            <div key={col} className="grid gap-3 rounded-xl border border-line p-4">
              <Bone className="h-3 w-1/4" />
              {Array.from({ length: rows }, (_, i) => (
                <Bone key={i} className={cn('h-4', i % 2 ? 'w-2/3' : 'w-5/6')} />
              ))}
            </div>
          ))}
        </div>
      )}
      {variant === 'transcript' &&
        Array.from({ length: rows }, (_, i) => (
          <div key={i} className="grid gap-2 py-2">
            <Bone className="h-3 w-40" />
            <Bone className="h-5 w-4/5" />
            <Bone className="h-4 w-3/5" />
          </div>
        ))}
    </div>
  )
}

/** Nothing to show yet: say so in plain words and offer the next step. */
export function EmptyState({
  title,
  message,
  action,
}: {
  title?: ReactNode
  message: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="grid justify-items-start gap-3 rounded-xl border border-dashed border-line px-6 py-10">
      {title && <p className="font-semibold text-ink">{title}</p>}
      <p className="text-ink2">{message}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

export function ErrorState({
  error,
  onRetry,
  notFoundMessage,
}: {
  error: unknown
  onRetry?: () => void
  notFoundMessage?: string
}) {
  const network = error instanceof NetworkError
  const title = network
    ? 'Không kết nối được máy chủ Intervia.'
    : isNotFound(error) && notFoundMessage
      ? notFoundMessage
      : errorMessage(error)
  const hint = network
    ? 'Kiểm tra backend đã chạy chưa, rồi thử lại.'
    : isNotFound(error)
      ? null
      : 'Bấm "Thử lại". Nếu vẫn lỗi, kiểm tra log của backend.'
  const Icon = network ? WifiOff : AlertCircle
  return (
    <div
      role="alert"
      className="grid justify-items-start gap-3 rounded-xl bg-danger-soft px-6 py-6 text-danger"
    >
      <div className="flex items-center gap-2 font-semibold">
        <Icon className="size-5" /> {title}
      </div>
      {hint && <p className="text-sm text-ink2">{hint}</p>}
      {onRetry && !isNotFound(error) && (
        <Button variant="secondary" onClick={onRetry}>
          Thử lại
        </Button>
      )}
    </div>
  )
}

/**
 * Wrap a query and render exactly one of the 4 required page states:
 * loading, error, empty, data (docs/design/ui-pages.md §2).
 */
export function QueryView<T>({
  query,
  isEmpty,
  empty,
  loading,
  notFoundMessage,
  children,
}: {
  query: UseQueryResult<T>
  isEmpty?: (data: T) => boolean
  empty?: ReactNode
  /** Defaults to a list skeleton; pass a `PageSkeleton` shaped like the page. */
  loading?: ReactNode
  notFoundMessage?: string
  children: (data: T) => ReactNode
}) {
  if (query.isPending) return <>{loading ?? <PageSkeleton />}</>
  if (query.isError)
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        notFoundMessage={notFoundMessage}
      />
    )
  if (isEmpty?.(query.data)) return <>{empty}</>
  return <>{children(query.data)}</>
}
