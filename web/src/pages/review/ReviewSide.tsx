import { ChevronDown } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useCoverage, useTranscript } from '@/api/hooks'
import type { Coverage } from '@/api/types'
import { NotAssessed } from '@/components/NotAssessed'
import { ErrorState } from '@/components/PageStates'
import { SectionLabel } from '@/components/SectionLabel'
import { WeightBar } from '@/components/WeightBar'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { questionAnchor } from './transcript-blocks'
import { useActiveQuestion } from './use-active-question'

/**
 * Side column of the Transcript tab (UI-7.3): coverage per competency and a jump list of the
 * questions. Sticky next to the transcript on wide screens; on phones it sits above the
 * transcript and starts collapsed.
 */
export function ReviewSide({ sessionId, className }: { sessionId: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  return (
    <aside
      aria-label="Độ phủ và danh sách câu"
      className={cn(
        'rounded-xl border border-line bg-surface lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:border-0 lg:bg-transparent',
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left font-semibold text-ink outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 lg:hidden"
      >
        Độ phủ và danh sách câu
        <ChevronDown
          className={cn('size-4 text-ink2 transition-transform', open && 'rotate-180')}
        />
      </button>
      <div id={bodyId} className={cn('gap-6 px-4 pb-4 lg:grid lg:p-0', open ? 'grid' : 'hidden')}>
        <CoverageList sessionId={sessionId} />
        <JumpList sessionId={sessionId} />
      </div>
    </aside>
  )
}

function CoverageList({ sessionId }: { sessionId: string }) {
  const query = useCoverage(sessionId)
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="grid gap-3">
      <SectionLabel as="h2" id={titleId}>
        Độ phủ
      </SectionLabel>
      {query.isPending ? (
        <div className="grid gap-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <p className="text-sm text-ink2">Phiên này không có kế hoạch competency.</p>
      ) : (
        <ul className="grid gap-3">
          {query.data.map((c) => (
            <CoverageRow key={c.competency.id} item={c} />
          ))}
        </ul>
      )}
    </section>
  )
}

function CoverageRow({ item: c }: { item: Coverage }) {
  const n = c.question_count
  return (
    <li className="grid gap-1">
      <span className="text-sm text-ink">{c.competency.name}</span>
      {/* Not asked is "not assessed", never weak. */}
      {n === 0 ? (
        <NotAssessed />
      ) : (
        <WeightBar
          value={c.planned > 0 ? n / c.planned : 1}
          label={`${n} câu`}
          name={c.competency.name}
        />
      )}
    </li>
  )
}

function JumpList({ sessionId }: { sessionId: string }) {
  const items = useTranscript(sessionId).data?.items
  const indices = useMemo(
    () => (items ?? []).flatMap((i) => (i.kind === 'question' ? [i.index] : [])),
    [items],
  )
  const { active, jump } = useActiveQuestion(indices)
  const titleId = useId()
  // The transcript itself shows loading and errors.
  if (indices.length === 0) return null

  return (
    <nav aria-labelledby={titleId} className="grid gap-3">
      <SectionLabel as="h2" id={titleId}>
        Nhảy tới câu
      </SectionLabel>
      <ol className="flex flex-wrap gap-1.5">
        {indices.map((i) => (
          <li key={i}>
            <a
              href={`#${questionAnchor(i)}`}
              aria-label={`Câu ${i}`}
              aria-current={active === i ? 'location' : undefined}
              onClick={(e) => {
                e.preventDefault()
                jump(i)
              }}
              className={cn(
                'grid size-9 place-items-center rounded-md border text-sm tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                active === i
                  ? 'border-accent bg-accent-soft font-semibold text-accent'
                  : 'border-line text-ink2 hover:border-ink2 hover:text-ink',
              )}
            >
              {i}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
