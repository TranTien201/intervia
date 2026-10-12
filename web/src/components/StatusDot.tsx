import type { SessionStatus } from '@/api/types'
import { cn } from '@/lib/utils'

const STATUS: Record<SessionStatus, { dot: string; label: string }> = {
  draft: { dot: 'bg-subtle ring-1 ring-line', label: 'Chưa bắt đầu' },
  in_progress: { dot: 'bg-amber', label: 'Đang dở' },
  completed: { dot: 'bg-ok', label: 'Đã xong' },
}

/** Session status dot. The text is always available to screen readers; `showLabel` shows it too. */
export function StatusDot({
  status,
  showLabel = false,
  className,
}: {
  status: SessionStatus
  showLabel?: boolean
  className?: string
}) {
  const s = STATUS[status]
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', s.dot)} />
      <span className={showLabel ? 'text-sm text-ink2' : 'sr-only'}>{s.label}</span>
    </span>
  )
}
