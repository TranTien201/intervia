import { postStream } from '@/api/sse'
import type { Mode, StreamEvent } from '@/api/types'

/**
 * `POST /sessions/:id/start` answers with the first question as an SSE stream. Page 4 starts
 * it and moves to page 5 as soon as the server has accepted; the stream keeps running here so
 * page 5 can show the question as it streams instead of starting over (`getStartStream`).
 */
export interface StartStream {
  /** Events received so far, in order. */
  events: StreamEvent[]
  done: boolean
  /** Set when the stream breaks after it was accepted; page 5 reloads the transcript. */
  error: unknown
  /** Called on every new event and when the stream ends. Returns the unsubscribe function. */
  subscribe: (listener: () => void) => () => void
}

const streams = new Map<string, StartStream>()

/**
 * Start the interview. Resolves once the server accepted (first event), rejects with the
 * `ApiError` / `NetworkError` if it refused (e.g. 409 `blueprint_not_ready`).
 */
export function startInterview(sessionId: string, mode: Mode): Promise<void> {
  const listeners = new Set<() => void>()
  const stream: StartStream = {
    events: [],
    done: false,
    error: null,
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
  const notify = () => listeners.forEach((l) => l())

  return new Promise<void>((resolve, reject) => {
    let accepted = false
    const accept = () => {
      if (accepted) return
      accepted = true
      streams.set(sessionId, stream)
      resolve()
    }
    postStream(`/sessions/${sessionId}/start`, { mode }, (e) => {
      stream.events.push(e)
      accept()
      notify()
    })
      .then(() => {
        stream.done = true
        accept()
        notify()
      })
      .catch((err: unknown) => {
        if (!accepted) return reject(err)
        stream.error = err
        stream.done = true
        notify()
      })
  })
}

/**
 * The start stream of a session, if page 4 just started it. Reading does not remove it, so a
 * double render (StrictMode) or coming back to page 5 while it still runs gets the same stream.
 */
export function getStartStream(sessionId: string): StartStream | undefined {
  return streams.get(sessionId)
}

/** Forget a finished start stream once page 5 has shown it; the transcript has it from now on. */
export function dropStartStream(sessionId: string) {
  if (streams.get(sessionId)?.done) streams.delete(sessionId)
}
