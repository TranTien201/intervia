import type { SessionSummary } from '@/api/types'
import { groupSessionsByDate, sessionLabel, sessionPath } from './session-nav'

const at = (id: string, created_at: string) =>
  ({ id, created_at, role: { id: 'be', name: 'Backend' }, level: 'mid' }) as SessionSummary

describe('groupSessionsByDate', () => {
  const now = new Date(2026, 9, 12, 9, 0) // 12/10/2026 09:00 local

  it('splits into today / last 7 days / older and drops empty groups', () => {
    const groups = groupSessionsByDate(
      [
        at('a', new Date(2026, 9, 12, 0, 5).toISOString()), // today, just after midnight
        at('b', new Date(2026, 9, 11, 23, 59).toISOString()), // yesterday
        at('c', new Date(2026, 9, 5, 0, 0).toISOString()), // exactly 7 days before today
        at('d', new Date(2026, 9, 4, 23, 59).toISOString()), // older
      ],
      now,
    )
    expect(groups.map((g) => [g.label, g.sessions.map((s) => s.id)])).toEqual([
      ['Hôm nay', ['a']],
      ['7 ngày qua', ['b', 'c']],
      ['Cũ hơn', ['d']],
    ])
  })

  it('returns no groups for no sessions', () => {
    expect(groupSessionsByDate([], now)).toEqual([])
  })
})

describe('session helpers', () => {
  it('builds label and path from the reported step', () => {
    const s = { ...at('s1', ''), step: 'plan' } as SessionSummary
    expect(sessionLabel(s)).toBe('Backend · Mid')
    expect(sessionPath(s)).toBe('/sessions/s1/plan')
  })
})
