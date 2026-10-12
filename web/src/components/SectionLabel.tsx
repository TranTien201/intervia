import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Uppercase 12/600 label: "HỒ SƠ CỦA BẠN", "YÊU CẦU CỦA JD". */
export function SectionLabel({
  className,
  as: Tag = 'h2',
  ...props
}: ComponentProps<'h2'> & { as?: 'h2' | 'h3' | 'p' }) {
  return <Tag className={cn('label-caps text-ink2', className)} {...props} />
}
