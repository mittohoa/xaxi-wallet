/**
 * Kiểm bia mộ — nền móng của đồng bộ đa thiết bị.
 *
 * Xoá hẳn một bản ghi thì máy thứ hai không có cách nào biết chuyện gì đã xảy
 * ra: nó vẫn giữ bản đó, thấy máy này thiếu, và gửi ngược về. Khoản chi vừa xoá
 * mọc lại ở cả hai máy.
 *
 * Nhưng bia mộ chỉ đúng nếu MỌI đường đọc đều lọc nó ra. Quên một chỗ thì khoản
 * đã xoá hiện lại đúng ở đó, và vì các chỗ khác vẫn đúng nên lỗi nhìn như dữ
 * liệu hỏng chứ không như một chỗ quên lọc. Đó là thứ các bài kiểm dưới đây
 * canh.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import 'fake-indexeddb/auto'

const { db, live, purgeTombstones, softDelete, stamp } = await import('../src/db/db')
const { buildBackup } = await import('../src/lib/backup')
const { markNoSpend, unmarkNoSpend } = await import('../src/lib/actions')

async function reset() {
  for (const name of ['categories', 'wallets', 'transactions', 'budgets', 'dayMarks', 'templates', 'recurring', 'goals', 'settings']) {
    await db.table(name).clear()
  }
}

const NGAY = '2026-09-30'

function giaoDich(note: string) {
  return stamp({ date: NGAY, kind: 'expense' as const, amount: 35_000, note, categoryId: null, walletId: null })
}

/* ================= xoá mềm ================= */

test('xoá mềm giữ lại bản ghi và đánh dấu đã xoá', async () => {
  await reset()
  const row = giaoDich('cà phê')
  await db.transactions.add(row)

  const truoc = Date.now()
  await softDelete('transactions', row.id)

  const sau = await db.transactions.get(row.id)
  assert.ok(sau, 'bản ghi phải còn nằm trong bảng — đó là toàn bộ ý nghĩa của bia mộ')
  assert.ok(sau.deletedAt !== undefined && sau.deletedAt >= truoc, 'phải có mốc xoá')
  assert.ok(sau.updatedAt >= truoc, 'mốc sửa phải mới lên, nếu không hợp nhất sẽ thua bản cũ ở máy kia')
  assert.ok(sau.deviceId, 'phải biết máy nào đã xoá')
})

test('bia mộ biến mất khỏi mọi thứ người dùng nhìn thấy', async () => {
  await reset()
  const a = giaoDich('cà phê')
  const b = giaoDich('xăng')
  await db.transactions.bulkAdd([a, b])
  await softDelete('transactions', a.id)

  const thay = live(await db.transactions.toArray())
  assert.equal(thay.length, 1)
  assert.equal(thay[0].note, 'xăng')
})

test('xoá nhiều bản cùng lúc — hai vế của một lần chuyển tiền', async () => {
  await reset()
  const rows = [giaoDich('đi'), giaoDich('đến'), giaoDich('không liên quan')]
  await db.transactions.bulkAdd(rows)

  assert.equal(await softDelete('transactions', [rows[0].id, rows[1].id]), 2)
  assert.deepEqual(live(await db.transactions.toArray()).map((t) => t.note), ['không liên quan'])
})

test('xoá danh sách rỗng không đụng gì', async () => {
  await reset()
  await db.transactions.add(giaoDich('cà phê'))
  assert.equal(await softDelete('transactions', []), 0)
  assert.equal(live(await db.transactions.toArray()).length, 1)
})

/* ================= ngày không chi tiêu ================= */

/**
 * `dayMarks.date` là chỉ mục DUY NHẤT. Sau khi bỏ đánh dấu, bia mộ vẫn chiếm
 * chỗ ngày đó, nên đánh dấu lại mà thêm bản mới là vi phạm ràng buộc duy nhất —
 * lỗi xảy ra ở tầng IndexedDB, nơi giao diện không bắt được.
 */
test('bỏ đánh dấu rồi đánh dấu lại cùng một ngày', async () => {
  await reset()
  await markNoSpend(NGAY)
  assert.equal(live(await db.dayMarks.toArray()).length, 1)

  await unmarkNoSpend(NGAY)
  assert.equal(live(await db.dayMarks.toArray()).length, 0)
  assert.equal((await db.dayMarks.toArray()).length, 1, 'bia mộ vẫn phải còn')

  await markNoSpend(NGAY)
  const con = live(await db.dayMarks.toArray())
  assert.equal(con.length, 1, 'đánh dấu lại phải dựng lại bản cũ')
  assert.equal(con[0].deletedAt, undefined)
  assert.equal((await db.dayMarks.toArray()).length, 1, 'không được sinh thêm bản trùng ngày')
})

test('bỏ đánh dấu hai lần không sinh thêm gì', async () => {
  await reset()
  await markNoSpend(NGAY)
  await unmarkNoSpend(NGAY)
  const lan1 = await db.dayMarks.get({ date: NGAY })
  await unmarkNoSpend(NGAY)
  const lan2 = await db.dayMarks.get({ date: NGAY })
  assert.equal(lan1?.deletedAt, lan2?.deletedAt, 'mốc xoá không được dời đi mỗi lần gọi lại')
})

/* ================= bản sao lưu ================= */

/**
 * Lọc bia mộ khỏi bản sao lưu thì khôi phục trên máy thứ hai sẽ làm sống lại
 * đúng những bản ghi người dùng đã xoá.
 */
test('bản sao lưu MANG THEO bia mộ', async () => {
  await reset()
  const row = giaoDich('đã xoá')
  await db.transactions.add(row)
  await softDelete('transactions', row.id)

  const backup = await buildBackup()
  const trong = backup.data.transactions.find((t) => t.id === row.id)
  assert.ok(trong, 'bản đã xoá vẫn phải nằm trong tệp sao lưu')
  assert.ok(trong.deletedAt, 'kèm theo mốc xoá')
})

/* ================= dọn bia mộ ================= */

test('chỉ dọn bia mộ đã quá cũ', async () => {
  await reset()
  const cu = giaoDich('rất cũ')
  const moi = giaoDich('mới xoá')
  const song = giaoDich('còn sống')
  await db.transactions.bulkAdd([cu, moi, song])

  const now = Date.now()
  const NGAN = 86_400_000
  await db.transactions.update(cu.id, { deletedAt: now - 200 * NGAN, updatedAt: now - 200 * NGAN })
  await db.transactions.update(moi.id, { deletedAt: now - 10 * NGAN, updatedAt: now - 10 * NGAN })

  assert.equal(await purgeTombstones(now), 1)

  const con = await db.transactions.toArray()
  assert.equal(con.length, 2)
  assert.equal(con.some((t) => t.id === cu.id), false, 'bia mộ 200 ngày phải bị dọn')
  assert.ok(con.some((t) => t.id === moi.id), 'bia mộ 10 ngày phải giữ lại')
  assert.ok(con.some((t) => t.id === song.id), 'bản còn sống không bao giờ bị đụng tới')
})

test('không có bia mộ nào thì dọn xong không đổi gì', async () => {
  await reset()
  await db.transactions.add(giaoDich('cà phê'))
  assert.equal(await purgeTombstones(), 0)
  assert.equal((await db.transactions.toArray()).length, 1)
})
