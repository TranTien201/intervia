import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Max affected items listed before collapsing the rest into "và N … khác". */
const MAX_LISTED = 5

/**
 * Confirmation box rendered inside the page (no browser popup, no modal).
 * Used for: delete session, delete CV/JD (with the list of affected sessions), stop interview,
 * delete account.
 *
 * - `tone="danger"` (default) only for deleting data; stopping an interview uses `tone="default"`
 *   because red is reserved for errors and data deletion (docs/design/ui.md §1).
 * - Focus starts on the safe button; Escape cancels.
 * - `pending` (e.g. `mutation.isPending`) puts the confirm button in its running state
 *   and blocks cancelling mid-request.
 */
export function InlineConfirm({
  title,
  description,
  affected,
  confirmLabel,
  cancelLabel = 'Giữ lại',
  tone = 'danger',
  pending = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
  className,
}: {
  title: ReactNode
  /** What happens, in plain words, including that it cannot be undone. */
  description: ReactNode
  /** Data that goes away with it ("CV này được dùng trong 4 phiên…"). */
  affected?: { summary: ReactNode; items: ReactNode[]; moreLabel?: (n: number) => string }
  confirmLabel: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
  pending?: boolean
  /** E.g. until the user retypes their email to delete the account. */
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
  /** Extra input before the buttons, e.g. the email to retype. */
  children?: ReactNode
  className?: string
}) {
  const titleId = useId()
  const descId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  const listed = affected?.items.slice(0, MAX_LISTED) ?? []
  const hidden = (affected?.items.length ?? 0) - listed.length
  const moreLabel = affected?.moreLabel ?? ((n: number) => `và ${n} mục khác`)

  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !pending) {
          e.stopPropagation()
          onCancel()
        }
      }}
      className={cn(
        'grid gap-3 rounded-xl border bg-surface p-4 shadow-card',
        tone === 'danger' ? 'border-danger/40' : 'border-line',
        className,
      )}
    >
      <p id={titleId} className="font-semibold text-ink">
        {title}
      </p>
      <div id={descId} className="grid gap-2 text-sm text-ink2">
        <p>{description}</p>
        {affected && (
          <div className="grid gap-1.5 rounded-lg bg-danger-soft/60 px-3 py-2 text-ink">
            <p>{affected.summary}</p>
            {listed.length > 0 && (
              <ul className="list-disc pl-5">
                {listed.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
                {hidden > 0 && <li className="list-none text-ink2">{moreLabel(hidden)}</li>}
              </ul>
            )}
          </div>
        )}
      </div>
      {children}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={tone === 'danger' ? 'danger' : 'default'}
          loading={pending}
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
        <Button ref={cancelRef} variant="secondary" disabled={pending} onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  )
}
