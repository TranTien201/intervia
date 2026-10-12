import { useCallback, useEffect, useRef, useState } from 'react'
import { NetworkError } from '@/api/client'
import { postStream } from '@/api/sse'
import type { QuickEventType, StreamEvent } from '@/api/types'
import { codeMessage, errorMessage } from '@/lib/errors'
import type { ConversationAction } from './conversation-state'

/**
 * Send what the candidate does in Text mode: an answer (`POST …/turns`) or a quick button
 * (`POST …/events`, no classify). Both answer with an SSE stream, fed to the conversation.
 * One request at a time; the page locks the bottom bar while `busy`.
 * `onNetworkError`: the server could not be reached (the page shows "reconnecting").
 */
export function useTurns(
  sessionId: string,
  apply: (e: ConversationAction) => void,
  onNetworkError?: (err: NetworkError) => void,
) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * An answer whose request was lost to the network before `user_item`: it may or may not have
   * reached the server. The page compares it with the transcript once back online.
   */
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null)
  const current = useRef<AbortController | null>(null)
  useEffect(() => () => current.current?.abort(), [])

  /**
   * Resolves to true once the server saved what was sent (`user_item`), even if the AI line then failed.
   * `onSaved` runs as soon as `user_item` arrives, before the AI line streams in.
   */
  const run = useCallback(
    async (path: string, body: Record<string, unknown>, onSaved?: () => void): Promise<boolean> => {
      if (current.current) return false
      const ctrl = new AbortController()
      current.current = ctrl
      setBusy(true)
      setError(null)
      let saved = false
      let received = false
      // A line started but not finished: the stream must not end there.
      let open = false
      const onEvent = (e: StreamEvent) => {
        received = true
        if (e.event === 'user_item') {
          saved = true
          onSaved?.()
        }
        if (e.event === 'message_start') open = true
        if (e.event === 'message_done' || e.event === 'error') open = false
        if (e.event === 'error') setError(codeMessage(e.data))
        apply(e)
      }
      try {
        await postStream(path, body, onEvent, ctrl.signal)
        if (open) {
          setError('Mất kết nối khi người phỏng vấn đang trả lời. Đã tải lại hội thoại.')
          apply({ event: 'stream_broken' })
        }
      } catch (err) {
        if (ctrl.signal.aborted) return saved
        setError(errorMessage(err))
        if (err instanceof NetworkError) {
          onNetworkError?.(err)
          if (!saved && typeof body.text === 'string') setUnconfirmed(body.text)
        }
        if (received) apply({ event: 'stream_broken' })
      } finally {
        current.current = null
        if (!ctrl.signal.aborted) setBusy(false)
      }
      return saved
    },
    [apply, onNetworkError],
  )

  const sendAnswer = useCallback(
    (text: string, onSaved?: () => void) => run(`/sessions/${sessionId}/turns`, { text }, onSaved),
    [run, sessionId],
  )
  const sendEvent = useCallback(
    (type: QuickEventType) => run(`/sessions/${sessionId}/events`, { type }),
    [run, sessionId],
  )

  /** Drop the running request (the session was stopped): nothing more is applied from it. */
  const cancel = useCallback(() => {
    current.current?.abort()
    current.current = null
    setBusy(false)
  }, [])

  /** Back online and resynced: the old network error no longer applies. */
  const settle = useCallback(() => {
    setError(null)
    setUnconfirmed(null)
  }, [])

  return { busy, error, unconfirmed, sendAnswer, sendEvent, cancel, settle }
}
