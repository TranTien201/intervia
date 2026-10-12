import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { CompetencyRef, SessionEndSummary } from '@/api/types'
import { NotAssessed } from '@/components/NotAssessed'
import { Button } from '@/components/ui/button'
import { durationLabel } from '@/lib/format'

/**
 * Replaces the bottom bar once the session is over (stopped or `session_ended`):
 * question count, time, what was asked, what was not assessed, links out.
 * "Chưa đánh giá" is not weak, so it stays neutral (never red).
 */
export function SessionEndBlock({
  sessionId,
  summary,
}: {
  sessionId: string
  summary: SessionEndSummary
}) {
  const titleId = useId()
  const ref = useRef<HTMLElement>(null)
  // The bar the candidate was using is gone: move focus here so it is not lost.
  useEffect(() => ref.current?.focus(), [])

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      className="grid gap-2 rounded-lg focus-visible:outline-none"
    >
      <p id={titleId} className="font-semibold text-ink">
        Buổi phỏng vấn đã kết thúc · {summary.question_count} câu ·{' '}
        {durationLabel(summary.duration_seconds)}
      </p>
      <CompetencyLine label="Đã hỏi" items={summary.assessed} />
      {summary.not_assessed.length > 0 && (
        <CompetencyLine
          label={<NotAssessed className="not-italic" />}
          items={summary.not_assessed}
        />
      )}
      <div className="mt-1 flex flex-wrap justify-end gap-2">
        <Button asChild variant="secondary">
          <Link to="/">Về danh sách</Link>
        </Button>
        <Button asChild>
          <Link to={`/sessions/${sessionId}/review`}>Xem lại phiên →</Link>
        </Button>
      </div>
    </section>
  )
}

function CompetencyLine({ label, items }: { label: ReactNode; items: CompetencyRef[] }) {
  return (
    <p className="text-sm text-ink2">
      {label}:{' '}
      <span className="text-ink">
        {items.length > 0 ? items.map((c) => c.name).join(' · ') : 'chưa có'}
      </span>
    </p>
  )
}
