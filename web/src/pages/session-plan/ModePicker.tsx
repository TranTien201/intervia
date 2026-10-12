import { useId } from 'react'
import type { Mode } from '@/api/types'
import { SectionLabel } from '@/components/SectionLabel'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { MODE_LABEL } from '@/lib/format'

const MODES: { value: Mode; hint: string }[] = [
  { value: 'text', hint: 'Bạn gõ câu trả lời, AI trả lời bằng chữ.' },
  { value: 'voice_text', hint: 'Bạn nói, AI trả lời bằng chữ.' },
  { value: 'voice_voice', hint: 'Bạn nói, AI trả lời bằng chữ và đọc thành tiếng.' },
]

/** "Chế độ bắt đầu": Text / Nói → Chữ / Nói → Nói. */
export function ModePicker({
  value,
  onChange,
  disabled,
}: {
  value: Mode
  onChange: (mode: Mode) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="grid gap-3">
      <SectionLabel id={`${id}-title`}>Chế độ bắt đầu</SectionLabel>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as Mode)}
        disabled={disabled}
        aria-labelledby={`${id}-title`}
        className="gap-3"
      >
        {MODES.map((m) => (
          <div key={m.value} className="flex items-start gap-2">
            <RadioGroupItem
              id={`${id}-${m.value}`}
              value={m.value}
              aria-describedby={`${id}-${m.value}-hint`}
              className="mt-0.5"
            />
            <div className="grid gap-0.5">
              <label htmlFor={`${id}-${m.value}`} className="text-sm font-medium text-ink">
                {MODE_LABEL[m.value]}
              </label>
              <p id={`${id}-${m.value}-hint`} className="text-xs text-ink2">
                {m.hint}
              </p>
            </div>
          </div>
        ))}
      </RadioGroup>
      <p className="text-sm text-ink2">Đổi được trong lúc phỏng vấn.</p>
    </div>
  )
}
