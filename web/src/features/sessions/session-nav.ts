import type { SessionSummary } from '@/api/types'
import { fullDate, LEVEL_LABEL } from '@/lib/format'

/** Page to open for a session, from the step the API reports (docs/design/ui-pages.md §2). */
export const sessionPath = (s: Pick<SessionSummary, 'id' | 'step'>) => `/sessions/${s.id}/${s.step}`

/**
 * Page 2 prefilled from a session: same CV, JD, role, level. `replace` opens the upload /
 * paste option for that side instead ("Tải file khác"). Always creates a new session.
 */
export function newSessionPath(
  s: Pick<SessionSummary, 'cv' | 'jd' | 'role' | 'level'>,
  replace?: 'cv' | 'jd',
) {
  const params = new URLSearchParams({
    cv: replace === 'cv' ? 'new' : s.cv.id,
    jd: replace === 'jd' ? 'new' : s.jd.id,
    role: s.role.id,
    level: s.level,
  })
  return `/sessions/new?${params}`
}

/** "Backend Engineer · Mid". Sessions cannot be named. */
export const sessionLabel = (s: Pick<SessionSummary, 'role' | 'level'>) =>
  `${s.role.name} · ${LEVEL_LABEL[s.level]}`

/** "Backend Engineer · Mid · 10/10/2026" */
export const sessionFullLabel = (s: Pick<SessionSummary, 'role' | 'level' | 'created_at'>) =>
  `${sessionLabel(s)} · ${fullDate(s.created_at)}`

export interface SessionGroup {
  label: string
  sessions: SessionSummary[]
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Group by creation time: today (local calendar day), the 7 days before, older.
 * Keeps the input order inside each group; empty groups are dropped.
 */
export function groupSessionsByDate(sessions: SessionSummary[], now = new Date()): SessionGroup[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const weekStart = startOfToday - 7 * DAY_MS
  const today: SessionSummary[] = []
  const week: SessionSummary[] = []
  const older: SessionSummary[] = []
  for (const s of sessions) {
    const t = new Date(s.created_at).getTime()
    ;(t >= startOfToday ? today : t >= weekStart ? week : older).push(s)
  }
  return [
    { label: 'Hôm nay', sessions: today },
    { label: '7 ngày qua', sessions: week },
    { label: 'Cũ hơn', sessions: older },
  ].filter((g) => g.sessions.length > 0)
}
