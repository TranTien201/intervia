import { Link } from 'react-router'
import type { Mode, SessionSummary } from '@/api/types'
import { Button } from '@/components/ui/button'
import { sessionLabel } from '@/features/sessions/session-nav'
import { progressLabel } from '@/lib/format'
import { ModeSwitch } from './ModeSwitch'

/**
 * Top bar of page 5: "Intervia · Role · Level · Câu 4/~12", mode switch, "Dừng".
 * Once the session is over, the mode switch locks and "Dừng" goes away.
 */
export function InterviewTopBar({
  session,
  progress,
  mode,
  onModeChange,
  availableModes,
  ended,
  onStop,
}: {
  session: SessionSummary
  /** Latest from the `progress` event, else the session's. */
  progress: SessionSummary['progress']
  mode: Mode
  onModeChange: (mode: Mode) => void
  availableModes: readonly Mode[]
  ended: boolean
  /** Asks for confirmation; the page does the stopping. */
  onStop: () => void
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-5">
        <p className="flex min-w-0 flex-1 items-baseline gap-2 text-sm text-ink2">
          <Link
            to="/"
            className="shrink-0 rounded font-bold text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            Inter<span className="text-accent">via</span>
          </Link>
          <span aria-hidden>·</span>
          <span className="truncate">{sessionLabel(session)}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0 tabular-nums" aria-live="polite">
            {progressLabel(progress)}
          </span>
        </p>
        <div className="flex items-center gap-2">
          <ModeSwitch
            value={mode}
            onChange={onModeChange}
            available={availableModes}
            disabled={ended}
          />
          {!ended && (
            <Button size="sm" variant="secondary" onClick={onStop}>
              Dừng
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
