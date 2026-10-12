import { Plus, X } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

/** Skill tag on subtle background, with an optional ✕ button. */
export function Tag({
  children,
  onRemove,
  className,
}: {
  children: string
  onRemove?: () => void
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-subtle py-1 text-sm text-ink',
        onRemove ? 'pr-1 pl-2.5' : 'px-2.5',
        className,
      )}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Xóa ${children}`}
          className="grid size-5 place-items-center rounded text-ink2 hover:bg-line hover:text-ink"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </span>
  )
}

/**
 * Editable list of tags with "+ Thêm". Enter adds, Escape cancels.
 * Duplicates (case-insensitive) are ignored.
 */
export function TagInput({
  value,
  onChange,
  addLabel = 'Thêm',
  placeholder = 'Nhập rồi nhấn Enter',
  disabled = false,
}: {
  value: string[]
  onChange: (next: string[]) => void
  addLabel?: string
  placeholder?: string
  disabled?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    const text = draft.trim()
    if (text && !value.some((v) => v.toLowerCase() === text.toLowerCase())) {
      onChange([...value, text])
    }
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      setDraft('')
      setAdding(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((tag) => (
        <Tag
          key={tag}
          onRemove={disabled ? undefined : () => onChange(value.filter((v) => v !== tag))}
        >
          {tag}
        </Tag>
      ))}
      {!disabled &&
        (adding ? (
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => {
              commit()
              setAdding(false)
            }}
            placeholder={placeholder}
            aria-label={addLabel}
            className="h-8 w-44 rounded-md border border-accent bg-bg px-2 text-sm outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-line px-2.5 py-1 text-sm text-ink2 hover:border-accent hover:text-accent"
          >
            <Plus className="size-3.5" aria-hidden="true" /> {addLabel}
          </button>
        ))}
    </div>
  )
}
