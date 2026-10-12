import { useCallback, useState } from 'react'

const STORAGE_KEY = 'intervia.sidebar.collapsed'

// Storage can throw (private mode, blocked site data); the sidebar then just starts expanded.
function readCollapsed(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    // Not persisted; the choice still applies until reload.
  }
}

/** Desktop sidebar collapsed to an icon strip, remembered across reloads (UI-3.3). */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggle = useCallback(() => {
    const next = !collapsed
    setCollapsed(next)
    writeCollapsed(next)
  }, [collapsed])
  return [collapsed, toggle] as const
}
