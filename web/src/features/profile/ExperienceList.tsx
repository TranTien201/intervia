import { Pencil, Plus, X } from 'lucide-react'
import { useState } from 'react'
import type { Experience } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type ExperienceFields = Pick<Experience, 'role' | 'organization' | 'period'>

const experienceLabel = (e: ExperienceFields) =>
  [[e.role, e.organization].filter(Boolean).join(' @ '), e.period].filter(Boolean).join(' · ')

/** "Backend Engineer @ Công ty ABC · 2022–nay", each editable in place with ✎. */
export function ExperienceList({
  value,
  readOnly = false,
  onChange,
}: {
  value: Experience[]
  readOnly?: boolean
  onChange: (next: Experience[]) => void
}) {
  // id of the row being edited, or 'new' for the add form.
  const [editing, setEditing] = useState<string | null>(null)

  return (
    <div className="grid gap-2">
      {value.length === 0 && editing !== 'new' && (
        <p className="text-sm text-ink2 italic">Chưa có kinh nghiệm nào.</p>
      )}
      <ul className="grid gap-1">
        {value.map((exp) =>
          editing === exp.id ? (
            <li key={exp.id}>
              <ExperienceForm
                initial={exp}
                submitLabel="Xong"
                onSubmit={(fields) => {
                  onChange(value.map((e) => (e.id === exp.id ? { ...e, ...fields } : e)))
                  setEditing(null)
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={exp.id} className="group flex items-center gap-1 text-ink">
              <span aria-hidden className="text-ink2">
                •
              </span>
              <span className="min-w-0 flex-1">{experienceLabel(exp)}</span>
              {!readOnly && (
                <>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Sửa ${experienceLabel(exp)}`}
                    onClick={() => setEditing(exp.id)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Xóa ${experienceLabel(exp)}`}
                    onClick={() => onChange(value.filter((e) => e.id !== exp.id))}
                  >
                    <X />
                  </Button>
                </>
              )}
            </li>
          ),
        )}
      </ul>
      {!readOnly &&
        (editing === 'new' ? (
          <ExperienceForm
            submitLabel="Thêm"
            onSubmit={(fields) => {
              onChange([
                ...value,
                { id: crypto.randomUUID(), technologies: [], source_quote: null, ...fields },
              ])
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="justify-self-start"
            onClick={() => setEditing('new')}
          >
            <Plus /> Thêm kinh nghiệm
          </Button>
        ))}
    </div>
  )
}

function ExperienceForm({
  initial = { role: '', organization: '', period: '' },
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ExperienceFields
  submitLabel: string
  onSubmit: (fields: ExperienceFields) => void
  onCancel: () => void
}) {
  const [fields, setFields] = useState<ExperienceFields>({
    role: initial.role,
    organization: initial.organization,
    period: initial.period,
  })
  const trimmed = {
    role: fields.role.trim(),
    organization: fields.organization.trim(),
    period: fields.period.trim(),
  }
  const valid = Boolean(trimmed.role || trimmed.organization)
  const set = (key: keyof ExperienceFields) => (e: { target: { value: string } }) =>
    setFields((f) => ({ ...f, [key]: e.target.value }))

  return (
    <form
      className="grid gap-2 rounded-xl border border-line bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSubmit(trimmed)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr]">
        <Input
          autoFocus
          aria-label="Vai trò"
          placeholder="Vai trò"
          value={fields.role}
          onChange={set('role')}
        />
        <Input
          aria-label="Công ty / dự án"
          placeholder="Công ty / dự án"
          value={fields.organization}
          onChange={set('organization')}
        />
        <Input
          aria-label="Thời gian"
          placeholder="2022–nay"
          value={fields.period}
          onChange={set('period')}
        />
      </div>
      <div className="flex justify-end gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" size="sm" variant="secondary" disabled={!valid}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
