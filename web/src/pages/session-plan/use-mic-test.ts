import { useCallback, useEffect, useRef, useState } from 'react'

export type MicProblem = 'unsupported' | 'denied' | 'no_device' | 'busy' | 'other'

export type MicTest =
  | { state: 'idle' }
  | { state: 'requesting' }
  | { state: 'listening'; level: number; heard: boolean }
  | { state: 'error'; problem: MicProblem }

const ALLOW_IN_BROWSER =
  'Để bật lại: bấm biểu tượng ổ khóa cạnh thanh địa chỉ → Micro → Cho phép, rồi chọn lại chế độ có nói.'

/** Why the mic failed and how to fix it, shown where the mode switched back to Text. */
export const MIC_PROBLEM: Record<MicProblem, { reason: string; fix: string }> = {
  denied: { reason: 'Trình duyệt đang chặn quyền dùng mic.', fix: ALLOW_IN_BROWSER },
  no_device: {
    reason: 'Không tìm thấy mic nào.',
    fix: 'Cắm mic hoặc tai nghe có mic, rồi chọn lại chế độ có nói.',
  },
  busy: {
    reason: 'Mic đang bị ứng dụng khác dùng.',
    fix: 'Tắt ứng dụng đó (Zoom, Meet…), rồi chọn lại chế độ có nói.',
  },
  unsupported: {
    reason: 'Trình duyệt này không hỗ trợ thu âm.',
    fix: 'Hãy dùng Chrome, Edge, Firefox hoặc Safari bản mới.',
  },
  other: { reason: 'Không mở được mic.', fix: ALLOW_IN_BROWSER },
}

/** Level (0–1) above which we count it as speech, not room noise. */
const HEARD_LEVEL = 0.15

function problemOf(err: unknown): MicProblem {
  const name = err instanceof DOMException || err instanceof Error ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no_device'
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy'
  return 'other'
}

/**
 * Ask for the microphone and show a live input level (Web Audio analyser, RMS of the
 * waveform). Only a device check: the real voice connection is Pipecat's job (UI-9.2).
 * Releases the mic on `stop()` and on unmount.
 */
export function useMicTest() {
  const [test, setTest] = useState<MicTest>({ state: 'idle' })
  const cleanup = useRef<(() => void) | null>(null)

  const stop = useCallback(() => {
    cleanup.current?.()
    cleanup.current = null
  }, [])

  const start = useCallback(async (): Promise<MicProblem | null> => {
    stop()
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
      setTest({ state: 'error', problem: 'unsupported' })
      return 'unsupported'
    }
    setTest({ state: 'requesting' })
    let media: MediaStream
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      const problem = problemOf(err)
      setTest({ state: 'error', problem })
      return problem
    }

    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    ctx.createMediaStreamSource(media).connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    let heard = false
    let frame = 0
    const tick = () => {
      analyser.getByteTimeDomainData(samples)
      let sum = 0
      for (const v of samples) sum += ((v - 128) / 128) ** 2
      // Speech RMS is usually 0.02–0.2; scale so normal talking fills most of the bar.
      const level = Math.min(1, Math.sqrt(sum / samples.length) * 5)
      heard ||= level >= HEARD_LEVEL
      setTest({ state: 'listening', level, heard })
      frame = requestAnimationFrame(tick)
    }
    tick()

    cleanup.current = () => {
      cancelAnimationFrame(frame)
      media.getTracks().forEach((t) => t.stop())
      void ctx.close()
      setTest({ state: 'idle' })
    }
    return null
  }, [stop])

  useEffect(() => () => cleanup.current?.(), [])

  return { test, start, stop }
}
