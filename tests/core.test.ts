import assert from 'node:assert/strict'
import test from 'node:test'

import { configureFormat, formatCompact, formatMoney, parseAmount } from '../src/lib/format'
import { monthRange, shiftMonth, toISO } from '../src/lib/date'
import { parseQuickEntry } from '../src/lib/quickadd'
import { parseReceipt } from '../src/lib/receipt'
import { parseCSV, parseStatement } from '../src/lib/statement'
import { computeCoverage } from '../src/lib/coverage'
import { advance, firstDueDate } from '../src/lib/recurring'
import { byCategory, dailySeries, monthlySeries, sumTotals, walletBalances } from '../src/lib/stats'
import { suggestShortcuts } from '../src/lib/actions'
import type { Category, Recurring, Transaction, Wallet } from '../src/types'

configureFormat('vi-VN', 'VND')

const CATEGORIES: Category[] = [
  { id: 1, name: 'Ăn uống', kind: 'expense', icon: '🍜', color: '#eb6834', keywords: ['ca phe', 'an trua', 'com'] },
  { id: 2, name: 'Đi lại', kind: 'expense', icon: '🛵', color: '#2a78d6', keywords: ['xang', 'grab'] },
  { id: 3, name: 'Chi khác', kind: 'expense', icon: '📦', color: '#898781', builtin: true, slug: 'uncategorized-expense' },
  { id: 4, name: 'Lương', kind: 'income', icon: '💼', color: '#2a78d6', keywords: ['luong'] },
]

const WALLETS: Wallet[] = [
  { id: 1, name: 'Tiền mặt', kind: 'cash', icon: '👛', color: '#1baf7a', openingBalance: 500_000 },
  { id: 2, name: 'Ngân hàng', kind: 'bank', icon: '🏦', color: '#2a78d6', openingBalance: 2_000_000 },
]

function tx(partial: Partial<Transaction> & Pick<Transaction, 'kind' | 'amount' | 'date'>): Transaction {
  return {
    categoryId: 1,
    walletId: 1,
    createdAt: 1,
    ...partial,
  } as Transaction
}

const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toISO(d)
}

/* ---------------- so tien ---------------- */

test('parseAmount đọc được cách gõ tắt của người Việt', () => {
  assert.equal(parseAmount('35k'), 35_000)
  assert.equal(parseAmount('1.200.000'), 1_200_000)
  assert.equal(parseAmount('1,2tr'), 1_200_000)
  assert.equal(parseAmount('2tr'), 2_000_000)
  assert.equal(parseAmount('3 ty'.replace(' ', '')), 3_000_000_000)
  assert.equal(parseAmount('50 000'.replace(' ', '')), 50_000)
  assert.ok(Number.isNaN(parseAmount('abc')))
  assert.ok(Number.isNaN(parseAmount('')))
})

test('formatMoney và formatCompact dùng định dạng VND không phần lẻ', () => {
  assert.match(formatMoney(1_200_000), /1\.200\.000/)
  assert.equal(formatCompact(1_200_000), '1.2tr')
  assert.equal(formatCompact(850_000), '850k')
  assert.equal(formatCompact(0), '0')
})

/* ---------------- ngay thang ---------------- */

test('monthRange tôn trọng ngày bắt đầu kỳ tuỳ chỉnh', () => {
  assert.deepEqual(monthRange('2026-02', 1), { start: '2026-02-01', end: '2026-02-28' })
  assert.deepEqual(monthRange('2026-09', 25), { start: '2026-09-25', end: '2026-10-24' })
})

test('shiftMonth vượt qua ranh giới năm', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
})

/* ---------------- nhap nhanh ---------------- */

test('parseQuickEntry tách được số tiền và danh mục theo từ khoá', () => {
  const r = parseQuickEntry('cà phê 35k', CATEGORIES, [])
  assert.ok(r)
  assert.equal(r.amount, 35_000)
  assert.equal(r.kind, 'expense')
  assert.equal(r.categoryId, 1)
  assert.equal(r.reason, 'keyword')
  assert.equal(r.note, 'cà phê')
})

test('parseQuickEntry hiểu "hôm qua" và dấu + cho khoản thu', () => {
  const r = parseQuickEntry('xăng 100k hôm qua', CATEGORIES, [])
  assert.ok(r)
  assert.equal(r.amount, 100_000)
  assert.equal(r.date, daysAgo(1))
  assert.equal(r.categoryId, 2)

  const income = parseQuickEntry('+15tr lương tháng 9', CATEGORIES, [])
  assert.ok(income)
  assert.equal(income.kind, 'income')
  assert.equal(income.amount, 15_000_000)
  assert.equal(income.categoryId, 4)
})

test('parseQuickEntry ưu tiên thói quen đã có hơn từ khoá', () => {
  const history: Transaction[] = [
    tx({ kind: 'expense', amount: 30_000, date: '2026-09-01', categoryId: 2, note: 'cà phê', createdAt: 10 }),
  ]
  const r = parseQuickEntry('cà phê 35k', CATEGORIES, history)
  assert.ok(r)
  assert.equal(r.categoryId, 2, 'phải dùng danh mục người dùng từng chọn')
  assert.equal(r.reason, 'history')
})

test('parseQuickEntry trả null khi không có số tiền', () => {
  assert.equal(parseQuickEntry('cà phê', CATEGORIES, []), null)
  assert.equal(parseQuickEntry('   ', CATEGORIES, []), null)
})

/* ---------------- bien lai ---------------- */

test('parseReceipt đọc tin nhắn biến động số dư kiểu ngân hàng', () => {
  const r = parseReceipt('TK 0123456789 -45,000VND luc 12/09/2026 08:30. So du: 1,234,567VND. ND: HIGHLANDS COFFEE')
  assert.ok(r)
  assert.equal(r.amount, 45_000)
  assert.equal(r.kind, 'expense')
  assert.equal(r.date, '2026-09-12')
  assert.equal(r.balance, 1_234_567)
  assert.equal(r.note, 'HIGHLANDS COFFEE')
})

test('parseReceipt nhận ra khoản tiền vào và tên nhà cung cấp', () => {
  const r = parseReceipt('Vietcombank: TK 007 +5,000,000VND luc 01/09/2026. Noi dung: NHAN TIEN LUONG. So du 9,000,000VND')
  assert.ok(r)
  assert.equal(r.kind, 'income')
  assert.equal(r.amount, 5_000_000)
  assert.equal(r.issuer, 'Vietcombank')
  assert.equal(r.balance, 9_000_000)
})

test('parseReceipt xử lý được thông báo ví điện tử không có dấu cộng trừ', () => {
  const r = parseReceipt('MoMo: Ban da thanh toan 45,000d cho Highlands Coffee. So du vi: 120,000d')
  assert.ok(r)
  assert.equal(r.kind, 'expense')
  assert.equal(r.amount, 45_000)
  assert.equal(r.balance, 120_000)
  assert.equal(r.issuer, 'MoMo')
})

test('parseReceipt trả null với văn bản không chứa tiền', () => {
  assert.equal(parseReceipt('xin chao'), null)
})

/* ---------------- sao ke ---------------- */

test('parseCSV xử lý dấu ngoặc kép và dấu phân cách trong ô', () => {
  const rows = parseCSV('a,b\n"x,1","he said ""hi"""')
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['x,1', 'he said "hi"'],
  ])
})

test('parseStatement đọc file có cột ghi nợ / ghi có và đánh dấu trùng', () => {
  const csv = [
    'Ngay giao dich;Noi dung;Ghi no;Ghi co',
    '12/09/2026;THANH TOAN GRAB;120.000;',
    '13/09/2026;LUONG THANG 9;;15.000.000',
    'rác;;;',
  ].join('\n')

  const existing: Transaction[] = [
    tx({ kind: 'expense', amount: 120_000, date: '2026-09-12', note: 'THANH TOAN GRAB' }),
  ]
  const parsed = parseStatement(csv, existing)
  assert.ok(parsed)
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.skipped, 1)

  const grab = parsed.rows.find((r) => r.note === 'THANH TOAN GRAB')!
  assert.equal(grab.kind, 'expense')
  assert.equal(grab.amount, 120_000)
  assert.equal(grab.duplicate, true, 'dòng đã có trong app phải bị đánh dấu trùng')
  assert.equal(grab.selected, false, 'dòng trùng không được chọn sẵn')

  const luong = parsed.rows.find((r) => r.note === 'LUONG THANG 9')!
  assert.equal(luong.kind, 'income')
  assert.equal(luong.amount, 15_000_000)
  assert.equal(luong.selected, true)
})

test('parseStatement đọc được file một cột số tiền có dấu âm', () => {
  const csv = ['Date,Description,Amount', '2026-09-12,Coffee,-45000', '2026-09-13,Refund,45000'].join('\n')
  const parsed = parseStatement(csv, [])
  assert.ok(parsed)
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rows.find((r) => r.note === 'Coffee')!.kind, 'expense')
  assert.equal(parsed.rows.find((r) => r.note === 'Refund')!.kind, 'income')
})

test('parseStatement từ chối file không nhận ra cột', () => {
  assert.equal(parseStatement('foo,bar\n1,2', []), null)
})

/* ---------------- do phu du lieu ---------------- */

test('computeCoverage phân biệt ngày không chi tiêu với ngày quên ghi', () => {
  const transactions = [tx({ kind: 'expense', amount: 10_000, date: daysAgo(1) })]
  const dayMarks = [{ id: 1, date: daysAgo(2), markedAt: 1 }]

  const coverage = computeCoverage(transactions, dayMarks, 5, daysAgo(4))
  assert.equal(coverage.window, 4, 'hôm nay không bị tính là thiếu')
  assert.deepEqual(coverage.gaps, [daysAgo(3), daysAgo(4)])
  assert.equal(coverage.ratio, 0.5)
  assert.equal(coverage.currentGapStreak, 0, 'hôm qua đã có dữ liệu nên chuỗi trống bằng 0')
})

test('computeCoverage đếm đúng chuỗi ngày trống liên tiếp', () => {
  const coverage = computeCoverage([tx({ kind: 'expense', amount: 1, date: daysAgo(4) })], [], 6, daysAgo(4))
  assert.equal(coverage.currentGapStreak, 3)
})

/* ---------------- dinh ky ---------------- */

test('advance giữ đúng ngày neo và lùi về cuối tháng ngắn', () => {
  const rule = { freq: 'monthly', anchor: 31 } as Recurring
  assert.equal(advance(rule, '2026-01-31'), '2026-02-28')
  assert.equal(advance(rule, '2026-02-28'), '2026-03-31')

  const weekly = { freq: 'weekly', anchor: 1 } as Recurring
  assert.equal(advance(weekly, '2026-09-07'), '2026-09-14')

  const daily = { freq: 'daily', anchor: 0 } as Recurring
  assert.equal(advance(daily, '2026-09-30'), '2026-10-01')
})

test('firstDueDate cho khoản hàng tuần rơi đúng thứ đã chọn', () => {
  const iso = firstDueDate('weekly', 3)
  assert.equal(new Date(`${iso}T00:00:00`).getDay(), 3)
  assert.ok(iso >= toISO(new Date()))
})

/* ---------------- thong ke ---------------- */

test('walletBalances cộng số dư đầu kỳ với giao dịch', () => {
  const transactions = [
    tx({ kind: 'expense', amount: 100_000, date: '2026-09-01', walletId: 1 }),
    tx({ kind: 'income', amount: 300_000, date: '2026-09-02', walletId: 2 }),
  ]
  const balances = walletBalances(WALLETS, transactions)
  assert.equal(balances.get(1), 400_000)
  assert.equal(balances.get(2), 2_300_000)
})

test('sumTotals, byCategory và dailySeries khớp nhau', () => {
  const transactions = [
    tx({ kind: 'expense', amount: 50_000, date: '2026-09-01', categoryId: 1 }),
    tx({ kind: 'expense', amount: 30_000, date: '2026-09-01', categoryId: 2 }),
    tx({ kind: 'expense', amount: 20_000, date: '2026-09-03', categoryId: 1 }),
    tx({ kind: 'income', amount: 500_000, date: '2026-09-05', categoryId: 4 }),
  ]

  const totals = sumTotals(transactions)
  assert.equal(totals.expense, 100_000)
  assert.equal(totals.income, 500_000)
  assert.equal(totals.net, 400_000)

  const slices = byCategory(transactions, CATEGORIES, 'expense')
  assert.equal(slices[0].category.id, 1)
  assert.equal(slices[0].amount, 70_000)
  assert.equal(slices[0].count, 2)
  assert.equal(Math.round(slices[0].share * 100), 70)

  const series = dailySeries(transactions, '2026-09')
  assert.equal(series.length, 30)
  assert.equal(series[0].expense, 80_000)
  assert.equal(series[2].expense, 20_000)
  assert.equal(series[4].income, 500_000)
})

test('byCategory không làm rơi giao dịch có danh mục đã xoá', () => {
  const slices = byCategory([tx({ kind: 'expense', amount: 10_000, date: '2026-09-01', categoryId: 999 })], CATEGORIES, 'expense')
  assert.equal(slices.length, 1)
  assert.equal(slices[0].amount, 10_000)
  assert.equal(slices[0].category.name, '(đã xoá)')
})

test('monthlySeries trả đủ số tháng kể cả tháng trống', () => {
  const series = monthlySeries([tx({ kind: 'expense', amount: 10_000, date: '2026-08-15' })], '2026-09', 3)
  assert.deepEqual(
    series.map((m) => m.month),
    ['2026-07', '2026-08', '2026-09'],
  )
  assert.equal(series[1].expense, 10_000)
  assert.equal(series[2].expense, 0)
})

/* ---------------- phim tat tu hoc ---------------- */

test('suggestShortcuts chỉ gợi ý khoản lặp lại và bỏ qua bút toán đối soát', () => {
  const transactions = [
    tx({ kind: 'expense', amount: 35_000, date: daysAgo(1), categoryId: 1, note: 'cà phê' }),
    tx({ kind: 'expense', amount: 35_000, date: daysAgo(2), categoryId: 1, note: 'Cà Phê' }),
    tx({ kind: 'expense', amount: 99_000, date: daysAgo(3), categoryId: 2, note: 'chỉ một lần' }),
    tx({ kind: 'expense', amount: 500_000, date: daysAgo(1), categoryId: 3, note: 'lệch', source: 'reconcile' }),
    tx({ kind: 'expense', amount: 500_000, date: daysAgo(2), categoryId: 3, note: 'lệch', source: 'reconcile' }),
  ]
  const shortcuts = suggestShortcuts(transactions, CATEGORIES)
  assert.equal(shortcuts.length, 1)
  assert.equal(shortcuts[0].amount, 35_000)
  assert.equal(shortcuts[0].uses, 2)
  assert.equal(shortcuts[0].categoryId, 1)
})

test('suggestShortcuts bỏ qua giao dịch ngoài cửa sổ thời gian', () => {
  const old = [
    tx({ kind: 'expense', amount: 35_000, date: daysAgo(200), categoryId: 1, note: 'cà phê' }),
    tx({ kind: 'expense', amount: 35_000, date: daysAgo(201), categoryId: 1, note: 'cà phê' }),
  ]
  assert.equal(suggestShortcuts(old, CATEGORIES).length, 0)
})
