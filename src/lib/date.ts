export const MONTH_NAMES = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
]

export function todayISO(): string {
  return toISO(new Date())
}

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7)
}

export function currentMonth(): string {
  return todayISO().slice(0, 7)
}

/** '2026-09' -> 'Tháng 9, 2026' */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-')
  return `${MONTH_NAMES[Number(m) - 1]}, ${y}`
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`
}

/** Khoang ngay [start, end] cua ky ke toan bat dau tu `startDay` */
export function monthRange(month: string, startDay = 1): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  if (startDay <= 1) {
    const last = new Date(y, m, 0).getDate()
    return { start: `${month}-01`, end: `${month}-${`${last}`.padStart(2, '0')}` }
  }
  const start = new Date(y, m - 1, startDay)
  const end = new Date(y, m, startDay - 1)
  return { start: toISO(start), end: toISO(end) }
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function formatDateLong(iso: string): string {
  const today = todayISO()
  if (iso === today) return 'Hôm nay'
  const d = new Date(iso + 'T00:00:00')
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (iso === toISO(yesterday)) return 'Hôm qua'
  const weekday = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][d.getDay()]
  return `${weekday}, ${formatDate(iso)}`
}
