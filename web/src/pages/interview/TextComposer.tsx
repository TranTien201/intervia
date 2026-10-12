import { useId } from 'react'
import { LIMITS, type QuickEventType } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { answerToSend, FENCE } from './conversation-state'
import type { AnswerDraft } from './use-answer-draft'

const QUICK_EVENTS: { type: QuickEventType; label: string }[] = [
  { type: 'REPEAT', label: 'Nhắc lại' },
  { type: 'CLARIFY', label: 'Giải thích' },
  { type: 'HINT', label: 'Gợi ý' },
  { type: 'SKIP', label: 'Bỏ qua' },
]

/** The counter shows from 90% of the limit. */
const COUNTER_FROM = Math.floor(LIMITS.answerMaxChars * 0.9)

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

/**
 * Bottom bar in Text mode (UI-6.3): quick buttons, a growing multi-line box, "Gửi".
 * Enter makes a new line, Ctrl/⌘+Enter sends. Locked while the interviewer answers; what was
 * typed stays until the server has saved it, so a failed send loses nothing. Offline, the
 * candidate can keep typing but not send.
 */
export function TextComposer({
  draft,
  locked,
  offline = false,
  error,
  onSend,
  onQuickEvent,
}: {
  /** What is typed; owned by the page so it survives reloads (localStorage). */
  draft: AnswerDraft
  /** The interviewer is answering, or nothing to answer yet. */
  locked: boolean
  /** The server cannot be reached: typing is fine, sending waits. */
  offline?: boolean
  error: string | null
  /**
   * Sends the answer; calls `onSaved` as soon as the server has saved it. That is before the
   * next question streams in, so a reload during the stream does not bring it back as a draft.
   */
  onSend: (text: string, onSaved: () => void) => Promise<boolean>
  onQuickEvent: (type: QuickEventType) => void
}) {
  const { text, setText, code, setCode } = draft
  const hintId = useId()
  const counterId = useId()
  const errorId = useId()

  const tooLong = text.length > LIMITS.answerMaxChars
  const canSend = !locked && !offline && !tooLong && text.trim() !== ''

  const send = async () => {
    if (!canSend) return
    await onSend(answerToSend(text, code), draft.clear)
  }

  return (
    <div className="grid gap-2">
      <div role="group" aria-label="Thao tác nhanh" className="flex flex-wrap gap-2">
        {QUICK_EVENTS.map((q) => (
          <Button
            key={q.type}
            variant="secondary"
            size="sm"
            disabled={locked || offline}
            onClick={() => onQuickEvent(q.type)}
          >
            {q.label}
          </Button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <Textarea
          aria-label="Câu trả lời"
          aria-describedby={[hintId, text.length >= COUNTER_FROM && counterId, error && errorId]
            .filter(Boolean)
            .join(' ')}
          aria-invalid={tooLong || undefined}
          placeholder={code ? 'Dán hoặc gõ code…' : 'Gõ câu trả lời của bạn…'}
          value={text}
          readOnly={locked}
          spellCheck={!code}
          wrap={code ? 'off' : 'soft'}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            if (e.clipboardData.getData('text').includes(FENCE)) setCode(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              void send()
            }
          }}
          className={cn(
            'max-h-[40vh] min-h-20 resize-none overflow-y-auto bg-surface text-body',
            code && 'font-mono text-sm whitespace-pre',
            locked && 'opacity-60',
          )}
        />
        <Button onClick={() => void send()} disabled={!canSend}>
          Gửi
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink2">
        <Button
          variant="ghost"
          size="xs"
          aria-pressed={code}
          onClick={() => setCode((c) => !c)}
          className={cn('font-mono', code && 'bg-subtle text-ink')}
        >
          {'</>'} Code
        </Button>
        <span id={hintId}>Enter để xuống dòng, {IS_MAC ? '⌘' : 'Ctrl'} + Enter để gửi</span>
        {text.length >= COUNTER_FROM && (
          <span id={counterId} className={cn('ml-auto', tooLong && 'text-danger')}>
            {text.length.toLocaleString('vi-VN')} / {LIMITS.answerMaxChars.toLocaleString('vi-VN')}{' '}
            ký tự
          </span>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
