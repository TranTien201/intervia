import { setupWorker } from 'msw/browser'
import { HttpHandler, type RequestHandler } from 'msw'
import * as db from './db'
import { handlers } from './handlers'
import { isRealApiPath, parseRealApi } from './real-api'

/**
 * API groups the real backend already serves, from `VITE_REAL_API` (comma-separated, e.g. `auth,cvs`).
 * Their mock handlers are dropped so those requests pass through to the backend via the Vite
 * proxy; everything else stays mocked until the backend catches up.
 */
const REAL_API = parseRealApi(import.meta.env.VITE_REAL_API)

const mocked = (h: RequestHandler) =>
  !(
    h instanceof HttpHandler &&
    typeof h.info.path === 'string' &&
    isRealApiPath(h.info.path, REAL_API)
  )

export const worker = setupWorker(...handlers.filter(mocked))

declare global {
  interface Window {
    /** Dev helpers for the mock API, e.g. `__mock.setFlags({ network: true })`. */
    __mock: {
      reset: (empty?: boolean) => void
      flags: () => db.MockFlags
      setFlags: (patch: Partial<db.MockFlags>) => void
    }
  }
}

window.__mock = { reset: db.reset, flags: db.mockFlags, setFlags: db.setMockFlags }
