import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** A framed object: surface background, line border, 12px radius, very light shadow. */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-xl border border-line bg-surface p-4 shadow-card', className)}
      {...props}
    />
  )
}
