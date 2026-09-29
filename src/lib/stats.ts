import type { Category, Id, Transaction, TxKind, Wallet } from '../types'
import { daysInMonth, shiftMonth } from './date'

export interface Totals {
  income: number
  expense: number
  net: number
}

/**
 * Chuyen tien giua hai vi khong phai thu cung khong phai chi — tien chi doi
 * cho. Moi phep tinh tong deu phai loai chung ra, khong thi tong thu va tong
 * chi cung phong len dung bang so tien vua chuyen.
 */
export function isTransfer(t: Transaction): boolean {
  return t.transferId !== undefined
}

/** Bo cac ban ghi chuyen tien khoi mot danh sach truoc khi tinh tong */
export function spendable(txs: Transaction[]): Transaction[] {
  return txs.filter((t) => !isTransfer(t))
}

export function sumTotals(txs: Transaction[]): Totals {
  let income = 0
  let expense = 0
  for (const t of txs) {
    if (isTransfer(t)) continue
    if (t.kind === 'income') income += t.amount
    else expense += t.amount
  }
  return { income, expense, net: income - expense }
}

export function inRange(txs: Transaction[], start: string, end: string): Transaction[] {
  return txs.filter((t) => t.date >= start && t.date <= end)
}

/** So du hien tai cua tung vi = so du dau + thu - chi (tinh tren toan bo lich su) */
/** So du tinh tren TOAN BO giao dich, ke ca chuyen tien — tien co doi vi that */
export function walletBalances(wallets: Wallet[], txs: Transaction[]): Map<Id, number> {
  const map = new Map<Id, number>()
  for (const w of wallets) map.set(w.id, w.openingBalance)
  for (const t of txs) {
    const cur = map.get(t.walletId)
    if (cur === undefined) continue
    map.set(t.walletId, cur + (t.kind === 'income' ? t.amount : -t.amount))
  }
  return map
}

export interface CategorySlice {
  category: Category
  amount: number
  share: number
  count: number
}

export function byCategory(txs: Transaction[], categories: Category[], kind: TxKind): CategorySlice[] {
  const catById = new Map(categories.map((c) => [c.id, c]))
  const acc = new Map<Id, { amount: number; count: number }>()
  let total = 0
  for (const t of txs) {
    if (t.kind !== kind || isTransfer(t)) continue
    const cur = acc.get(t.categoryId) ?? { amount: 0, count: 0 }
    cur.amount += t.amount
    cur.count += 1
    acc.set(t.categoryId, cur)
    total += t.amount
  }
  const unknown: Category = { id: 'missing', name: '(đã xoá)', kind, icon: '❓', color: '#94a3b8', updatedAt: 0 }
  return [...acc.entries()]
    .map(([id, v]) => ({
      category: catById.get(id) ?? unknown,
      amount: v.amount,
      count: v.count,
      share: total > 0 ? v.amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
}

export interface DayPoint {
  date: string
  day: number
  income: number
  expense: number
}

/** Chuoi theo tung ngay trong thang, bao gom ca ngay khong co giao dich */
export function dailySeries(txs: Transaction[], month: string): DayPoint[] {
  const n = daysInMonth(month)
  const points: DayPoint[] = Array.from({ length: n }, (_, i) => ({
    date: `${month}-${`${i + 1}`.padStart(2, '0')}`,
    day: i + 1,
    income: 0,
    expense: 0,
  }))
  for (const t of txs) {
    if (!t.date.startsWith(month) || isTransfer(t)) continue
    const idx = Number(t.date.slice(8, 10)) - 1
    const p = points[idx]
    if (!p) continue
    if (t.kind === 'income') p.income += t.amount
    else p.expense += t.amount
  }
  return points
}

export interface MonthPoint {
  month: string
  income: number
  expense: number
}

/** `count` thang gan nhat, ket thuc o `endMonth` */
export function monthlySeries(txs: Transaction[], endMonth: string, count: number): MonthPoint[] {
  const months: MonthPoint[] = []
  for (let i = count - 1; i >= 0; i--) {
    months.push({ month: shiftMonth(endMonth, -i), income: 0, expense: 0 })
  }
  const idx = new Map(months.map((m, i) => [m.month, i]))
  for (const t of txs) {
    if (isTransfer(t)) continue
    const i = idx.get(t.date.slice(0, 7))
    if (i === undefined) continue
    if (t.kind === 'income') months[i].income += t.amount
    else months[i].expense += t.amount
  }
  return months
}
