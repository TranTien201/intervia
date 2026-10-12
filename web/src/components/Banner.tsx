import { AlertCircle, Info, TriangleAlert, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const VARIANT = {
  info: { box: 'bg-accent-soft text-accent-strong', Icon: Info },
  warning: { box: 'bg-amber-soft text-amber', Icon: TriangleAlert },
  error: { box: 'bg-danger-soft text-danger', Icon: AlertCircle },
} as const

/**
 * Full-width notice at the top of a page or the interview column
 * ("Đã khôi phục phiên", "Mất kết nối, đang kết nối lại…", "Mic không dùng được").
 * Dismissible when `onDismiss` is given; the parent owns the visible state.
 */
export function Banner({
  variant = 'info',
  title,
  children,
  action,
  onDismiss,
  className,
}: {
  variant?: keyof typeof VARIANT
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  onDismiss?: () => void
  className?: string
}) {
  const { box, Icon } = VARIANT[variant]
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-xl px-4 py-3 text-sm', box, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="grid flex-1 gap-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-ink">{children}</div>}
        {action && <div className="mt-1">{action}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Đóng thông báo"
          className="-m-1 rounded-md p-1 opacity-70 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
