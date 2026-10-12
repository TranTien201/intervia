import { Pencil } from 'lucide-react'
import { useId, useState } from 'react'
import { API_BASE } from '@/api/client'
import { useEditAnswer, useTranscript } from '@/api/hooks'
import type { AnswerItem } from '@/api/types'
import { AnswerText } from '@/components/AnswerText'
import { AudioPlayer } from '@/components/AudioPlayer'
import { Badge } from '@/components/Badge'
import { EmptyState, PageSkeleton, QueryView } from '@/components/PageStates'
import { SectionLabel } from '@/components/SectionLabel'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage } from '@/lib/errors'
import { notifyError, notifySaved } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { type QuestionBlock, questionAnchor, toBlocks } from './transcript-blocks'

/** Tab "Transcript" (UI-7.2): every question with its answer, audio and notes. */
export function Transcript({ sessionId }: { sessionId: string }) {
  const query = useTranscript(sessionId)
  return (
    <QueryView
      query={query}
      loading={<PageSkeleton variant="transcript" />}
      isEmpty={(t) => !t.items.some((i) => i.kind === 'question')}
      empty={<EmptyState message="Phiên này chưa có câu hỏi nào." />}
    >
      {(t) => (
        <ol className="grid">
          {toBlocks(t.items).map((block) => (
            <QuestionView key={block.question.id} block={block} sessionId={sessionId} />
          ))}
        </ol>
      )}
    </QueryView>
  )
}

function QuestionView({ block, sessionId }: { block: QuestionBlock; sessionId: string }) {
  const { question: q, answers, notes, outcome } = block
  const headingId = useId()
  // "CÂU 4 · XỬ LÝ LỖI · L3": label-caps uppercases it.
  const heading = [`Câu ${q.index}`, q.competency?.name, q.depth].filter(Boolean).join(' · ')
  return (
    <li
      id={questionAnchor(q.index)}
      aria-labelledby={headingId}
      // Focus target of the jump list (UI-7.3).
      tabIndex={-1}
      className="grid scroll-mt-16 outline-none md:scroll-mt-6 gap-3 border-b border-line py-6 first:pt-0 last:border-b-0"
    >
      <div className="flex flex-wrap items-center gap-2">
        <SectionLabel as="h3" id={headingId}>
          {heading}
        </SectionLabel>
        {q.unplanned && <Badge variant="unplanned" />}
      </div>
      <p className="text-body whitespace-pre-wrap text-ai">{q.text}</p>

      {answers.map((a) => (
        <AnswerView key={a.id} answer={a} questionIndex={q.index} sessionId={sessionId} />
      ))}
      {outcome === 'skipped' && <p className="text-sm text-ink2 italic">Đã bỏ qua</p>}
      {outcome === 'unanswered' && <p className="text-sm text-ink2 italic">Chưa trả lời</p>}

      {notes.length > 0 && (
        <ul className="flex flex-wrap gap-x-2 text-sm">
          {notes.map((n, i) => (
            <li key={n.id} className={n.tone === 'amber' ? 'text-amber' : 'text-ink2'}>
              {i > 0 && (
                <span aria-hidden="true" className="mr-2 text-ink2">
                  ·
                </span>
              )}
              {n.text}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

type Version = 'original' | 'edited'

function AnswerView({
  answer: a,
  questionIndex,
  sessionId,
}: {
  answer: AnswerItem
  questionIndex: number
  sessionId: string
}) {
  const [version, setVersion] = useState<Version>('edited')
  const [editing, setEditing] = useState(false)
  const hasEdit = a.text_edited !== null
  const shown = hasEdit && version === 'edited' ? a.text_edited! : a.text_original
  const fromStt = a.source === 'stt'

  return (
    <div className="grid gap-3">
      {editing ? (
        <EditAnswer
          answer={a}
          sessionId={sessionId}
          onSaved={() => {
            setEditing(false)
            setVersion('edited')
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="min-w-0 text-body text-ink">
          <AnswerText text={shown} />
        </div>
      )}

      {a.has_audio && (
        <AudioPlayer
          src={`${API_BASE}/answers/${a.id}/audio`}
          durationMs={a.duration_ms}
          label={`câu trả lời câu ${questionIndex}`}
          className="max-w-md"
        />
      )}

      {/* Only speech can be misheard: typed answers are kept exactly as sent. */}
      {fromStt && !editing && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {hasEdit ? <VersionSwitch value={version} onChange={setVersion} /> : <span />}
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil /> Sửa transcript
          </Button>
        </div>
      )}
    </div>
  )
}

/** [Bản STT gốc | Đã sửa] */
function VersionSwitch({ value, onChange }: { value: Version; onChange: (v: Version) => void }) {
  const options: { value: Version; label: string }[] = [
    { value: 'original', label: 'Bản STT gốc' },
    { value: 'edited', label: 'Đã sửa' },
  ]
  return (
    <div
      role="group"
      aria-label="Bản transcript"
      className="inline-flex rounded-md border border-line p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded px-2.5 py-1 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            value === o.value ? 'bg-accent-soft text-accent' : 'text-ink2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Edit in place. Starts from the shown text (the latest edit, else the STT original); the
 * original is always kept. Saving the original text back clears the edit.
 */
function EditAnswer({
  answer,
  sessionId,
  onSaved,
  onCancel,
}: {
  answer: AnswerItem
  sessionId: string
  onSaved: () => void
  onCancel: () => void
}) {
  const [text, setText] = useState(answer.text_edited ?? answer.text_original)
  const edit = useEditAnswer(sessionId)
  const empty = !text.trim()
  const save = () =>
    edit.mutate(
      { id: answer.id, text_edited: text },
      {
        onSuccess: () => {
          notifySaved('Đã lưu bản sửa')
          onSaved()
        },
        onError: (err) => notifyError(errorMessage(err)),
      },
    )

  return (
    <div className="grid gap-2">
      <Textarea
        aria-label="Sửa transcript"
        value={text}
        autoFocus
        readOnly={edit.isPending}
        aria-invalid={empty || undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !edit.isPending) onCancel()
        }}
        className="text-body"
      />
      <p className="text-sm text-ink2">Bản STT gốc vẫn được giữ, xem lại được bất cứ lúc nào.</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} loading={edit.isPending} disabled={empty}>
          Lưu bản sửa
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={edit.isPending}>
          Hủy
        </Button>
      </div>
    </div>
  )
}
