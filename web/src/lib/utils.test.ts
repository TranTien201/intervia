import { bytesLabel, relativeDay, shortDate } from './format'
import { cn } from './utils'

describe('cn', () => {
  it('keeps custom font sizes next to text colors', () => {
    expect(cn('text-page-title text-ink')).toBe('text-page-title text-ink')
  })
  it('still merges conflicting colors', () => {
    expect(cn('text-ink text-ink2')).toBe('text-ink2')
  })
})

describe('shortDate', () => {
  it('uses dd/mm in local time', () => {
    expect(shortDate(new Date(2026, 9, 8, 23, 30).toISOString())).toBe('08/10')
  })
})

describe('relativeDay', () => {
  const now = new Date(2026, 9, 12, 9, 0)
  const at = (d: number, h = 12) => new Date(2026, 9, d, h).toISOString()
  it('counts local calendar days', () => {
    expect(relativeDay(at(12, 1), now)).toBe('hôm nay')
    expect(relativeDay(at(11, 23), now)).toBe('hôm qua')
    expect(relativeDay(at(9), now)).toBe('3 ngày trước')
  })
  it('falls back to the full date after a week', () => {
    expect(relativeDay(at(2), now)).toBe('02/10/2026')
  })
})

describe('bytesLabel', () => {
  it('reads like a file size', () => {
    expect(bytesLabel(0)).toBe('0 MB')
    expect(bytesLabel(850 * 1024)).toBe('850 KB')
    expect(bytesLabel(3.46 * 1024 * 1024)).toBe('3,5 MB')
    expect(bytesLabel(120 * 1024 * 1024)).toBe('120 MB')
    expect(bytesLabel(1.2 * 1024 ** 3)).toBe('1,2 GB')
  })
})
