import { Check } from 'lucide-react'
import { Fragment } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

export type Step = {
  label: string
  /** Where a finished step goes back to. Steps without it (and steps not reached yet) are not clickable. */
  href?: string
}

/** Labels of the session setup flow: pages [2] → [3] → [4] (docs/design/ui-pages.md §1). */
export const SESSION_STEPS = ['Chọn CV & JD', 'Đối chiếu', 'Kế hoạch'] as const

/**
 * Step bar: "① Chọn CV & JD ── ② Đối chiếu ── ③ Kế hoạch".
 * Done steps are ok + check and link back; the current step is accent; later steps are ink2.
 * Below `sm` it collapses to "Bước 2/3 · Đối chiếu".
 *
 * `current` is 0-based.
 */
export function Stepper({
  steps,
  current,
  className,
}: {
  steps: Step[]
  current: number
  className?: string
}) {
  const total = steps.length
  return (
    <nav aria-label="Các bước tạo phiên" className={className}>
      <p className="text-sm text-ink2 sm:hidden">
        Bước {current + 1}/{total} ·{' '}
        <span className="font-semibold text-ink">{steps[current]?.label}</span>
      </p>
      <ol className="hidden items-center gap-3 sm:flex">
        {steps.map((step, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo'
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
                  state === 'done' && 'bg-ok text-surface',
                  state === 'current' && 'bg-accent text-surface',
                  state === 'todo' && 'border border-line text-ink2',
                )}
              >
                {state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span>{step.label}</span>
              {state === 'done' && <span className="sr-only"> (đã xong)</span>}
            </>
          )
          const base = 'flex items-center gap-2 whitespace-nowrap text-sm'
          return (
            <Fragment key={step.label}>
              {i > 0 && (
                <li
                  aria-hidden="true"
                  className={cn('h-px min-w-6 flex-1', i <= current ? 'bg-ok' : 'bg-line')}
                />
              )}
              <li>
                {state === 'done' && step.href ? (
                  <Link
                    to={step.href}
                    className={cn(
                      base,
                      '-mx-1 rounded-md px-1 py-0.5 text-ok hover:bg-ok-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
                    )}
                  >
                    {content}
                  </Link>
                ) : (
                  <span
                    aria-current={state === 'current' ? 'step' : undefined}
                    className={cn(
                      base,
                      state === 'done' && 'text-ok',
                      state === 'current' && 'font-semibold text-accent',
                      state === 'todo' && 'text-ink2',
                    )}
                  >
                    {content}
                  </span>
                )}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
