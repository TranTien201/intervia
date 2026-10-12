import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { reset } from '@/mocks/db'
import { server } from '@/mocks/node'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  reset()
  // Answer drafts of page 5 (src/lib/answer-draft.ts).
  const store = globalThis.localStorage
  if (store)
    for (const k of Object.keys(store)) if (k.startsWith('intervia.draft.')) store.removeItem(k)
})
afterAll(() => server.close())

// jsdom has no ResizeObserver; Radix (e.g. RadioGroup) measures elements with it.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom does not implement scrolling; the interview page scrolls the window to the latest line.
if (typeof window !== 'undefined') window.scrollTo = () => {}
