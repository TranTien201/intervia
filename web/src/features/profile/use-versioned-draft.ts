import { useState } from 'react'

/**
 * Local draft of an immutable version (CV profile, JD requirements).
 * Edits stay local until saved; saving creates a new version that becomes the new base.
 */
export function useVersionedDraft<V extends { version: number }, D>(
  version: V,
  content: (v: V) => D,
) {
  const [base, setBase] = useState(version)
  const [draft, setDraft] = useState(() => content(version))
  const [justSaved, setJustSaved] = useState(false)
  const [propVersion, setPropVersion] = useState(version.version)

  // The parent passed another version (history, re-analysis): start over from it.
  // After our own save `base` is already that version, so the refetch changes nothing.
  if (version.version !== propVersion) {
    setPropVersion(version.version)
    if (version.version !== base.version) {
      setBase(version)
      setDraft(content(version))
      setJustSaved(false)
    }
  }

  return {
    base,
    draft,
    dirty: JSON.stringify(draft) !== JSON.stringify(content(base)),
    justSaved,
    edit: (update: (d: D) => D) => {
      setDraft(update)
      setJustSaved(false)
    },
    saved: (v: V) => {
      setBase(v)
      setDraft(content(v))
      setJustSaved(true)
    },
    discard: () => setDraft(content(base)),
  }
}

/** Lets a page save an editor from its own button (page 3: "Lưu và tạo kế hoạch"). */
export interface VersionedEditorHandle {
  /** Save pending edits, if any. Resolves to the version now shown, or null if saving failed. */
  save: () => Promise<number | null>
}
