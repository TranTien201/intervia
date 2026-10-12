import { cn } from '@/lib/utils'

/** "Chưa đánh giá": not asked yet, which is NOT the same as weak. Never red (ui.md §1, rule 4). */
export function NotAssessed({ className }: { className?: string }) {
  return <span className={cn('text-sm text-ink2 italic', className)}>Chưa đánh giá</span>
}
