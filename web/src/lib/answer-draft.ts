/**
 * The answer being typed on page 5, kept in localStorage per session so a reload or a dropped
 * connection does not lose it. It is the candidate's own text on their own browser; it is
 * removed once sent, when the session ends, when the session is deleted and on logout.
 */
export interface StoredDraft {
  text: string
  code: boolean
}

const PREFIX = 'intervia.draft.'
const key = (sessionId: string) => PREFIX + sessionId

export function readDraft(sessionId: string): StoredDraft | null {
  try {
    const raw = globalThis.localStorage?.getItem(key(sessionId))
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<StoredDraft>
    return typeof d.text === 'string' && d.text !== '' ? { text: d.text, code: !!d.code } : null
  } catch {
    return null
  }
}

export function writeDraft(sessionId: string, draft: StoredDraft) {
  try {
    if (draft.text === '') globalThis.localStorage?.removeItem(key(sessionId))
    else globalThis.localStorage?.setItem(key(sessionId), JSON.stringify(draft))
  } catch {
    // Storage blocked or full: the draft just lives in memory.
  }
}

export function dropDraft(sessionId: string) {
  writeDraft(sessionId, { text: '', code: false })
}

/** Every session's draft, e.g. on logout so the next person on this browser cannot read them. */
export function dropAllDrafts() {
  try {
    const storage = globalThis.localStorage
    if (!storage) return
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
    for (const k of keys) if (k?.startsWith(PREFIX)) storage.removeItem(k)
  } catch {
    // Storage blocked: nothing was stored either.
  }
}
