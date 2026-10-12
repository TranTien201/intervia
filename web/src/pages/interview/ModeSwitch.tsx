import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import type { Mode } from '@/api/types'
import { MODE_LABEL } from '@/lib/format'
import { cn } from '@/lib/utils'

const MODES: Mode[] = ['text', 'voice_text', 'voice_voice']

/**
 * Segmented [Text | Nói→Chữ | Nói→Nói] in the top bar. Modes not in `available` are shown
 * but locked (voice comes with UI-9). Arrow keys move between modes (radio group).
 */
export function ModeSwitch({
  value,
  onChange,
  available,
  disabled,
}: {
  value: Mode
  onChange: (mode: Mode) => void
  available: readonly Mode[]
  disabled?: boolean
}) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(v) => onChange(v as Mode)}
      disabled={disabled}
      orientation="horizontal"
      aria-label="Chế độ phỏng vấn"
      className="inline-flex rounded-lg border border-line bg-bg p-0.5"
    >
      {MODES.map((m) => {
        const locked = !available.includes(m)
        return (
          <RadioGroupPrimitive.Item
            key={m}
            value={m}
            disabled={locked}
            title={locked ? 'Chưa dùng được, sẽ có ở bản sau' : undefined}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap text-ink2 transition-colors sm:text-sm',
              'hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
              'data-[state=checked]:bg-surface data-[state=checked]:text-ink data-[state=checked]:shadow-sm',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-ink2',
            )}
          >
            {MODE_LABEL[m]}
            {locked && <span className="sr-only"> (chưa dùng được)</span>}
          </RadioGroupPrimitive.Item>
        )
      })}
    </RadioGroupPrimitive.Root>
  )
}
