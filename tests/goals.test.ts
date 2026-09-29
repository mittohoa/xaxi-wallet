/**
 * Kiểm thử mục tiêu tiết kiệm.
 *
 * Điều kiện để tính năng này đáng tồn tại: tiến độ phải TỰ TÍNH từ số dư ví.
 * Nếu nó đòi người dùng cập nhật tay thì người quên ghi chi tiêu cũng sẽ quên
 * cập nhật, và một thanh tiến độ đứng yên ba tháng còn tệ hơn không có — nó nói
 * dối. Phần lớn bài kiểm ở đây canh chuyện đó, và canh chỗ **khi nào im lặng**:
 * bịa ra một ngày đạt mục tiêu là nói dối về chính tiền của người dùng.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { claimedWallets, goalStates, savingRate, walletFlow } from '../src/lib/goals'
import type { Goal, Transaction, Wallet } from '../src/types'

const VI: Wallet[] = [
  { id: 'chinh', name: 'Ngân hàng', kind: 'bank', icon: '🏦', color: '#2b99e7', openingBalance: 0, updatedAt: 1 },
  { id: 'tietkiem', name: 'Tiết kiệm', kind: 'saving', icon: '🏆', color: '#73a434', openingBalance: 0, updatedAt: 1 },
]

let seq = 0
function tx(over: Partial<Transaction> & Pick<Transaction, 'amount' | 'date' | 'walletId'>): Transaction {
  return {
    id: String(++seq),
    kind: 'income',
    categoryId: 'cat',
    createdAt: seq,
    updatedAt: seq,
    ...over,
  } as Transaction
}

function goal(over: Partial<Goal> & Pick<Goal, 'name' | 'target'>): Goal {
  return {
    id: over.name,
    icon: '🎯',
    walletId: 'tietkiem',
    createdAt: 1,
    updatedAt: 1,
    ...over,
  } as Goal
}

/* ================= dòng tiền vào ví ================= */

/**
 * Chuyển tiền giữa ví PHẢI được tính ở đây — khác mọi phép tính khác trong app.
 *
 * Chuyển 2 triệu từ ví chính sang ví tiết kiệm chính là hành động tiết kiệm.
 * Loại nó ra thì mọi mục tiêu sẽ mãi mãi đứng ở 0.
 */
test('dòng tiền vào ví tính cả chuyển tiền giữa ví', () => {
  const data = [
    tx({ walletId: 'tietkiem', amount: 2_000_000, date: '2026-08-05', kind: 'income', transferId: 'ck-1' }),
    tx({ walletId: 'chinh', amount: 2_000_000, date: '2026-08-05', kind: 'expense', transferId: 'ck-1' }),
  ]
  assert.equal(walletFlow(data, 'tietkiem', '2026-08-01', '2026-08-31'), 2_000_000)
  assert.equal(walletFlow(data, 'chinh', '2026-08-01', '2026-08-31'), -2_000_000)
})

test('dòng tiền chỉ tính đúng ví và đúng khoảng', () => {
  const data = [
    tx({ walletId: 'tietkiem', amount: 1_000_000, date: '2026-08-05' }),
    tx({ walletId: 'tietkiem', amount: 9_000_000, date: '2026-07-05' }),
    tx({ walletId: 'chinh', amount: 5_000_000, date: '2026-08-05' }),
  ]
  assert.equal(walletFlow(data, 'tietkiem', '2026-08-01', '2026-08-31'), 1_000_000)
})

/* ================= tốc độ góp ================= */

const GOP_DEU = [1, 2, 3].map((i) =>
  tx({ walletId: 'tietkiem', amount: 3_000_000, date: `2026-0${9 - i}-05`, transferId: `ck-${i}` }),
)

test('tốc độ góp là trung bình của các kỳ ĐÃ hoàn tất', () => {
  const r = savingRate(GOP_DEU, 'tietkiem', '2026-09', 1)
  assert.equal(r.rate, 3_000_000)
  assert.equal(r.measured, 3)
})

/**
 * Kỳ đang chạy dở không được tính vào tốc độ.
 *
 * Kỳ mới đi được ba ngày sẽ kéo trung bình xuống và làm ngày dự kiến đạt lùi ra
 * hàng năm — một con số sai theo cùng một hướng, mọi tháng.
 */
test('kỳ đang chạy dở không kéo tốc độ xuống', () => {
  const r = savingRate([...GOP_DEU, tx({ walletId: 'tietkiem', amount: 0, date: '2026-09-02' })], 'tietkiem', '2026-09', 1)
  assert.equal(r.rate, 3_000_000)
})

/* ================= trạng thái mục tiêu ================= */

const SO_DU = new Map([['tietkiem', 9_000_000], ['chinh', 20_000_000]])

test('tiến độ chính là số dư ví, không phải con số nhập tay', () => {
  const [s] = goalStates([goal({ name: 'Mua xe', target: 30_000_000 })], VI, SO_DU, GOP_DEU, '2026-09', 1)
  assert.equal(s.saved, 9_000_000)
  assert.equal(s.remaining, 21_000_000)
  assert.equal(Math.round(s.ratio * 100), 30)
  assert.equal(s.done, false)
})

test('dự kiến đạt suy từ tốc độ góp thật', () => {
  const [s] = goalStates([goal({ name: 'Mua xe', target: 30_000_000 })], VI, SO_DU, GOP_DEU, '2026-09', 1)
  assert.equal(s.monthlyRate, 3_000_000)
  // còn 21 triệu, mỗi tháng 3 triệu → 7 tháng nữa
  assert.equal(s.projected, '2027-04')
})

test('im lặng khi chưa góp được đồng nào', () => {
  const [s] = goalStates([goal({ name: 'Mua xe', target: 30_000_000 })], VI, SO_DU, [], '2026-09', 1)
  assert.equal(s.monthlyRate, 0)
  assert.equal(s.projected, null, 'bịa ra ngày đạt là nói dối về chính tiền của người dùng')
})

test('im lặng khi ví đang rút ra chứ không nạp vào', () => {
  const rut = [tx({ walletId: 'tietkiem', amount: 1_000_000, date: '2026-08-05', kind: 'expense' })]
  const [s] = goalStates([goal({ name: 'Mua xe', target: 30_000_000 })], VI, SO_DU, rut, '2026-09', 1)
  assert.ok(s.monthlyRate < 0)
  assert.equal(s.projected, null)
})

test('đạt rồi thì báo đạt và thôi dự kiến', () => {
  const [s] = goalStates([goal({ name: 'Điện thoại', target: 9_000_000 })], VI, SO_DU, GOP_DEU, '2026-09', 1)
  assert.equal(s.done, true)
  assert.equal(s.remaining, 0)
  assert.equal(s.projected, null)
})

test('số dư âm không làm tiến độ thành số âm', () => {
  const am = new Map([['tietkiem', -500_000]])
  const [s] = goalStates([goal({ name: 'Mua xe', target: 10_000_000 })], VI, am, [], '2026-09', 1)
  assert.equal(s.saved, 0)
  assert.equal(s.ratio, 0)
})

/* ================= hạn và nhịp ================= */

test('có hạn thì tính được cần góp mỗi tháng và đang kịp hay không', () => {
  const [s] = goalStates(
    [goal({ name: 'Mua xe', target: 30_000_000, dueDate: '2027-03-01' })],
    VI,
    SO_DU,
    GOP_DEU,
    '2026-09',
    1,
  )
  // còn 21 triệu, còn 6 kỳ → cần 3,5 triệu mỗi tháng
  assert.equal(s.neededPerMonth, 3_500_000)
  assert.equal(s.onTrack, false, 'đang góp 3 triệu, thiếu nhịp')
})

test('hạn đã qua thì cần góp trọn phần còn thiếu, không chia cho 0', () => {
  const [s] = goalStates(
    [goal({ name: 'Mua xe', target: 30_000_000, dueDate: '2026-01-01' })],
    VI,
    SO_DU,
    GOP_DEU,
    '2026-09',
    1,
  )
  assert.equal(s.neededPerMonth, 21_000_000)
  assert.equal(Number.isFinite(s.neededPerMonth!), true)
})

test('không đặt hạn thì không phán xét kịp hay chậm', () => {
  const [s] = goalStates([goal({ name: 'Mua xe', target: 30_000_000 })], VI, SO_DU, GOP_DEU, '2026-09', 1)
  assert.equal(s.neededPerMonth, null)
  assert.equal(s.onTrack, null)
})

/* ================= xếp thứ tự và trùng ví ================= */

test('mục tiêu đã đạt xuống cuối, còn lại xếp theo mức gần đạt', () => {
  const list = goalStates(
    [
      goal({ name: 'Xong', target: 5_000_000 }),
      goal({ name: 'Xa', target: 100_000_000 }),
      goal({ name: 'Gần', target: 10_000_000 }),
    ],
    VI,
    SO_DU,
    [],
    '2026-09',
    1,
  )
  assert.deepEqual(list.map((s) => s.goal.name), ['Gần', 'Xa', 'Xong'])
})

test('mục tiêu đã cất đi thì không hiện nữa', () => {
  const list = goalStates([goal({ name: 'Cũ', target: 1, archived: true })], VI, SO_DU, [], '2026-09', 1)
  assert.equal(list.length, 0)
})

/**
 * Hai mục tiêu cùng trỏ vào một ví thì cả hai cùng hiện một số dư — cả hai đều
 * sai, và không có gì báo. Màn hình phải chặn trước lúc tạo.
 */
test('chỉ ra ví đã bị mục tiêu khác nhận', () => {
  const list = [goal({ name: 'A', target: 1, walletId: 'tietkiem' }), goal({ name: 'B', target: 1, walletId: 'chinh' })]
  assert.deepEqual([...claimedWallets(list)].sort(), ['chinh', 'tietkiem'])
  assert.deepEqual([...claimedWallets(list, 'A')], ['chinh'], 'sửa mục tiêu nào thì ví của chính nó vẫn chọn được')
})
