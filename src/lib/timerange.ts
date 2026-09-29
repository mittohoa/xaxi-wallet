/**
 * Doc khoang thoi gian tu ngon ngu tu nhien tieng Viet.
 * Tach rieng khoi bo truy van de test duoc doc lap va de mo rong.
 */
import { MONTH_NAMES, toISO, todayISO } from './date'

export interface TimeRange {
  start: string
  end: string
  label: string
  /** khoang lien truoc do cung do dai, dung khi nguoi dung hoi 'so voi ky truoc' */
  previous?: { start: string; end: string; label: string }
}

function shift(days: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d
}

function monthBounds(year: number, month1: number) {
  const start = new Date(year, month1 - 1, 1)
  const end = new Date(year, month1, 0)
  return { start: toISO(start), end: toISO(end) }
}

/** Tuan bat dau thu Hai, theo thoi quen Viet Nam */
function weekBounds(offsetWeeks: number) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const dayFromMonday = (now.getDay() + 6) % 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - dayFromMonday + offsetWeeks * 7)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: toISO(monday), end: toISO(sunday) }
}

/**
 * Tim cum chi thoi gian trong cau da duoc chuan hoa (bo dau, chu thuong).
 * Tra ve khoang va phan van ban con lai sau khi cat cum do ra.
 */
export function extractTimeRange(folded: string): { range: TimeRange; rest: string } | null {
  const take = (matched: string, range: Omit<TimeRange, 'label'> & { label: string }) => ({
    range,
    rest: folded.replace(matched, ' ').replace(/\s+/g, ' ').trim(),
  })

  if (/\bhom nay\b|\bhnay\b/.test(folded)) {
    const d = todayISO()
    const y = toISO(shift(-1))
    return take(/\bhom nay\b|\bhnay\b/.exec(folded)![0], {
      start: d,
      end: d,
      label: 'hôm nay',
      previous: { start: y, end: y, label: 'hôm qua' },
    })
  }

  if (/\bhom qua\b|\bhqua\b/.test(folded)) {
    const y = toISO(shift(-1))
    const dayBefore = toISO(shift(-2))
    return take(/\bhom qua\b|\bhqua\b/.exec(folded)![0], {
      start: y,
      end: y,
      label: 'hôm qua',
      previous: { start: dayBefore, end: dayBefore, label: 'hôm kia' },
    })
  }

  if (/\btuan nay\b/.test(folded)) {
    const cur = weekBounds(0)
    const prev = weekBounds(-1)
    return take('tuan nay', { ...cur, label: 'tuần này', previous: { ...prev, label: 'tuần trước' } })
  }

  if (/\btuan truoc\b/.test(folded)) {
    const cur = weekBounds(-1)
    const prev = weekBounds(-2)
    return take('tuan truoc', { ...cur, label: 'tuần trước', previous: { ...prev, label: 'tuần trước nữa' } })
  }

  if (/\bthang nay\b/.test(folded)) {
    const now = new Date()
    const cur = monthBounds(now.getFullYear(), now.getMonth() + 1)
    const p = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prev = monthBounds(p.getFullYear(), p.getMonth() + 1)
    return take('thang nay', {
      ...cur,
      label: `tháng ${now.getMonth() + 1}`,
      previous: { ...prev, label: `tháng ${p.getMonth() + 1}` },
    })
  }

  if (/\bthang truoc\b/.test(folded)) {
    const now = new Date()
    const p = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const pp = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    const cur = monthBounds(p.getFullYear(), p.getMonth() + 1)
    const prev = monthBounds(pp.getFullYear(), pp.getMonth() + 1)
    return take('thang truoc', {
      ...cur,
      label: `tháng ${p.getMonth() + 1}`,
      previous: { ...prev, label: `tháng ${pp.getMonth() + 1}` },
    })
  }

  if (/\bnam nay\b/.test(folded)) {
    const y = new Date().getFullYear()
    return take('nam nay', {
      start: `${y}-01-01`,
      end: `${y}-12-31`,
      label: `năm ${y}`,
      previous: { start: `${y - 1}-01-01`, end: `${y - 1}-12-31`, label: `năm ${y - 1}` },
    })
  }

  // 'N ngay qua' / 'N ngay gan nhat'
  const lastDays = folded.match(/\b(\d{1,3}) ngay (?:qua|gan nhat|vua roi)\b/)
  if (lastDays) {
    const n = Number(lastDays[1])
    return take(lastDays[0], {
      start: toISO(shift(-(n - 1))),
      end: todayISO(),
      label: `${n} ngày qua`,
      previous: { start: toISO(shift(-(2 * n - 1))), end: toISO(shift(-n)), label: `${n} ngày trước đó` },
    })
  }

  // 'thang 8' hoac 'thang 8/2025'
  const namedMonth = folded.match(/\bthang (\d{1,2})(?:[/ ](\d{4}))?\b/)
  if (namedMonth) {
    const m = Number(namedMonth[1])
    if (m >= 1 && m <= 12) {
      const now = new Date()
      let year = namedMonth[2] ? Number(namedMonth[2]) : now.getFullYear()
      // khong ghi nam ma thang o tuong lai -> hieu la nam ngoai
      if (!namedMonth[2] && m > now.getMonth() + 1) year -= 1
      const cur = monthBounds(year, m)
      const p = new Date(year, m - 2, 1)
      const prev = monthBounds(p.getFullYear(), p.getMonth() + 1)
      return take(namedMonth[0], {
        ...cur,
        label: `${MONTH_NAMES[m - 1]}/${year}`,
        previous: { ...prev, label: `${MONTH_NAMES[p.getMonth()]}/${p.getFullYear()}` },
      })
    }
  }

  return null
}

/** Khoang mac dinh khi cau hoi khong noi ro thoi gian: thang hien tai */
export function defaultRange(): TimeRange {
  const now = new Date()
  const cur = monthBounds(now.getFullYear(), now.getMonth() + 1)
  const p = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prev = monthBounds(p.getFullYear(), p.getMonth() + 1)
  return {
    ...cur,
    label: `tháng ${now.getMonth() + 1}`,
    previous: { ...prev, label: `tháng ${p.getMonth() + 1}` },
  }
}
