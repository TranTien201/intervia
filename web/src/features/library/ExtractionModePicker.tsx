import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import type { ExtractionMode } from '@/api/types'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { extractionModeLabel, extractionModesFor } from './extraction-modes'

// Pickers for the extraction mode of a CV / JD analysis (ui-pages.md pages 2, 7, 8, 9).

type Kind = 'cv' | 'jd'

/** Radio list of the modes, each with a short description and its relative time / cost. */
export function ExtractionModePicker({
  kind,
  value,
  onChange,
  disabled,
  label = 'Chế độ phân tích',
}: {
  kind: Kind
  value: ExtractionMode
  onChange: (mode: ExtractionMode) => void
  disabled?: boolean
  /** Accessible name of the group. */
  label?: string
}) {
  const id = useId()
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as ExtractionMode)}
      disabled={disabled}
      aria-label={label}
      className="gap-3"
    >
      {extractionModesFor(kind).map((m) => (
        <div key={m.value} className="flex items-start gap-2">
          <RadioGroupItem
            id={`${id}-${m.value}`}
            value={m.value}
            aria-describedby={`${id}-${m.value}-hint`}
            className="mt-0.5"
          />
          <div className="grid gap-0.5">
            <label htmlFor={`${id}-${m.value}`} className="text-sm text-ink">
              <span className="font-medium">{m.label}</span>
              <span className="text-ink2"> · {m.cost[kind]}</span>
            </label>
            <p id={`${id}-${m.value}-hint`} className="text-xs text-ink2">
              {m.hint[kind]}
            </p>
          </div>
        </div>
      ))}
    </RadioGroup>
  )
}

/** "Tùy chọn phân tích" under a new CV / JD: collapsed by default, shows the chosen mode. */
export function AnalysisOptions({
  kind,
  value,
  onChange,
  disabled,
}: {
  kind: Kind
  value: ExtractionMode
  onChange: (mode: ExtractionMode) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="grid">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1 justify-self-start rounded-sm text-sm text-ink2 hover:text-ink',
          'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        )}
      >
        <ChevronDown
          className={cn(
            'size-4 transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-180',
          )}
          aria-hidden
        />
        Tùy chọn phân tích
        <span className="text-ink">· {extractionModeLabel(value)}</span>
      </button>
      {/* Height animates 0fr → 1fr so the dialog grows smoothly instead of jumping. Kept
          mounted while closed; `inert` + aria-hidden take it out of focus and the a11y tree. */}
      <div
        id={id}
        inert={!open}
        aria-hidden={!open}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-3 pl-5">
            <ExtractionModePicker
              kind={kind}
              value={value}
              onChange={onChange}
              disabled={disabled}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
