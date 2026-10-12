import { cn } from '@/lib/utils'

/**
 * Weight / coverage bar: "██████░░ 30%".
 * `value` is 0–1. `label` defaults to the percentage; pass e.g. "3 câu" for coverage.
 */
export function WeightBar({
  value,
  label,
  name,
  className,
}: {
  value: number
  label?: string
  /** Accessible name, e.g. the competency. */
  name?: string
  className?: string
}) {
  const clamped = Math.min(1, Math.max(0, value))
  const pct = Math.round(clamped * 100)
  const text = label ?? `${pct}%`
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="meter"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={text}
        className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-subtle"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm text-ink2 tabular-nums">{text}</span>
    </div>
  )
}
