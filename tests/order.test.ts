/**
 * Kiểm thử thứ tự hiển thị của ví và danh mục.
 *
 * Bài kiểm này sinh ra từ một lỗi lộ ra khi rà trên máy: màn hình chuyển tiền
 * mở ra với ví nguồn TRÙNG ví đích, nên nút Chuyển bị tắt ngay từ đầu. Nguyên
 * nhân không nằm ở màn hình đó mà ở tầng dưới — Dexie trả về theo thứ tự UUID,
 * tức ngẫu nhiên, nên "ví thứ nhất" và "ví thứ hai" là hai ví bất kỳ.
 *
 * Cùng một nguyên nhân làm lưới chip danh mục trong biểu mẫu xếp lộn xộn, và
 * làm ví mặc định của ô nhập nhanh trở thành một ví tuỳ tiện.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import 'fake-indexeddb/auto'

import { byCreation, ordered } from '../src/lib/order'

const { db, backfillOrder, seedIfEmpty, stamp } = await import('../src/db/db')

/* ================= phép so sánh ================= */

test('bản ghi tạo trước đứng trước', () => {
  const rows = [
    { name: 'C', createdAt: 2 },
    { name: 'A', createdAt: 0 },
    { name: 'B', createdAt: 1 },
  ]
  assert.deepEqual(ordered(rows).map((r) => r.name), ['A', 'B', 'C'])
})

test('không đụng vào mảng gốc', () => {
  const rows = [{ name: 'B', createdAt: 1 }, { name: 'A', createdAt: 0 }]
  ordered(rows)
  assert.equal(rows[0].name, 'B')
})

/**
 * Bản ghi chưa qua di trú phải xuống CUỐI.
 *
 * Đẩy chúng lên đầu sẽ xáo trộn thứ tự người dùng đang quen, đúng vào lúc
 * nâng cấp — thời điểm tệ nhất để mọi thứ đổi chỗ.
 */
test('bản ghi chưa có mốc tạo xuống cuối', () => {
  const rows = [{ name: 'Cũ' }, { name: 'Mới', createdAt: 5 }]
  assert.deepEqual(ordered(rows).map((r) => r.name), ['Mới', 'Cũ'])
})

test('cùng mốc thì so tên, kết quả luôn xác định', () => {
  const rows = [{ name: 'Ăn uống', createdAt: 1 }, { name: 'Đi lại', createdAt: 1 }]
  // Hai lần sắp phải ra cùng một thứ tự, không được đổi chỗ giữa hai lần mở app
  assert.deepEqual(ordered(rows), ordered([...rows].reverse()))
})

test('so sánh trả về 0 khi thật sự bằng nhau', () => {
  assert.equal(byCreation({ name: 'A', createdAt: 1 }, { name: 'A', createdAt: 1 }), 0)
})

/* ================= dữ liệu mặc định ================= */

test('bộ hạt giống mang đúng thứ tự người dùng mong đợi', async () => {
  await seedIfEmpty()
  const wallets = ordered(await db.wallets.toArray())
  assert.deepEqual(
    wallets.map((w) => w.name),
    ['Tiền mặt', 'Ngân hàng', 'Ví điện tử'],
    'ví đầu tiên là ví mặc định của ô nhập nhanh — không được là một ví bất kỳ',
  )

  const cats = ordered(await db.categories.toArray())
  assert.equal(cats[0].name, 'Ăn uống', 'danh mục hay dùng nhất phải đứng đầu lưới chip')
})

test('ví mặc định của màn chuyển tiền là hai ví KHÁC nhau', async () => {
  const active = ordered(await db.wallets.toArray()).filter((w) => !w.archived)
  assert.ok(active.length >= 2)
  assert.notEqual(active[0].id, active[1].id, 'trùng nhau thì nút Chuyển bị tắt ngay lúc mở màn hình')
})

/* ================= di trú ================= */

test('bản ghi cũ được gán thứ tự, giữ đúng thứ tự quen thuộc', async () => {
  // Giả lập dữ liệu từ bản trước: không bản ghi nào có mốc tạo
  await db.wallets.clear()
  await db.wallets.bulkAdd([
    stamp({ name: 'Ví điện tử', kind: 'ewallet' as const, icon: '📱', color: '#d4679f', openingBalance: 0 }),
    stamp({ name: 'Quỹ riêng', kind: 'cash' as const, icon: '🎒', color: '#03aa8e', openingBalance: 0 }),
    stamp({ name: 'Tiền mặt', kind: 'cash' as const, icon: '👛', color: '#73a434', openingBalance: 0 }),
    stamp({ name: 'Ngân hàng', kind: 'bank' as const, icon: '🏦', color: '#2b99e7', openingBalance: 0 }),
  ])

  const changed = await backfillOrder()
  assert.ok(changed >= 4)

  const after = ordered(await db.wallets.toArray())
  assert.deepEqual(
    after.map((w) => w.name),
    ['Tiền mặt', 'Ngân hàng', 'Ví điện tử', 'Quỹ riêng'],
    'ví trùng tên bộ hạt giống lấy đúng thứ tự cũ; ví người dùng tự thêm xếp sau',
  )
})

test('chạy lại lần nữa không đổi gì', async () => {
  const truoc = ordered(await db.wallets.toArray()).map((w) => w.name)
  assert.equal(await backfillOrder(), 0, 'không còn bản ghi nào thiếu mốc tạo')
  assert.deepEqual(ordered(await db.wallets.toArray()).map((w) => w.name), truoc)
})

test('ví tạo mới luôn xếp sau ví có sẵn', async () => {
  await db.wallets.add(
    stamp({ name: 'Ví mới', kind: 'saving' as const, icon: '🏆', color: '#ac9008', openingBalance: 0, createdAt: Date.now() }),
  )
  const after = ordered(await db.wallets.toArray())
  assert.equal(after.at(-1)?.name, 'Ví mới', 'mốc tạo của bộ hạt giống là số nhỏ nên luôn đứng trước')
})
