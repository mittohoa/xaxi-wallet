/**
 * Kiểm thử bộ di trú từ CSDL bản đầu (khoá số tự tăng) sang bản mới (khoá UUID).
 *
 * Đây là đoạn mã đụng thẳng vào dữ liệu thật của người dùng, nên phải chứng
 * minh được: khoá ngoại được nối lại đúng, bản ghi mồ côi bị bỏ chứ không giữ
 * id hỏng, và bản cũ chỉ bị xoá sau khi bản mới đã ghi xong.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import 'fake-indexeddb/auto'

const Dexie = (await import('dexie')).default
const { db, LEGACY_DB_NAME } = await import('../src/db/db')
const { migrateLegacyDatabase } = await import('../src/db/migrate')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Dựng một CSDL đúng theo lược đồ bản đầu, với dữ liệu khoá số */
async function buildLegacy() {
  const legacy = new Dexie(LEGACY_DB_NAME)
  legacy.version(1).stores({
    categories: '++id, name, kind, slug',
    wallets: '++id, name, kind, archived',
    transactions: '++id, date, kind, categoryId, walletId, createdAt, recurringId',
    budgets: '++id, month, categoryId, [month+categoryId]',
    dayMarks: '++id, &date',
    templates: '++id, kind, uses, pinned',
    recurring: '++id, nextDate, active',
    settings: '++id',
  })
  await legacy.open()

  await legacy.table('categories').bulkAdd([
    { id: 1, name: 'Ăn uống', kind: 'expense', icon: '🍜', color: '#eb6834' },
    { id: 2, name: 'Lương', kind: 'income', icon: '💼', color: '#2a78d6' },
  ])
  await legacy.table('wallets').bulkAdd([
    { id: 1, name: 'Tiền mặt', kind: 'cash', icon: '👛', color: '#1baf7a', openingBalance: 500_000 },
    { id: 2, name: 'Ngân hàng', kind: 'bank', icon: '🏦', color: '#2a78d6', openingBalance: 0 },
  ])
  await legacy.table('recurring').add({
    id: 7,
    name: 'Tiền nhà',
    kind: 'expense',
    amount: 4_500_000,
    categoryId: 1,
    walletId: 2,
    freq: 'monthly',
    anchor: 3,
    nextDate: '2026-10-03',
    active: true,
  })
  await legacy.table('transactions').bulkAdd([
    { id: 1, kind: 'expense', amount: 35_000, categoryId: 1, walletId: 1, date: '2026-09-01', note: 'cà phê', createdAt: 1 },
    { id: 2, kind: 'income', amount: 18_000_000, categoryId: 2, walletId: 2, date: '2026-09-05', createdAt: 2, recurringId: 7 },
    // Ban ghi mo coi: tro toi danh muc khong ton tai
    { id: 3, kind: 'expense', amount: 99_000, categoryId: 999, walletId: 1, date: '2026-09-06', createdAt: 3 },
  ])
  await legacy.table('budgets').add({ id: 1, categoryId: 1, month: '2026-09', limit: 4_000_000 })
  await legacy.table('dayMarks').add({ id: 1, date: '2026-09-03', markedAt: 1 })
  await legacy.table('settings').add({ id: 1, currency: 'VND', locale: 'vi-VN', theme: 'system', startDayOfMonth: 1 })
  legacy.close()
}

test('di trú đổi khoá sang UUID và nối lại đúng khoá ngoại', async () => {
  await buildLegacy()

  const result = await migrateLegacyDatabase()
  assert.equal(result.ran, true)

  const categories = await db.categories.toArray()
  const wallets = await db.wallets.toArray()
  const transactions = await db.transactions.toArray()
  const budgets = await db.budgets.toArray()
  const recurring = await db.recurring.toArray()

  assert.equal(categories.length, 2)
  assert.equal(wallets.length, 2)
  assert.equal(recurring.length, 1)

  for (const row of [...categories, ...wallets, ...transactions, ...recurring]) {
    assert.match(row.id, UUID, 'mọi khoá chính phải là UUID')
    assert.ok(row.updatedAt > 0, 'phải có mốc sửa để về sau hợp nhất được')
    assert.ok(row.deviceId, 'phải ghi thiết bị tạo ra bản ghi')
  }

  // Khoa ngoai phai tro dung sang id moi, khong phai giu so cu
  const anUong = categories.find((c) => c.name === 'Ăn uống')!
  const tienMat = wallets.find((w) => w.name === 'Tiền mặt')!
  const caPhe = transactions.find((t) => t.note === 'cà phê')!
  assert.equal(caPhe.categoryId, anUong.id)
  assert.equal(caPhe.walletId, tienMat.id)

  assert.equal(budgets[0].categoryId, anUong.id)

  const luong = transactions.find((t) => t.amount === 18_000_000)!
  assert.equal(luong.recurringId, recurring[0].id, 'liên kết tới quy tắc định kỳ phải được nối lại')
})

test('bản ghi mồ côi bị bỏ chứ không giữ khoá hỏng', async () => {
  const transactions = await db.transactions.toArray()
  assert.equal(transactions.length, 2, 'giao dịch trỏ tới danh mục không tồn tại phải bị loại')
  assert.equal(
    transactions.some((t) => t.amount === 99_000),
    false,
  )
})

test('bản cũ được xoá sau khi bản mới đã ghi xong', async () => {
  assert.equal(await Dexie.exists(LEGACY_DB_NAME), false)
})

test('chạy lại lần nữa thì không làm gì và không nhân đôi dữ liệu', async () => {
  const before = await db.transactions.count()
  const result = await migrateLegacyDatabase()
  assert.equal(result.ran, false)
  assert.equal(await db.transactions.count(), before)
})
