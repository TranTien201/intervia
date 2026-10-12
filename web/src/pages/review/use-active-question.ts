import { useCallback, useEffect, useRef, useState } from 'react'
import { questionAnchor } from './transcript-blocks'

/** A question counts as "being read" once its top passes this line (px from the viewport top). */
const READING_LINE_PX = 120
/** How close to the bottom counts as "at the end": the last questions may never reach the line. */
const NEAR_BOTTOM_PX = 8

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * The question being read on page 6, from the scroll position: the last one whose top passed the
 * reading line, or the last one at the end of the page. `jump` scrolls to a question and moves
 * focus there (for keyboard and screen reader users). It keeps the jumped-to question marked until
 * the user scrolls by hand, so a short question near the end is not overridden by its neighbour.
 */
export function useActiveQuestion(indices: number[]) {
  const [active, setActive] = useState<number | null>(null)
  const pinned = useRef<number | null>(null)

  useEffect(() => {
    if (indices.length === 0) return
    let frame = 0
    const update = () => {
      frame = 0
      if (pinned.current !== null) return setActive(pinned.current)
      const atEnd =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - NEAR_BOTTOM_PX
      let current = indices[0]!
      for (const i of indices) {
        const el = document.getElementById(questionAnchor(i))
        if (el && el.getBoundingClientRect().top <= READING_LINE_PX) current = i
      }
      setActive(atEnd && window.scrollY > 0 ? indices.at(-1)! : current)
    }
    const onScroll = () => {
      frame ||= requestAnimationFrame(update)
    }
    // Any scrolling by hand releases a jump.
    const release = () => {
      pinned.current = null
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    window.addEventListener('wheel', release, { passive: true })
    window.addEventListener('touchstart', release, { passive: true })
    window.addEventListener('keydown', release)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('wheel', release)
      window.removeEventListener('touchstart', release)
      window.removeEventListener('keydown', release)
    }
  }, [indices])

  const jump = useCallback((index: number) => {
    const el = document.getElementById(questionAnchor(index))
    if (!el) return
    pinned.current = index
    setActive(index)
    // jsdom has no scrollIntoView.
    el.scrollIntoView?.({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
    el.focus({ preventScroll: true })
  }, [])

  return { active, jump }
}
