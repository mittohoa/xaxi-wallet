import assert from 'node:assert/strict'
import test from 'node:test'

import { configureFormat } from '../src/lib/format'
import { toISO } from '../src/lib/date'
import { interpret, type AskContext } from '../src/lib/ask'
import { extractTimeRange, defaultRange } from '../src/lib/timerange'
import { containsWord } from '../src/lib/quickadd'
import type { Category, Transaction, Wallet } from '../src/types'

configureFormat('vi-VN', 'VND')

const CATEGORIES: Category[] = [
  { id: '1', name: 'Ăn uống', kind: 'expense', icon: '🍜', color: '#eb6834', keywords: ['ca phe', 'an trua', 'com'] },
  { id: '2', name: 'Đi lại', kind: 'expense', icon: '🛵', color: '#2a78d6', keywords: ['xang', 'grab'] },
  { id: '3', name: 'Chi khác', kind: 'expense', icon: '📦', color: '#898781', builtin: true, slug: 'uncategorized-expense' },
  { id: '4', name: 'Lương', kind: 'income', icon: '💼', color: '#2a78d6', keywords: ['luong'] },
]

const WALLETS: Wallet[] = [
  { id: '1', name: 'Tiền mặt', kind: 'cash', icon: '👛', color: '#1baf7a', openingBalance: 1_000_000 },
  { id: '2', name: 'Ngân hàng', kind: 'bank', icon: '🏦', color: '#2a78d6', openingBalance: 5_000_000 },
]

const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toISO(d)
}

function tx(p: Partial<Transaction> & Pick<Transaction, 'kind' | 'amount' | 'date'>): Transaction {
  return { categoryId: '1', walletId: '1', createdAt: 1, ...p } as Transaction
}

const thisMonth = new Date().toISOString().slice(0, 7)
const firstOfMonth = `${thisMonth}-01`

function ctx(transactions: Transaction[], extra: Partial<AskContext> = {}): AskContext {
  return {
    transactions,
    categories: CATEGORIES,
    wallets: WALLETS,
    budgets: [],
    dayMarks: [],
    gapWindowDays: 14,
    ...extra,
  }
}

/* ---------------- khoang thoi gian ---------------- */

test('extractTimeRange đọc được các cụm thời gian thông dụng', () => {
  const today = extractTimeRange('hom nay')!
  assert.equal(today.range.start, toISO(new Date()))
  assert.equal(today.range.end, toISO(new Date()))
  assert.equal(today.rest, '')

  const yesterday = extractTimeRange('an uong hom qua')!
  assert.equal(yesterday.range.start, daysAgo(1))
  assert.equal(yesterday.rest, 'an uong')

  const week = extractTimeRange('tuan nay')!
  assert.equal(new Date(week.range.start + 'T00:00:00').getDay(), 1, 'tuần phải bắt đầu thứ Hai')

  const last7 = extractTimeRange('7 ngay qua')!
  assert.equal(last7.range.start, daysAgo(6))
  assert.equal(last7.range.end, toISO(new Date()))
})

test('extractTimeRange hiểu "tháng 8" và tự lùi năm khi tháng ở tương lai', () => {
  const hit = extractTimeRange('thang 8 chi bao nhieu')!
  assert.equal(hit.range.start.slice(5), '08-01')
  assert.ok(hit.rest.includes('chi bao nhieu'))

  const withYear = extractTimeRange('thang 3/2024')!
  assert.equal(withYear.range.start, '2024-03-01')
  assert.equal(withYear.range.end, '2024-03-31')
})

test('extractTimeRange trả null khi câu không nhắc thời gian', () => {
  assert.equal(extractTimeRange('an uong bao nhieu'), null)
  assert.ok(defaultRange().start.endsWith('-01'))
})

/* ---------------- phan loai y dinh ---------------- */

test('interpret phân biệt ghi chép với câu hỏi', () => {
  const entry = interpret('cà phê 35k', ctx([]))
  assert.equal(entry.type, 'entry')
  if (entry.type === 'entry') {
    assert.equal(entry.parse.amount, 35_000)
    assert.equal(entry.category?.name, 'Ăn uống')
  }

  const question = interpret('tháng này ăn uống bao nhiêu', ctx([]))
  assert.equal(question.type, 'query')
})

test('interpret không nhầm "tháng 8 chi bao nhiêu" thành khoản chi 8 đồng', () => {
  const r = interpret('tháng 8 chi bao nhiêu', ctx([]))
  assert.equal(r.type, 'query', 'câu có dấu hỏi phải được hiểu là câu hỏi')
})

test('interpret nhận ra lệnh mở màn hình', () => {
  for (const [input, expected] of [
    ['cài đặt', 'settings'],
    ['ngân sách', 'budgets'],
    ['dán biên lai', 'receipt'],
    ['đối soát', 'reconcile'],
    ['sao kê', 'statement'],
    ['?', 'help'],
  ] as const) {
    const r = interpret(input, ctx([]))
    assert.equal(r.type, 'command', `"${input}" phải là lệnh`)
    if (r.type === 'command') assert.equal(r.command, expected)
  }
})

test('interpret trả empty với chuỗi rỗng', () => {
  assert.equal(interpret('   ', ctx([])).type, 'empty')
})

/* ---------------- tra loi cau hoi ---------------- */

test('hỏi tổng chi một danh mục trong tháng', () => {
  const data = [
    tx({ kind: 'expense', amount: 50_000, date: firstOfMonth, categoryId: '1' }),
    tx({ kind: 'expense', amount: 30_000, date: firstOfMonth, categoryId: '1' }),
    tx({ kind: 'expense', amount: 90_000, date: firstOfMonth, categoryId: '2' }),
  ]
  const r = interpret('tháng này ăn uống bao nhiêu', ctx(data))
  assert.equal(r.type, 'query')
  if (r.type !== 'query') return
  assert.equal(r.answer.kind, 'total')
  if (r.answer.kind !== 'total') return
  assert.equal(r.answer.totals.expense, 80_000, 'chỉ tính danh mục Ăn uống')
  assert.equal(r.answer.count, 2)
  assert.equal(r.answer.category?.name, 'Ăn uống')
})

test('hỏi khoản chi nhiều nhất cho ra phân bổ theo danh mục', () => {
  const data = [
    tx({ kind: 'expense', amount: 50_000, date: firstOfMonth, categoryId: '1' }),
    tx({ kind: 'expense', amount: 200_000, date: firstOfMonth, categoryId: '2' }),
  ]
  const r = interpret('tháng này chi nhiều nhất vào việc gì', ctx(data))
  assert.equal(r.type, 'query')
  if (r.type !== 'query' || r.answer.kind !== 'breakdown') return assert.fail('phải là breakdown')
  assert.equal(r.answer.slices[0].category.name, 'Đi lại')
  assert.equal(r.answer.slices[0].amount, 200_000)
  assert.equal(r.answer.total, 250_000)
})

test('hỏi số dư cho ra từng ví và tổng', () => {
  const data = [tx({ kind: 'expense', amount: 200_000, date: firstOfMonth, walletId: '1' })]
  const r = interpret('còn bao nhiêu tiền', ctx(data))
  if (r.type !== 'query' || r.answer.kind !== 'balance') return assert.fail('phải là balance')
  assert.equal(r.answer.wallets.find((w) => w.wallet.id === '1')?.balance, 800_000)
  assert.equal(r.answer.total, 5_800_000)
})

test('hỏi so sánh với kỳ trước', () => {
  const now = new Date()
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15)
  const data = [
    tx({ kind: 'expense', amount: 100_000, date: firstOfMonth }),
    tx({ kind: 'expense', amount: 250_000, date: toISO(prevMonth) }),
  ]
  const r = interpret('tháng này chi so với tháng trước', ctx(data))
  if (r.type !== 'query' || r.answer.kind !== 'compare') return assert.fail('phải là compare')
  assert.equal(r.answer.current.expense, 100_000)
  assert.equal(r.answer.previous.expense, 250_000)
})

test('gõ một từ khoá tự do thì tìm trong ghi chú', () => {
  const data = [
    tx({ kind: 'expense', amount: 66_000, date: firstOfMonth, categoryId: '2', note: 'grab về nhà' }),
    tx({ kind: 'expense', amount: 35_000, date: firstOfMonth, categoryId: '1', note: 'cà phê' }),
  ]
  const r = interpret('grab', ctx(data))
  if (r.type !== 'query' || r.answer.kind !== 'list') return assert.fail('phải là list')
  assert.equal(r.answer.transactions.length, 1)
  assert.equal(r.answer.transactions[0].amount, 66_000)
})

test('tìm không ra thì nói rõ là không có, không trả về danh sách rỗng khó hiểu', () => {
  const r = interpret('mèo', ctx([tx({ kind: 'expense', amount: 1000, date: firstOfMonth, note: 'cà phê' })]))
  if (r.type !== 'query' || r.answer.kind !== 'none') return assert.fail('phải là none')
  assert.ok(r.answer.message.includes('mèo'))
})

test('hỏi ngân sách khi chưa đặt thì hướng dẫn cách đặt', () => {
  const r = interpret('ngân sách còn bao nhiêu', ctx([]))
  if (r.type !== 'query' || r.answer.kind !== 'none') return assert.fail('phải là none')
  assert.ok(r.answer.message.includes('ngân sách'))
})

test('hỏi ngân sách khi đã đặt thì xếp theo mức dùng nhiều nhất', () => {
  const data = [
    tx({ kind: 'expense', amount: 900_000, date: firstOfMonth, categoryId: '1' }),
    tx({ kind: 'expense', amount: 100_000, date: firstOfMonth, categoryId: '2' }),
  ]
  const budgets = [
    { id: '1', categoryId: '1', month: thisMonth, limit: 1_000_000 },
    { id: '2', categoryId: '2', month: thisMonth, limit: 1_000_000 },
  ]
  const r = interpret('ngân sách tháng này thế nào', ctx(data, { budgets }))
  if (r.type !== 'query' || r.answer.kind !== 'budget') return assert.fail('phải là budget')
  assert.equal(r.answer.items[0].category.name, 'Ăn uống')
  assert.equal(r.answer.items[0].spent, 900_000)
})

test('hỏi độ phủ dữ liệu', () => {
  const r = interpret('còn ngày nào chưa ghi', ctx([tx({ kind: 'expense', amount: 1000, date: daysAgo(1) })]))
  if (r.type !== 'query' || r.answer.kind !== 'coverage') return assert.fail('phải là coverage')
  assert.ok(r.answer.ratio >= 0 && r.answer.ratio <= 1)
})

test('hỏi thu nhập thì lọc theo khoản thu chứ không phải chi', () => {
  const data = [
    tx({ kind: 'income', amount: 15_000_000, date: firstOfMonth, categoryId: '4' }),
    tx({ kind: 'expense', amount: 500_000, date: firstOfMonth, categoryId: '1' }),
  ]
  const r = interpret('tháng này thu nhập bao nhiêu', ctx(data))
  if (r.type !== 'query' || r.answer.kind !== 'total') return assert.fail('phải là total')
  assert.equal(r.answer.totals.income, 15_000_000)
})

test('từ khoá ngắn không được khớp lọt vào giữa chữ khác', () => {
  // 'an' (An uong) nam trong 'tuan truoc' — khong duoc coi la nhac toi danh muc
  const r = interpret('tuần này so với tuần trước', ctx([]))
  if (r.type !== 'query' || r.answer.kind !== 'compare') return assert.fail('phải là compare')
  assert.equal(r.answer.title, 'Chi tiêu', 'không được gán nhầm danh mục Ăn uống')

  // nhung go dung tu khoa tron ven thi van phai khop
  const r2 = interpret('tuần này cà phê bao nhiêu', ctx([]))
  if (r2.type !== 'query' || r2.answer.kind !== 'total') return assert.fail('phải là total')
  assert.equal(r2.answer.category?.name, 'Ăn uống')
})

test('containsWord chỉ khớp trọn từ', () => {
  assert.equal(containsWord('tuan truoc', 'an'), false)
  assert.equal(containsWord('an uong hom nay', 'an'), true)
  assert.equal(containsWord('ca phe sua', 'ca phe'), true)
  assert.equal(containsWord('thanh toan the', 'an'), false)
})
