import { AnswerText } from '@/components/AnswerText'
import { SectionLabel } from '@/components/SectionLabel'
import { cn } from '@/lib/utils'
import type { ConversationRow } from './conversation-state'

/**
 * The interview conversation (UI-6.2). Interviewer lines are plain text: the Speaker never
 * writes markdown. Only candidate answers render code (fenced blocks, `inline`).
 * No scores, right/wrong marks or competency names here.
 */
export function Conversation({ rows, streaming }: { rows: ConversationRow[]; streaming: boolean }) {
  return (
    // Screen readers announce a line once it is complete, not token by token.
    <div role="log" aria-live="polite" aria-busy={streaming} className="grid gap-6">
      {rows.length === 0 && <p className="text-ink2">Người phỏng vấn đang chuẩn bị câu hỏi…</p>}
      {rows.map((row) => {
        switch (row.type) {
          case 'ai':
            return <InterviewerTurn key={row.key} row={row} />
          case 'answer':
            return <CandidateTurn key={row.key} text={row.text} />
          case 'note':
            return (
              <p
                key={row.key}
                className={cn(
                  'text-center text-sm italic',
                  row.tone === 'amber' ? 'text-amber' : 'text-ink2',
                )}
              >
                {row.text}
              </p>
            )
        }
      })}
    </div>
  )
}

function InterviewerTurn({ row }: { row: Extract<ConversationRow, { type: 'ai' }> }) {
  return (
    <div className="grid gap-1.5">
      <SectionLabel as="p" className="text-ai">
        Người phỏng vấn
      </SectionLabel>
      <p
        className={cn(
          'whitespace-pre-wrap',
          row.current ? 'text-question text-ink' : 'text-body text-ink2',
        )}
      >
        {row.text}
        {row.streaming && (
          <span aria-hidden="true" className="ml-0.5 animate-pulse text-ai">
            ▌
          </span>
        )}
      </p>
    </div>
  )
}

function CandidateTurn({ text }: { text: string }) {
  return (
    <div className="grid justify-items-end gap-1.5">
      <SectionLabel as="p">Bạn</SectionLabel>
      <div className="max-w-[85%] min-w-0 rounded-xl border border-line bg-surface px-4 py-3 text-body text-ink">
        <AnswerText text={text} />
      </div>
    </div>
  )
}
