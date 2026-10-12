import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const VARIANTS = {
  required: { className: 'bg-accent-soft text-accent', label: 'Bắt buộc' },
  preferred: { className: 'bg-subtle text-ink2', label: 'Nên có' },
  saved: { className: 'bg-ok-soft text-ok', label: 'Đã lưu' },
  unplanned: { className: 'bg-ai-soft text-ai', label: 'Ngoài kế hoạch' },
} as const

export type BadgeVariant = keyof typeof VARIANTS

export function Badge({
  variant,
  children,
  className,
}: {
  variant: BadgeVariant
  children?: ReactNode
  className?: string
}) {
  const v = VARIANTS[variant]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        v.className,
        className,
      )}
    >
      {children ?? v.label}
    </span>
  )
}
