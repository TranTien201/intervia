import { useCallback, useEffect, useState } from 'react'
import { readDraft, writeDraft } from '@/lib/answer-draft'

/** What is typed in the bottom bar. Lives on the page (not the composer) so it outlives it. */
export interface AnswerDraft {
  text: string
  setText: (text: string) => void
  code: boolean
  setCode: (code: boolean | ((c: boolean) => boolean)) => void
  clear: () => void
  /** The page opened with a draft left from before (reload, closed tab). */
  restored: boolean
}

/** The typed answer, mirrored to localStorage per session (`answer-draft.ts`). */
export function useAnswerDraft(sessionId: string): AnswerDraft {
  const [initial] = useState(() => readDraft(sessionId))
  const [text, setText] = useState(initial?.text ?? '')
  const [code, setCode] = useState(initial?.code ?? false)

  useEffect(() => writeDraft(sessionId, { text, code }), [sessionId, text, code])

  const clear = useCallback(() => {
    setText('')
    setCode(false)
  }, [])

  return { text, setText, code, setCode, clear, restored: initial !== null }
}
