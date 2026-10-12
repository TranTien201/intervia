import { Pause, Play } from 'lucide-react'
import { useRef, useState } from 'react'
import { clockLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * ▶ ━━━○── 0:52 / 1:24. Loads nothing until played (a review page can hold many answers).
 * The duration comes from the saved answer until the file says otherwise.
 * Starting one player pauses the others.
 */
export function AudioPlayer({
  src,
  durationMs,
  label,
  className,
}: {
  src: string
  durationMs: number | null
  /** What is being played, for screen readers: "câu trả lời câu 4". */
  label: string
  className?: string
}) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState((durationMs ?? 0) / 1000)
  const [failed, setFailed] = useState(false)

  const toggle = () => {
    const el = ref.current
    if (!el) return
    if (el.paused) el.play().catch(() => setFailed(true))
    else el.pause()
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <audio
        ref={ref}
        src={src}
        preload="none"
        onPlay={(e) => {
          setPlaying(true)
          setFailed(false)
          document.querySelectorAll('audio').forEach((other) => {
            if (other !== e.currentTarget) other.pause()
          })
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration
          if (Number.isFinite(d) && d > 0) setDuration(d)
        }}
        onError={() => {
          setPlaying(false)
          setFailed(true)
        }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={`${playing ? 'Tạm dừng' : 'Phát'} ${label}`}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent outline-none hover:bg-accent hover:text-white focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
      </button>
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.1}
        value={Math.min(time, duration || 1)}
        disabled={!duration}
        onChange={(e) => {
          const t = Number(e.target.value)
          setTime(t)
          if (ref.current) ref.current.currentTime = t
        }}
        aria-label={`Tua ${label}`}
        aria-valuetext={`${clockLabel(time)} / ${clockLabel(duration)}`}
        className="h-1 min-w-0 flex-1 cursor-pointer accent-accent disabled:cursor-default"
      />
      <span className="shrink-0 text-sm text-ink2 tabular-nums">
        {failed ? 'Không phát được' : `${clockLabel(time)} / ${clockLabel(duration)}`}
      </span>
    </div>
  )
}
