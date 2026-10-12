import { cn } from '@/lib/utils'

export type VoiceState =
  'connecting' | 'listening' | 'thinking' | 'processing' | 'speaking' | 'mic_unavailable'

type Motion = 'dots' | 'wave' | 'still'

// docs/design/ui.md §4
const STATES: Record<VoiceState, { label: string; pill: string; mark: string; motion: Motion }> = {
  connecting: {
    label: 'Đang kết nối',
    pill: 'bg-subtle text-ink2',
    mark: 'bg-ink2',
    motion: 'dots',
  },
  listening: {
    label: 'Đang nghe bạn',
    pill: 'bg-accent-soft text-accent',
    mark: 'bg-accent',
    motion: 'wave',
  },
  thinking: {
    label: 'Cứ từ từ suy nghĩ',
    pill: 'bg-amber-soft text-amber',
    mark: 'bg-amber',
    motion: 'still',
  },
  processing: {
    label: 'Đang xử lý',
    pill: 'bg-amber-soft text-amber',
    mark: 'bg-amber',
    motion: 'dots',
  },
  speaking: { label: 'AI đang nói', pill: 'bg-ai-soft text-ai', mark: 'bg-ai', motion: 'wave' },
  mic_unavailable: {
    label: 'Không dùng được mic',
    pill: 'bg-danger-soft text-danger',
    mark: 'bg-danger',
    motion: 'still',
  },
}

const DELAYS = ['0ms', '150ms', '300ms', '450ms']

function MotionMark({ motion, color }: { motion: Motion; color: string }) {
  if (motion === 'still') return <span className={cn('size-2 rounded-full', color)} />
  if (motion === 'dots') {
    return (
      <span className="flex items-center gap-0.5">
        {DELAYS.slice(0, 3).map((d) => (
          <span
            key={d}
            style={{ animationDelay: d }}
            className={cn(
              'size-1.5 animate-voice-dot rounded-full motion-reduce:animate-none',
              color,
            )}
          />
        ))}
      </span>
    )
  }
  return (
    <span className="flex h-3.5 items-center gap-0.5">
      {DELAYS.map((d) => (
        <span
          key={d}
          style={{ animationDelay: d }}
          className={cn(
            'h-full w-0.5 animate-voice-wave rounded-full motion-reduce:animate-none',
            color,
          )}
        />
      ))}
    </span>
  )
}

/**
 * Voice status pill: colour + motion + text for each of the 6 states.
 * The text is a polite live region, so screen readers hear state changes; keep the pill
 * mounted and change `state` rather than remounting, or the announcement may be missed.
 */
export function VoiceStatusPill({ state, className }: { state: VoiceState; className?: string }) {
  const s = STATES[state]
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-full px-3 text-sm font-medium',
        s.pill,
        className,
      )}
    >
      <span aria-hidden="true" className="flex w-4 justify-center">
        <MotionMark motion={s.motion} color={s.mark} />
      </span>
      <span role="status" aria-live="polite">
        {s.label}
      </span>
    </span>
  )
}
