import type { Level, Mode } from '@/api/types'

export const LEVEL_LABEL: Record<Level, string> = { junior: 'Junior', mid: 'Mid', senior: 'Senior' }

export const MODE_LABEL: Record<Mode, string> = {
  text: 'Text',
  voice_text: 'Nói → Chữ',
  voice_voice: 'Nói → Nói',
}

/** "Câu 4/~12": the plan is an estimate, hence "~". */
export const progressLabel = ({ asked, planned }: { asked: number; planned: number }) =>
  `Câu ${asked}/~${planned}`

/** "1:24": media time. */
export const clockLabel = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "24 phút", "1 giờ 5 phút", "dưới 1 phút". */
export function durationLabel(seconds: number) {
  const minutes = Math.round(seconds / 60)
  if (minutes < 1) return 'dưới 1 phút'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h === 0 ? `${m} phút` : m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`
}

const fullDateFmt = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const pad = (n: number) => String(n).padStart(2, '0')

/** "08/10". Built by hand: Chrome formats vi-VN day+month as "08-10". */
export const shortDate = (iso: string) => {
  const d = new Date(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}
/** "08/10/2026" */
export const fullDate = (iso: string) => fullDateFmt.format(new Date(iso))

/** "hôm nay", "hôm qua", "3 ngày trước" (local calendar days), then "08/10/2026". */
export function relativeDay(iso: string, now = new Date()) {
  const d = new Date(iso)
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(d)) / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'hôm nay'
  if (days === 1) return 'hôm qua'
  if (days < 7) return `${days} ngày trước`
  return fullDate(iso)
}

/** "0 MB", "850 KB", "120 MB", "1,2 GB" (vi-VN decimal comma). */
export function bytesLabel(bytes: number) {
  if (bytes <= 0) return '0 MB'
  const units = ['KB', 'MB', 'GB'] as const
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const digits = value < 10 && unit > 0 ? 1 : 0
  return `${value.toLocaleString('vi-VN', { maximumFractionDigits: digits })} ${units[unit]}`
}
