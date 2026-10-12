import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/** How close to the bottom still counts as "reading the latest line". */
const NEAR_BOTTOM_PX = 80

const isNearBottom = () =>
  window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - NEAR_BOTTOM_PX

const scrollToBottom = () => window.scrollTo({ top: document.documentElement.scrollHeight })

/**
 * Keep the window scrolled to the latest line while new text arrives, unless the user scrolled
 * up to read an older line. Then `hasNew` turns on (for the "↓ Mới nhất" button) and `jump`
 * goes back down and follows again. `change` is any value that changes with new content.
 */
export function useFollowLatest(change: unknown) {
  const following = useRef(true)
  const [hasNew, setHasNew] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      following.current = isNearBottom()
      if (following.current) setHasNew(false)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Before paint, so following text does not flicker one frame above the fold.
  useLayoutEffect(() => {
    if (following.current) scrollToBottom()
    else setHasNew(true)
  }, [change])

  const jump = useCallback(() => {
    following.current = true
    setHasNew(false)
    scrollToBottom()
  }, [])

  return { hasNew, jump }
}
