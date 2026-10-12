import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranscript } from '@/api/hooks'
import { qk } from '@/api/keys'
import { dropStartStream, getStartStream } from '@/features/sessions/start-interview'
import {
  emptyLive,
  liveReducer,
  mergeItems,
  owesReply,
  toRows,
  type ConversationAction,
} from './conversation-state'

/**
 * The conversation of page 5: the saved transcript plus what the streams add on top.
 * - The first question may still be streaming from page 4 (`getStartStream`): it is replayed
 *   here, then followed live.
 * - UI-6.3 feeds the streams of `POST …/turns` and `POST …/events` through `apply`.
 * - A stream that breaks drops the half line and reloads the transcript (full saved line).
 * - Progress and the end summary come from the streams (`progress`, `session_ended`) or from
 *   `stopped` (UI-6.4); the end summary falls back to the saved one.
 * - `awaitingReply`: the saved transcript ends with something the interviewer has not answered
 *   yet (reload or dropped connection mid-line); the page polls `retry` until the line is saved.
 */
export function useConversation(sessionId: string) {
  const transcript = useTranscript(sessionId)
  const { refetch } = transcript
  const qc = useQueryClient()
  const [live, dispatch] = useReducer(liveReducer, emptyLive)
  // Read once per mount; StrictMode's second read returns the same stream.
  const [startStream] = useState(() => getStartStream(sessionId))
  const [startDone, setStartDone] = useState(() => !startStream || startStream.done)

  const apply = useCallback(
    (e: ConversationAction) => {
      dispatch(e)
      // `stopped`: the transcript now has the STOP note.
      if (e.event === 'error' || e.event === 'stream_broken' || e.event === 'stopped')
        void refetch()
      // The server ended it: the session is now completed everywhere else too.
      if (e.event === 'session_ended') {
        void qc.invalidateQueries({ queryKey: qk.session(sessionId) })
        void qc.invalidateQueries({ queryKey: qk.sessions })
      }
    },
    [refetch, qc, sessionId],
  )

  // Survives StrictMode's effect re-run, so no event is applied twice.
  const replayed = useRef({ count: 0, broken: false })
  useEffect(() => {
    if (!startStream) return
    const sync = () => {
      const r = replayed.current
      while (r.count < startStream.events.length) apply(startStream.events[r.count++]!)
      if (startStream.error && !r.broken) {
        r.broken = true
        apply({ event: 'stream_broken' })
      }
      if (startStream.done) setStartDone(true)
    }
    sync()
    const unsubscribe = startStream.subscribe(sync)
    return () => {
      unsubscribe()
      dropStartStream(sessionId)
    }
  }, [sessionId, startStream, apply])

  const items = useMemo(
    () => mergeItems(transcript.data?.items ?? [], live.items),
    [transcript.data, live.items],
  )
  const rows = useMemo(() => toRows(items, live.pending), [items, live.pending])

  const ended = live.ended ?? transcript.data?.summary ?? null

  return {
    rows,
    items,
    /** True while the interviewer is streaming a line. */
    streaming: live.pending !== null,
    /** Latest `progress` event; null until one arrives (the page uses the session's). */
    progress: live.progress,
    /** Set once the session is over: the bottom bar becomes the summary block. */
    ended,
    /** Ended while this page was open (stopped, `session_ended`), not before it opened. */
    endedHere: live.ended !== null,
    /** Page 4 just started the session and handed its first-question stream over. */
    fromStart: !!startStream,
    /** Nothing streams, yet the interviewer owes a line (see above). */
    awaitingReply:
      !ended && startDone && live.pending === null && !!transcript.data && owesReply(items),
    /** Latest transcript fetch error, also while older data is shown (offline detection). */
    syncError: transcript.error,
    /** Nothing to show yet because the transcript is still loading. */
    loading: transcript.isPending && rows.length === 0,
    /** Only when there is nothing to show; otherwise the page keeps the conversation. */
    error: rows.length === 0 && transcript.isError ? transcript.error : null,
    retry: refetch,
    apply,
  }
}
