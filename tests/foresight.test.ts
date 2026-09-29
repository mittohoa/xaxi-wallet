/**
 * Kiểm thử ba thứ nhìn về phía trước: khoản sắp tới, dự báo cuối kỳ, và cảnh
 * báo số tiền bất thường.
 *
 * Cả ba đều nói với người dùng một con số mà họ không tự tính được. Nên điều
 * phải canh chặt nhất không phải là "có ra số không" mà là **KHI NÀO IM LẶNG**:
 * dự báo từ dữ liệu thủng là bịa số, và cảnh báo hay báo nhầm thì chỉ vài lần
 * là bị bấm bỏ qua theo phản xạ — kể cả lúc nó báo đúng.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { committedRemaining, daysInclusive, forecast, occurrencesBetween, upcoming } from '../src/lib/foresight'
import { checkAmount } from '../src/lib/learn'
import type { Recurring, Transaction } from '../src/types'

const KY = { start: '2026-09-01', end: '2026-09-30' }

function rule(over: Partial<Recurring> & Pick<Recurring, 'name' | 'amount' | 'nextDate'>): Recurring {
  return {
    id: over.name,
    kind: 'expense',
    categoryId: 'cat',
    walletId: 'vi',
    freq: 'monthly',
    anchor: Number(over.nextDate.slice(8, 10)),
    active: true,
    updatedAt: 1,
    ...over,
  } as Recurring
}

let seq = 0
function tx(amount: number, date: string, over: Partial<Transaction> = {}): Transaction {
  return {
    id: String(++seq),
    kind: 'expense',
    amount,
    categoryId: 'cat',
    walletId: 'vi',
    date,
    createdAt: seq,
    updatedAt: seq,
    ...over,
  }
}

/* ================= đếm ngày ================= */

test('đếm ngày tính cả hai đầu', () => {
  assert.equal(daysInclusive('2026-09-01', '2026-09-01'), 1)
  assert.equal(daysInclusive('2026-09-01', '2026-09-12'), 12)
  assert.equal(daysInclusive('2026-09-12', '2026-09-01'), 0, 'đảo ngược thì trả 0 chứ không âm')
})

/* ================= khoản sắp tới ================= */

test('liệt kê khoản sắp tới, gần nhất trước', () => {
  const rules = [
    rule({ name: 'Tiền nhà', amount: 4_500_000, nextDate: '2026-10-03' }),
    rule({ name: 'Internet', amount: 220_000, nextDate: '2026-09-20' }),
    rule({ name: 'Netflix', amount: 180_000, nextDate: '2026-09-15' }),
  ]
  const list = upcoming(rules, '2026-09-12', KY.end)

  assert.deepEqual(
    list.map((u) => u.rule.name),
    ['Netflix', 'Internet'],
    'tiền nhà rơi sang tháng sau nên không nằm trong kỳ này',
  )
  assert.equal(list[0].daysAway, 3)
})

test('quy tắc đang tạm dừng không được liệt kê', () => {
  const rules = [rule({ name: 'Gym', amount: 500_000, nextDate: '2026-09-15', active: false })]
  assert.equal(upcoming(rules, '2026-09-12', KY.end).length, 0)
})

test('quy tắc hàng ngày chỉ chiếm một chỗ', () => {
  const rules = [
    rule({ name: 'Ăn trưa', amount: 50_000, nextDate: '2026-09-13', freq: 'daily' }),
    rule({ name: 'Internet', amount: 220_000, nextDate: '2026-09-20' }),
  ]
  const list = upcoming(rules, '2026-09-12', KY.end)
  assert.equal(list.length, 2, 'quy tắc hàng ngày mà liệt kê hết thì chiếm sạch danh sách')
  assert.equal(list.filter((u) => u.rule.name === 'Ăn trưa').length, 1)
})

test('đếm đủ mọi lần đến hạn của quy tắc hàng tuần', () => {
  const r = rule({ name: 'Học', amount: 300_000, nextDate: '2026-09-07', freq: 'weekly' })
  assert.deepEqual(occurrencesBetween(r, '2026-09-01', '2026-09-30'), [
    '2026-09-07',
    '2026-09-14',
    '2026-09-21',
    '2026-09-28',
  ])
})

test('khoản định kỳ còn lại chỉ tính từ NGÀY MAI trở đi', () => {
  const rules = [rule({ name: 'Internet', amount: 220_000, nextDate: '2026-09-12' })]
  // Khoản của hôm nay đã được postDueRecurring ghi vào giao dịch rồi,
  // cộng thêm lần nữa là đếm đôi.
  assert.equal(committedRemaining(rules, '2026-09-12', KY.end), 0)
  assert.equal(committedRemaining(rules, '2026-09-11', KY.end), 220_000)
})

/* ================= dự báo ================= */

test('dự báo tách chi định kỳ khỏi nhịp chi hằng ngày', () => {
  // 11 ngày đã qua: tiền nhà 4,5tr ghi ngày mùng 3, cộng 11 ngày ăn uống 100k
  const txs = [
    tx(4_500_000, '2026-09-03', { source: 'recurring' }),
    ...Array.from({ length: 11 }, (_, i) => tx(100_000, `2026-09-${String(i + 1).padStart(2, '0')}`)),
  ]
  const f = forecast(txs, [], '2026-09-11', KY, 1)

  assert.equal(f.spent, 5_600_000)
  assert.equal(f.dailyRate, 100_000, 'tiền nhà không được nhân lên cho cả tháng')
  assert.equal(f.daysLeft, 19)
  assert.equal(f.projected, 5_600_000 + 100_000 * 19)
  assert.equal(f.confident, true)
})

test('dự báo cộng khoản định kỳ chưa tới hạn', () => {
  const txs = Array.from({ length: 10 }, (_, i) => tx(100_000, `2026-09-${String(i + 1).padStart(2, '0')}`))
  const rules = [rule({ name: 'Tiền nhà', amount: 4_500_000, nextDate: '2026-09-25' })]
  const f = forecast(txs, rules, '2026-09-10', KY, 1)

  assert.equal(f.committed, 4_500_000)
  assert.equal(f.projected, 1_000_000 + 100_000 * 20 + 4_500_000)
})

test('im lặng khi chưa đủ căn cứ', () => {
  const som = [tx(100_000, '2026-09-01'), tx(100_000, '2026-09-02')]
  assert.equal(forecast(som, [], '2026-09-02', KY, 1).confident, false, 'hai ngày thì chưa có nhịp nào')

  const du = Array.from({ length: 10 }, (_, i) => tx(100_000, `2026-09-${String(i + 1).padStart(2, '0')}`))
  assert.equal(forecast(du, [], '2026-09-10', KY, 0.3).confident, false, 'dữ liệu thủng thì dự báo là bịa số')
  assert.equal(forecast([], [], '2026-09-10', KY, 1).confident, false, 'chưa ghi khoản nào thì không có gì để suy ra')
  assert.equal(forecast(du, [], '2026-09-30', KY, 1).confident, false, 'hết kỳ rồi thì không còn gì để dự báo')
  assert.equal(
    forecast(du, [], '2026-09-29', KY, 1).confident,
    false,
    'còn một ngày thì dự báo gần bằng số đã chi — đúng nhưng vô dụng',
  )
})

test('chuyển tiền giữa ví không được tính vào dự báo', () => {
  const txs = [
    ...Array.from({ length: 10 }, (_, i) => tx(100_000, `2026-09-${String(i + 1).padStart(2, '0')}`)),
    tx(5_000_000, '2026-09-05', { transferId: 'ck-1' }),
  ]
  const f = forecast(txs, [], '2026-09-10', KY, 1)
  assert.equal(f.spent, 1_000_000, 'tiền chỉ đổi chỗ, không phải chi tiêu')
})

/* ================= cảnh báo số tiền ================= */

const CA_PHE = Array.from({ length: 8 }, (_, i) => tx(35_000, `2026-08-${String(i + 1).padStart(2, '0')}`))

test('bắt được lỗi gõ thừa một số 0', () => {
  const w = checkAmount(350_000, 'cat', 'expense', CA_PHE)
  assert.ok(w, 'gấp mười lần thói quen thì phải hỏi lại')
  assert.equal(w.typical, 35_000)
  assert.equal(w.likelyZeroTypo, true)
  assert.equal(w.samples, 8)
})

test('im lặng với số tiền bình thường', () => {
  assert.equal(checkAmount(35_000, 'cat', 'expense', CA_PHE), null)
  assert.equal(checkAmount(60_000, 'cat', 'expense', CA_PHE), null)
  assert.equal(checkAmount(120_000, 'cat', 'expense', CA_PHE), null, 'gấp ba thì vẫn là một bữa đắt, không phải lỗi')
})

test('im lặng khi chưa đủ mẫu để biết thói quen', () => {
  const it = CA_PHE.slice(0, 3)
  assert.equal(checkAmount(350_000, 'cat', 'expense', it), null)
})

/**
 * Điều kiện quan trọng nhất: đã từng chi lớn như vậy thì đừng hỏi nữa.
 *
 * Không có nó thì một bữa nhậu 500k trong danh mục Ăn uống thường 50k sẽ bị hỏi
 * lại mỗi lần, và một cảnh báo hay báo nhầm thì chỉ vài lần là bị bấm bỏ qua
 * theo phản xạ — kể cả lúc nó báo đúng.
 */
test('im lặng khi người dùng từng chi lớn như vậy trong danh mục này', () => {
  const co_bua_lon = [...CA_PHE, tx(400_000, '2026-08-20')]
  assert.equal(checkAmount(450_000, 'cat', 'expense', co_bua_lon), null)
  assert.ok(checkAmount(4_000_000, 'cat', 'expense', co_bua_lon), 'nhưng gấp mười lần kỷ lục thì vẫn phải hỏi')
})

test('không học từ khoản ước tính do đối soát sinh ra', () => {
  const ban = Array.from({ length: 8 }, (_, i) =>
    tx(2_000_000, `2026-08-${String(i + 1).padStart(2, '0')}`, { source: 'reconcile' as const, estimated: true }),
  )
  assert.equal(checkAmount(350_000, 'cat', 'expense', ban), null, 'không có mẫu thật nào thì im lặng')
})

test('không lẫn khoản thu với khoản chi', () => {
  const luong = Array.from({ length: 8 }, (_, i) =>
    tx(18_000_000, `2026-0${i + 1}-05`, { kind: 'income' as const }),
  )
  assert.equal(checkAmount(350_000, 'cat', 'expense', luong), null)
})
