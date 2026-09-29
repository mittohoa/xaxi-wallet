/**
 * Kiểm thử sáu hũ.
 *
 * Điều dễ làm hỏng nhất ở đây là **nền thu nhập**. Nửa đầu tháng, trước khi
 * lương về, thu nhập của kỳ bằng 0 — và nếu lấy thẳng con số đó thì mọi hũ hiện
 * hạn mức 0₫, tức tính năng vô dụng đúng lúc nó cần nhất. Phần lớn bài kiểm ở
 * đây canh chỗ đó.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { JARS, incomeBase, jarPercents, jarStates, totalPercent, unassigned } from '../src/lib/jars'
import type { Category, Transaction } from '../src/types'

const CATS: Category[] = [
  { id: 'an', name: 'Ăn uống', kind: 'expense', icon: '🍜', color: '#73a434', jar: 'essentials', updatedAt: 1 },
  { id: 'nha', name: 'Nhà cửa', kind: 'expense', icon: '🏠', color: '#db703b', jar: 'essentials', updatedAt: 1 },
  { id: 'choi', name: 'Giải trí', kind: 'expense', icon: '🎮', color: '#6f8bed', jar: 'play', updatedAt: 1 },
  { id: 'hoc', name: 'Giáo dục', kind: 'expense', icon: '📚', color: '#d4679f', jar: 'education', updatedAt: 1 },
  { id: 'la', name: 'Thú cưng', kind: 'expense', icon: '🐈', color: '#2b99e7', updatedAt: 1 },
  { id: 'khac', name: 'Chi khác', kind: 'expense', icon: '📦', color: '#8a929d', slug: 'uncategorized-expense', updatedAt: 1 },
  { id: 'luong', name: 'Lương', kind: 'income', icon: '💼', color: '#2b99e7', updatedAt: 1 },
]

let seq = 0
function tx(over: Partial<Transaction> & Pick<Transaction, 'amount' | 'date'>): Transaction {
  return {
    id: String(++seq),
    kind: 'expense',
    categoryId: 'an',
    walletId: 'vi',
    createdAt: seq,
    updatedAt: seq,
    ...over,
  } as Transaction
}

const KHONG_SUA = { jarPercents: undefined }

/* ================= tỷ lệ ================= */

test('tỷ lệ gốc cộng lại đúng 100', () => {
  assert.equal(totalPercent(KHONG_SUA), 100)
  assert.equal(JARS.length, 6)
})

test('người dùng sửa được từng hũ, hũ chưa sửa giữ tỷ lệ gốc', () => {
  const p = jarPercents({ jarPercents: { essentials: 60, play: 5 } })
  assert.equal(p.essentials, 60)
  assert.equal(p.play, 5)
  assert.equal(p.education, 10, 'hũ chưa đụng tới phải giữ tỷ lệ gốc')
})

test('giá trị hỏng thì rơi về tỷ lệ gốc chứ không thành NaN', () => {
  const p = jarPercents({ jarPercents: { essentials: Number.NaN, play: -5, education: 'x' as unknown as number } })
  assert.equal(p.essentials, 55)
  assert.equal(p.play, 10)
  assert.equal(p.education, 10)
})

test('không ép tổng phải bằng 100', () => {
  // Người dùng có thể cố ý để 90 và giữ 10 ngoài hệ thống
  assert.equal(totalPercent({ jarPercents: { essentials: 45 } }), 90)
})

/* ================= nền thu nhập ================= */

const LUONG = (date: string, amount = 20_000_000) => tx({ kind: 'income', categoryId: 'luong', amount, date })

test('lấy thu nhập thật của kỳ này khi đã có', () => {
  const r = incomeBase([LUONG('2026-09-05')], '2026-09', 1)
  assert.equal(r.amount, 20_000_000)
  assert.equal(r.estimated, false)
})

/**
 * Đây là bài kiểm quan trọng nhất của tệp.
 *
 * Nửa đầu tháng chưa có lương, mà lấy thẳng 0 làm nền thì mọi hũ hiện hạn mức
 * 0₫ — tính năng chết đúng nửa tháng, mỗi tháng.
 */
test('chưa có lương thì suy từ các kỳ trước, và nói rõ là ước tính', () => {
  const r = incomeBase([LUONG('2026-08-05'), LUONG('2026-07-05'), LUONG('2026-06-05')], '2026-09', 1)
  assert.equal(r.amount, 20_000_000)
  assert.equal(r.estimated, true)
  assert.equal(r.from, 3)
})

test('dùng trung vị chứ không phải trung bình', () => {
  // Tháng thưởng Tết kéo trung bình lên và làm hạn mức phồng suốt mấy tháng sau
  const r = incomeBase(
    [LUONG('2026-08-05', 18_000_000), LUONG('2026-07-05', 100_000_000), LUONG('2026-06-05', 18_000_000)],
    '2026-09',
    1,
  )
  assert.equal(r.amount, 18_000_000, 'trung bình sẽ ra hơn 45 triệu')
})

test('chưa có kỳ nào có thu nhập thì trả 0 chứ không đoán bừa', () => {
  const r = incomeBase([], '2026-09', 1)
  assert.equal(r.amount, 0)
  assert.equal(r.estimated, false)
})

test('chuyển tiền giữa ví không được tính là thu nhập', () => {
  const r = incomeBase([tx({ kind: 'income', amount: 9_000_000, date: '2026-09-05', transferId: 'ck' })], '2026-09', 1)
  assert.equal(r.amount, 0, 'tiền chỉ đổi chỗ, không phải thu nhập')
})

test('tôn trọng ngày bắt đầu kỳ', () => {
  // Quy ước của app: kỳ '2026-09' với ngày bắt đầu 25 chạy từ 25/09 tới 24/10.
  // Lương về ngày 26/09 thuộc kỳ này; lương ngày 24/09 thuộc kỳ trước.
  const trong = incomeBase([LUONG('2026-09-26')], '2026-09', 25)
  assert.equal(trong.amount, 20_000_000)
  assert.equal(trong.estimated, false)

  const ngoai = incomeBase([LUONG('2026-09-24')], '2026-09', 25)
  assert.equal(ngoai.estimated, true, 'lương của kỳ trước chỉ được dùng làm số ước tính')
  assert.equal(ngoai.amount, 20_000_000)
})

/* ================= trạng thái hũ ================= */

const CHI = [
  tx({ categoryId: 'an', amount: 3_000_000, date: '2026-09-10' }),
  tx({ categoryId: 'nha', amount: 4_500_000, date: '2026-09-03' }),
  tx({ categoryId: 'choi', amount: 1_500_000, date: '2026-09-12' }),
  tx({ categoryId: 'khac', amount: 500_000, date: '2026-09-13' }),
]

test('hạn mức từng hũ là tỷ lệ của nền thu nhập', () => {
  const s = jarStates(CHI, CATS, KHONG_SUA, 20_000_000)
  const thiet = s.find((j) => j.slug === 'essentials')!
  assert.equal(thiet.limit, 11_000_000, '55% của 20 triệu')
  assert.equal(thiet.spent, 7_500_000, 'ăn uống cộng nhà cửa')
  assert.equal(thiet.remaining, 3_500_000)
})

test('danh mục chưa xếp hũ không bị tính vào hũ nào', () => {
  const s = jarStates(CHI, CATS, KHONG_SUA, 20_000_000)
  const tong = s.reduce((a, j) => a + j.spent, 0)
  assert.equal(tong, 9_000_000, 'khoản 500k của "Chi khác" nằm ngoài mọi hũ')
})

test('hũ để dành không tiêu gì thì còn nguyên', () => {
  const s = jarStates(CHI, CATS, KHONG_SUA, 20_000_000)
  const tk = s.find((j) => j.slug === 'longterm')!
  assert.equal(tk.saving, true)
  assert.equal(tk.spent, 0)
  assert.equal(tk.remaining, 2_000_000, 'còn nguyên nghĩa là đã giữ lại được')
})

test('chuyển tiền giữa ví không tính vào hũ nào', () => {
  const s = jarStates([...CHI, tx({ categoryId: 'an', amount: 9_000_000, date: '2026-09-14', transferId: 'ck' })], CATS, KHONG_SUA, 20_000_000)
  assert.equal(s.find((j) => j.slug === 'essentials')!.spent, 7_500_000)
})

test('chưa có thu nhập thì hạn mức bằng 0 nhưng vẫn cộng đúng phần đã chi', () => {
  const s = jarStates(CHI, CATS, KHONG_SUA, 0)
  const thiet = s.find((j) => j.slug === 'essentials')!
  assert.equal(thiet.limit, 0)
  assert.equal(thiet.spent, 7_500_000)
  assert.equal(thiet.ratio, 0, 'chia cho 0 phải ra 0, không phải Infinity')
})

test('vượt hũ vẫn trả về con số thật, không cắt ngọn', () => {
  const s = jarStates([tx({ categoryId: 'choi', amount: 5_000_000, date: '2026-09-12' })], CATS, KHONG_SUA, 20_000_000)
  const huong = s.find((j) => j.slug === 'play')!
  assert.equal(huong.limit, 2_000_000)
  assert.equal(huong.remaining, -3_000_000, 'âm là âm; app cảnh báo chứ không giấu')
  assert.equal(huong.ratio, 2.5)
})

/* ================= danh mục chưa xếp ================= */

test('chỉ ra danh mục chi chưa xếp hũ, bỏ qua danh mục hệ thống', () => {
  const con = unassigned(CATS).map((c) => c.name)
  assert.deepEqual(con, ['Thú cưng'], 'danh mục hệ thống và khoản thu không cần xếp hũ')
})
