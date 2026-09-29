import type { DayMark, Transaction } from '../types'
import { toISO, todayISO } from './date'

export interface Coverage {
  /** cac ngay chua co giao dich va cung chua duoc danh dau 'khong chi tieu' */
  gaps: string[]
  /** tong so ngay trong cua so dang xet */
  window: number
  /** ty le ngay da co du lieu, 0..1 */
  ratio: number
  /** so ngay trong lien tiep tinh nguoc tu hom qua */
  currentGapStreak: number
}

/**
 * Do "do phu du lieu" thay cho streak.
 * Mot ngay duoc coi la co du lieu khi co giao dich HOAC da duoc danh dau khong chi tieu.
 * Hom nay khong tinh la thieu — ngay con chua ket thuc.
 */
export function computeCoverage(
  transactions: Transaction[],
  dayMarks: DayMark[],
  windowDays: number,
  firstActivityDate?: string,
): Coverage {
  // Chua tung ghi gi thi khong co gi de "bo sot" — nguoi moi cai app khong the
  // dang no 13 ngay. Khong co dong nay thi man hinh dau tien da trach nguoi dung.
  if (transactions.length === 0 && dayMarks.length === 0) {
    return { gaps: [], window: 0, ratio: 1, currentGapStreak: 0 }
  }

  const today = todayISO()
  const covered = new Set<string>()
  for (const t of transactions) covered.add(t.date)
  for (const m of dayMarks) covered.add(m.date)

  const days: string[] = []
  const cursor = new Date()
  for (let i = 0; i < windowDays; i++) {
    cursor.setTime(Date.now())
    cursor.setDate(cursor.getDate() - i)
    days.push(toISO(cursor))
  }

  // Khong tinh cac ngay truoc khi nguoi dung bat dau dung app
  const start = firstActivityDate ?? days[days.length - 1]
  const relevant = days.filter((d) => d >= start && d !== today)

  const gaps = relevant.filter((d) => !covered.has(d))
  const window = relevant.length

  let currentGapStreak = 0
  for (const d of relevant) {
    if (covered.has(d)) break
    currentGapStreak++
  }

  return {
    gaps,
    window,
    ratio: window === 0 ? 1 : (window - gaps.length) / window,
    currentGapStreak,
  }
}

/** Ngay som nhat co dau vet su dung, de khong tinh thieu nhung ngay truoc do */
export function firstActivity(transactions: Transaction[], dayMarks: DayMark[]): string | undefined {
  let min: string | undefined
  for (const t of transactions) if (!min || t.date < min) min = t.date
  for (const m of dayMarks) if (!min || m.date < min) min = m.date
  return min
}
