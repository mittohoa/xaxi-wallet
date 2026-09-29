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

/* ---------------- so sánh với kỳ trước ---------------- */

export interface Range {
  start: string
  end: string
}

/**
 * Cắt kỳ trước cho khớp số ngày đã trôi qua của kỳ này.
 *
 * Nếu so tháng này — mới đi được mười hai ngày — với CẢ tháng trước thì
 * con số luôn ra "giảm mạnh", mọi tháng, với mọi người dùng. Một con số
 * luôn sai theo cùng một hướng còn tệ hơn là không có con số nào: nó dạy
 * người dùng bỏ qua chỗ đó.
 *
 * Kỳ này đã đi được bao nhiêu ngày thì kỳ trước cũng chỉ lấy bấy nhiêu.
 */
export function comparableRange(current: Range, previous: Range, today: string): Range {
  // Kỳ này đã qua hẳn thì lấy trọn kỳ trước. Không được đếm ngày rồi dời sang,
  // vì tháng dài ngắn khác nhau: 29 ngày của tháng 9 dời sang tháng 8 sẽ dừng ở
  // ngày 30 và bỏ mất ngày 31.
  if (today >= current.end) return previous

  const day = 86_400_000
  const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
  const elapsed = Math.max(0, Math.round((at(today) - at(current.start)) / day))
  const end = new Date(at(previous.start) + elapsed * day).toISOString().slice(0, 10)
  return { start: previous.start, end: end < previous.end ? end : previous.end }
}

/**
 * Phần trăm thay đổi, hoặc null khi không so được.
 *
 * Trả về null khi kỳ trước bằng 0: chia cho không thì ra vô cực, mà hiển
 * thị "+∞%" hay "+100%" đều là bịa. Không có gì để so thì nói thẳng là
 * không có gì để so.
 */
export function percentChange(now: number, before: number): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null
  return ((now - before) / before) * 100
}

/* ---------------- chi cố định và chi biến đổi ---------------- */

export interface FixedSplit {
  /** khoản do quy tắc định kỳ tự sinh ra */
  fixed: number
  /** khoản người dùng chủ động ghi */
  variable: number
  /** tỉ lệ cố định trên tổng, 0–1; bằng 0 khi chưa chi gì */
  share: number
}

/**
 * Tách chi tiêu thành phần cố định và phần biến đổi.
 *
 * Con số này đổi cách người ta nghĩ về chính chi tiêu của mình: phần cố định
 * không cắt được bằng ý chí — tiền nhà không giảm vì hôm nay quyết tâm tiết
 * kiệm. Biết tỉ lệ mới biết còn bao nhiêu chỗ để xoay.
 *
 * Không đòi nhập thêm gì: `source === 'recurring'` đã phân sẵn từ lúc ghi.
 */
export function fixedSplit(txs: Transaction[]): FixedSplit {
  let fixed = 0
  let variable = 0
  for (const t of txs) {
    if (t.kind !== 'expense' || isTransfer(t)) continue
    if (t.source === 'recurring') fixed += t.amount
    else variable += t.amount
  }
  const total = fixed + variable
  return { fixed, variable, share: total > 0 ? fixed / total : 0 }
}

/* ---------------- chi theo thứ trong tuần ---------------- */

export interface WeekdayPoint {
  /** 0 = Chủ nhật … 6 = Thứ bảy */
  day: number
  amount: number
  count: number
}

/**
 * Tổng chi theo thứ trong tuần.
 *
 * Đọc ngày bằng giờ UTC chứ không phải giờ máy: chuỗi 'YYYY-MM-DD' không mang
 * múi giờ, và `new Date('2026-09-29')` ở múi giờ âm sẽ lùi về ngày hôm trước —
 * đủ để cả biểu đồ lệch đi một thứ.
 */
export function byWeekday(txs: Transaction[]): WeekdayPoint[] {
  const out: WeekdayPoint[] = Array.from({ length: 7 }, (_, day) => ({ day, amount: 0, count: 0 }))
  for (const t of txs) {
    if (t.kind !== 'expense' || isTransfer(t)) continue
    const day = new Date(`${t.date}T00:00:00Z`).getUTCDay()
    out[day].amount += t.amount
    out[day].count++
  }
  return out
}

/** Thứ tiêu nhiều nhất, hoặc null khi chưa đủ dữ liệu để nói điều gì */
export function heaviestWeekday(txs: Transaction[], minCount = 14): WeekdayPoint | null {
  const days = byWeekday(txs)
  const total = days.reduce((s, d) => s + d.count, 0)
  // Dưới hai tuần dữ liệu thì "thứ bảy tiêu nhiều nhất" chỉ là một bữa nhậu
  if (total < minCount) return null

  const top = days.reduce((a, b) => (b.amount > a.amount ? b : a))
  const average = days.reduce((s, d) => s + d.amount, 0) / 7
  // Phải nhô lên rõ rệt mới đáng nói; nhỉnh hơn một chút thì là ngẫu nhiên
  return top.amount > average * 1.3 ? top : null
}
