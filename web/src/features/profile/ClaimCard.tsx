import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { API_BASE } from '@/api/client'
import type { Claim } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/**
 * One claim from the CV: statement + the CV sentence it came from (`source_quote`).
 * A quote the code could not find in the CV gets the amber warning: the AI may have misread
 * or invented it, so the user should check the original file.
 */
export function ClaimCard({
  claim,
  cvId,
  readOnly = false,
  onChange,
  onRemove,
}: {
  claim: Claim
  cvId: string
  readOnly?: boolean
  onChange: (statement: string) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const notFound = claim.quote_status === 'not_found'

  return (
    <li
      className={cn(
        'grid gap-2 rounded-xl border p-3',
        notFound ? 'border-amber/40 bg-amber-soft/60' : 'border-line bg-surface',
      )}
    >
      {editing ? (
        <StatementForm
          initial={claim.statement}
          submitLabel="Xong"
          onSubmit={(text) => {
            onChange(text)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <p className="font-medium text-ink">{claim.statement}</p>
      )}

      {claim.quote_status === 'user_added' ? (
        <p className="text-sm text-ink2 italic">Bạn tự thêm, không có câu gốc trong CV</p>
      ) : (
        claim.source_quote && <p className="text-sm text-ink2">“{claim.source_quote}”</p>
      )}

      {notFound && (
        <p className="flex flex-wrap items-center gap-1 text-sm text-amber">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          Không tìm thấy câu gốc trong CV ·
          <a
            href={`${API_BASE}/cvs/${cvId}/file`}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-2 hover:text-ink"
          >
            Kiểm tra
          </a>
        </p>
      )}

      {!readOnly && !editing && (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Sửa
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove}>
            Xóa
          </Button>
        </div>
      )}
    </li>
  )
}

/** Textarea for a claim statement; used to edit one and to add a new one. */
export function StatementForm({
  initial = '',
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: string
  submitLabel: string
  onSubmit: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initial)
  const trimmed = text.trim()
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (trimmed) onSubmit(trimmed)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      <Textarea
        autoFocus
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Điều CV khẳng định"
      />
      <div className="flex justify-end gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" size="sm" variant="secondary" disabled={!trimmed}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
