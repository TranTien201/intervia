import { useCallback, useEffect, useRef, useState } from 'react'
import { NetworkError } from '@/api/client'

/** How often to try the server again while offline. */
export const RECONNECT_MS = 3000

/**
 * Whether page 5 can reach the server. Goes offline on the browser's `offline` event or when a
 * request fails with `NetworkError` (`report`). While offline it probes the server every
 * `RECONNECT_MS` (and right away on the browser's `online` event); the first probe the server
 * answers, even with an error, means it is back: `onBack` resyncs the page.
 */
export function useConnection(probe: () => Promise<unknown>, onBack: () => void) {
  const [offline, setOffline] = useState(() => globalThis.navigator?.onLine === false)
  const latest = useRef({ probe, onBack })
  useEffect(() => {
    latest.current = { probe, onBack }
  })

  const report = useCallback((err?: unknown) => {
    if (err === undefined || err instanceof NetworkError) setOffline(true)
  }, [])

  useEffect(() => {
    const goOffline = () => setOffline(true)
    window.addEventListener('offline', goOffline)
    return () => window.removeEventListener('offline', goOffline)
  }, [])

  useEffect(() => {
    if (!offline) return
    let done = false
    const tryNow = async () => {
      try {
        await latest.current.probe()
      } catch (err) {
        if (err instanceof NetworkError) return
      }
      if (done) return
      done = true
      setOffline(false)
      latest.current.onBack()
    }
    const timer = setInterval(() => void tryNow(), RECONNECT_MS)
    const onOnline = () => void tryNow()
    window.addEventListener('online', onOnline)
    return () => {
      done = true
      clearInterval(timer)
      window.removeEventListener('online', onOnline)
    }
  }, [offline])

  return { offline, report }
}
