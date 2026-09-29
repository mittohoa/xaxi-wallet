import assert from 'node:assert/strict'
import test from 'node:test'

import { detectRecurring, trainClassifier } from '../src/lib/learn'
import { toISO } from '../src/lib/date'
import type { Category, Recurring, Transaction } from '../src/types'

const CATEGORIES: Category[] = [
  { id: 1, name: 'Ăn uống', kind: 'expense', icon: '🍜', color: '#eb6834' },
  { id: 2, name: 'Đi lại', kind: 'expense', icon: '🛵', color: '#2a78d6' },
  { id: 3, name: 'Nhà cửa', kind: 'expense', icon: '🏠', color: '#4a3aa7' },
  { id: 9, name: 'Chi khác', kind: 'expense', icon: '📦', color: '#898781', builtin: true, slug: 'uncategorized-expense' },
  { id: 4, name: 'Lương', kind: 'income', icon: '💼', color: '#2a78d6' },
]

let seq = 0
function tx(note: string, categoryId: number, date: string, amount = 50_000, extra: Partial<Transaction> = {}): Transaction {
  return { id: ++seq, kind: 'expense', amount, categoryId, walletId: 1, date, note, createdAt: seq, ...extra }
}

/* ================= phan loai ================= */

test('bộ phân loại học được thói quen đặt ghi chú của người dùng', () => {
  const history = [
    tx('cà phê highlands', 1, '2026-09-01'),
    tx('cà phê sáng', 1, '2026-09-02'),
    tx('cà phê với khách', 1, '2026-09-03'),
    tx('trà sữa', 1, '2026-09-04'),
    tx('grab về nhà', 2, '2026-09-01'),
    tx('grab đi làm', 2, '2026-09-02'),
    tx('xe ôm grab', 2, '2026-09-03'),
    tx('taxi sân bay', 2, '2026-09-04'),
    tx('tiền thuê nhà', 3, '2026-09-03', 4_500_000),
    tx('tiền nhà tháng 8', 3, '2026-08-03', 4_500_000),
  ]
  const clf = trainClassifier(history, CATEGORIES)
  assert.ok(clf.trainedOn >= 8)

  const coffee = clf.predict('cà phê chiều', 'expense')!
  assert.equal(coffee.categoryId, 1, 'ghi chú có "cà phê" phải ra Ăn uống')

  const ride = clf.predict('grab tối', 'expense')!
  assert.equal(ride.categoryId, 2, 'ghi chú có "grab" phải ra Đi lại')

  const rent = clf.predict('tiền nhà', 'expense')!
  assert.equal(rent.categoryId, 3)
})

test('bộ phân loại im lặng khi chưa đủ dữ liệu để đoán', () => {
  const clf = trainClassifier([tx('cà phê', 1, '2026-09-01')], CATEGORIES)
  assert.equal(clf.predict('cà phê', 'expense'), null, 'quá ít mẫu thì không được đoán bừa')
})

test('bộ phân loại im lặng với ghi chú toàn từ lạ', () => {
  const history = Array.from({ length: 10 }, (_, i) => tx('cà phê', 1, `2026-09-${String(i + 1).padStart(2, '0')}`))
  const clf = trainClassifier(history, CATEGORIES)
  assert.equal(clf.predict('zzz qqq', 'expense'), null)
})

test('bộ phân loại không học từ danh mục "chưa phân loại"', () => {
  const history = [
    ...Array.from({ length: 10 }, (_, i) => tx('chuyển khoản', 9, `2026-09-${String(i + 1).padStart(2, '0')}`)),
    ...Array.from({ length: 10 }, (_, i) => tx('cà phê', 1, `2026-08-${String(i + 1).padStart(2, '0')}`)),
  ]
  const clf = trainClassifier(history, CATEGORIES)
  const p = clf.predict('chuyển khoản', 'expense')
  assert.notEqual(p?.categoryId, 9, 'không được đề xuất chính danh mục rỗng nghĩa')
})

test('bộ phân loại chỉ chọn trong đúng loại thu hoặc chi', () => {
  const history = [
    ...Array.from({ length: 6 }, (_, i) => tx('lương tháng', 4, `2026-0${i + 1}-05`, 18_000_000, { kind: 'income' })),
    ...Array.from({ length: 6 }, (_, i) => tx('cà phê', 1, `2026-09-0${i + 1}`)),
  ]
  const clf = trainClassifier(history, CATEGORIES)
  const p = clf.predict('lương tháng 10', 'income')!
  assert.equal(p.categoryId, 4)
  assert.equal(clf.predict('lương tháng 10', 'expense'), null, 'không có danh mục chi nào khớp thì im lặng')
})

/* ================= khoan dinh ky ================= */

function monthly(day: number, months: number[], note: string, amount: number, categoryId = 3): Transaction[] {
  return months.map((m) => tx(note, categoryId, `2026-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`, amount))
}

test('phát hiện khoản chi lặp đều hằng tháng', () => {
  const data = [
    ...monthly(3, [6, 7, 8, 9], 'tiền thuê nhà', 4_500_000),
    tx('cà phê', 1, '2026-09-01', 35_000),
  ]
  const found = detectRecurring(data, [], CATEGORIES)
  assert.equal(found.length, 1)
  assert.equal(found[0].name, 'tiền thuê nhà')
  assert.equal(found[0].freq, 'monthly')
  assert.equal(found[0].anchor, 3)
  assert.equal(found[0].amount, 4_500_000)
  assert.equal(found[0].occurrences, 4)
  assert.equal(found[0].nextDate, '2026-10-03')
  assert.ok(found[0].confidence > 0.5)
})

test('không đề xuất khi số tiền nhảy loạn', () => {
  const data = [
    tx('đi chợ', 1, '2026-06-03', 200_000),
    tx('đi chợ', 1, '2026-07-03', 900_000),
    tx('đi chợ', 1, '2026-08-03', 150_000),
    tx('đi chợ', 1, '2026-09-03', 600_000),
  ]
  assert.equal(detectRecurring(data, [], CATEGORIES).length, 0, 'số tiền không ổn định thì không được tự động hoá')
})

test('không đề xuất khi khoảng cách không đều', () => {
  const data = [
    tx('gym', 1, '2026-06-01', 500_000),
    tx('gym', 1, '2026-06-20', 500_000),
    tx('gym', 1, '2026-09-15', 500_000),
  ]
  assert.equal(detectRecurring(data, [], CATEGORIES).length, 0)
})

test('không đề xuất khi mới lặp hai lần', () => {
  assert.equal(detectRecurring(monthly(3, [8, 9], 'internet', 220_000), [], CATEGORIES).length, 0)
})

test('không đề xuất lại khoản đã có quy tắc định kỳ', () => {
  const rules: Recurring[] = [
    {
      id: 1,
      name: 'Tiền thuê nhà',
      kind: 'expense',
      amount: 4_500_000,
      categoryId: 3,
      walletId: 1,
      freq: 'monthly',
      anchor: 3,
      nextDate: '2026-10-03',
      active: true,
      note: 'tiền thuê nhà',
    },
  ]
  assert.equal(detectRecurring(monthly(3, [6, 7, 8, 9], 'tiền thuê nhà', 4_500_000), rules, CATEGORIES).length, 0)
})

test('không đề xuất từ chính những bản ghi do máy tự sinh', () => {
  const data = monthly(3, [6, 7, 8, 9], 'tiền thuê nhà', 4_500_000).map((t) => ({ ...t, source: 'recurring' as const }))
  assert.equal(detectRecurring(data, [], CATEGORIES).length, 0, 'tránh vòng lặp tự đề xuất chính mình')
})

test('phát hiện được khoản lặp hằng tuần', () => {
  const base = new Date('2026-08-03T00:00:00')
  const data = [0, 7, 14, 21].map((d) => {
    const x = new Date(base)
    x.setDate(x.getDate() + d)
    return tx('học tiếng anh', 1, toISO(x), 300_000)
  })
  const found = detectRecurring(data, [], CATEGORIES)
  assert.equal(found.length, 1)
  assert.equal(found[0].freq, 'weekly')
  assert.equal(found[0].anchor, 1, 'thứ Hai')
})
