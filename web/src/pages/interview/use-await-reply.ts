import { useEffect, useState } from 'react'

/** How often the transcript is fetched again while the interviewer owes a line. */
export const AWAIT_POLL_MS = 1000
/** After this, stop polling and offer "Thử lại" instead of waiting forever. */
export const AWAIT_GIVE_UP_MS = 30_000

/**
 * While `waiting` (the interviewer owes a line that no stream will bring: reload or dropped
 * connection mid-line), poll the transcript until the server has saved it. Gives up after
 * `AWAIT_GIVE_UP_MS` so the page is never stuck; `retry` starts over.
 */
export function useAwaitReply(waiting: boolean, refetch: () => Promise<unknown>) {
  const [timedOut, setTimedOut] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // The line arrived: a later wait starts with a fresh timer.
  const [wasWaiting, setWasWaiting] = useState(waiting)
  if (waiting !== wasWaiting) {
    setWasWaiting(waiting)
    if (!waiting) setTimedOut(false)
  }
  const polling = waiting && !timedOut

  useEffect(() => {
    if (!polling) return
    const poll = setInterval(() => void refetch(), AWAIT_POLL_MS)
    const giveUp = setTimeout(() => setTimedOut(true), AWAIT_GIVE_UP_MS)
    return () => {
      clearInterval(poll)
      clearTimeout(giveUp)
    }
  }, [polling, refetch, attempt])

  return {
    /** Polling now: the page says it is fetching the question again. */
    active: polling,
    timedOut: waiting && timedOut,
    retry: () => {
      setTimedOut(false)
      setAttempt((a) => a + 1)
      void refetch()
    },
  }
}
