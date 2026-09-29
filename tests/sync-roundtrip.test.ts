/**
 * Đi trọn một vòng qua cơ sở dữ liệu thật: xuất → mã hoá → nhập → hợp nhất.
 *
 * `sync.test.ts` kiểm từng mảnh riêng bằng hàm thuần. Tệp này kiểm chỗ chúng
 * gặp nhau và gặp Dexie — nơi những thứ đúng-từng-phần vẫn hỏng khi ghép lại:
 * bảng bị bỏ sót, ghi đè nhầm thành xoá sạch, hoặc hợp nhất hai lần lại sinh ra
 * thay đổi giả và chạy mãi không dừng.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import 'fake-indexeddb/auto'

const { SYNC_TABLES, db, live, softDelete, stamp } = await import('../src/db/db')
const { buildBackup } = await import('../src/lib/backup')
const { applySyncFile, buildSyncFile, syncFileName } = await import('../src/lib/sync/apply')

const MK = 'cụm mật khẩu để thử'

async function reset() {
  for (const name of SYNC_TABLES) await db.table(name).clear()
}

function danhMuc(name: string) {
  return stamp({ name, kind: 'expense' as const, icon: '🍜', color: '#73a434' })
}

function vi(name: string) {
  return stamp({ name, kind: 'cash' as const, icon: '👛', color: '#73a434', openingBalance: 0 })
}

function giaoDich(note: string, categoryId: string, walletId: string, amount = 35_000) {
  return stamp({ date: '2026-09-30', kind: 'expense' as const, amount, note, categoryId, walletId })
}

async function dungDuLieu() {
  await reset()
  const c = danhMuc('Ăn uống')
  const w = vi('Tiền mặt')
  await db.categories.add(c)
  await db.wallets.add(w)
  await db.transactions.bulkAdd([giaoDich('cà phê', c.id, w.id), giaoDich('ăn trưa', c.id, w.id, 79_000)])
  return { c, w }
}

/* ================= vòng tròn ================= */

test('xuất, xoá sạch, nhập lại — dữ liệu quay về nguyên vẹn', async () => {
  const { c } = await dungDuLieu()
  const truoc = await buildBackup()

  const tep = await buildSyncFile(MK)
  await reset()
  assert.equal((await db.transactions.toArray()).length, 0, 'đã xoá sạch thật')

  const r = await applySyncFile(tep, MK)
  assert.equal(r.added, truoc.data.categories.length + truoc.data.wallets.length + truoc.data.transactions.length)

  const sau = await buildBackup()
  assert.deepEqual(sau.data.transactions, truoc.data.transactions)
  assert.deepEqual(sau.data.categories, truoc.data.categories)
  assert.equal((await db.categories.get(c.id))?.name, 'Ăn uống')
})

test('nhập lần hai không sinh thay đổi nào — nếu không thì đồng bộ chạy mãi', async () => {
  await dungDuLieu()
  const tep = await buildSyncFile(MK)

  await applySyncFile(tep, MK)
  const r = await applySyncFile(tep, MK)
  assert.equal(r.added, 0)
  assert.equal(r.updated, 0)
  assert.equal(r.collapsed, 0)
})

test('sai cụm mật khẩu thì KHÔNG đụng gì tới dữ liệu đang có', async () => {
  const { c } = await dungDuLieu()
  const tep = await buildSyncFile(MK)

  await db.transactions.clear()
  await assert.rejects(() => applySyncFile(tep, 'sai mật khẩu'))

  // Thất bại phải xảy ra TRƯỚC khi ghi, không phải ghi được nửa chừng rồi hỏng
  assert.equal((await db.transactions.toArray()).length, 0)
  assert.ok(await db.categories.get(c.id), 'dữ liệu còn lại không bị đụng tới')
})

/* ================= hai máy ================= */

/**
 * Cảnh thật hay gặp nhất: cài app lên máy thứ hai, nó tự gieo bộ danh mục mặc
 * định, rồi mới nhập tệp từ máy thứ nhất. Hai bên đều có "Ăn uống" với hai UUID
 * khác nhau.
 */
test('máy thứ hai đã tự gieo danh mục rồi mới nhập', async () => {
  // máy A
  const { c: cA, w: wA } = await dungDuLieu()
  const tepA = await buildSyncFile(MK)

  // máy B: danh mục cùng tên, id khác, và một khoản chi của riêng nó
  await reset()
  const cB = danhMuc('Ăn uống')
  const wB = vi('Tiền mặt')
  await db.categories.add(cB)
  await db.wallets.add(wB)
  await db.transactions.add(giaoDich('phở', cB.id, wB.id, 50_000))

  await applySyncFile(tepA, MK)

  const dm = live(await db.categories.toArray())
  assert.equal(dm.length, 1, 'hai "Ăn uống" phải gộp làm một')

  const tx = live(await db.transactions.toArray())
  assert.equal(tx.length, 3, 'giữ đủ cả ba khoản chi')
  assert.deepEqual(
    [...new Set(tx.map((t) => t.categoryId))],
    [dm[0].id],
    'mọi giao dịch phải trỏ vào danh mục còn sống — nếu không thì một phần số liệu mồ côi',
  )
  assert.ok([cA.id, cB.id].includes(dm[0].id))
  assert.ok([wA.id, wB.id].includes(live(await db.wallets.toArray())[0].id))
})

/**
 * Lý do bia mộ tồn tại, kiểm qua đường thật: máy A xoá một khoản, máy B chưa
 * biết. Nhập tệp của B vào A không được làm khoản đó sống lại.
 */
test('khoản đã xoá ở máy này không mọc lại từ máy chưa biết tin', async () => {
  const { c, w } = await dungDuLieu()
  const tepCu = await buildSyncFile(MK) // ảnh chụp lúc khoản còn sống

  const tx = live(await db.transactions.toArray())
  const bo = tx.find((t) => t.note === 'cà phê')!
  await softDelete('transactions', bo.id)
  assert.equal(live(await db.transactions.toArray()).length, 1)

  await applySyncFile(tepCu, MK)

  const conLai = live(await db.transactions.toArray())
  assert.equal(conLai.length, 1, 'khoản đã xoá không được sống lại')
  assert.equal(conLai[0].note, 'ăn trưa')
  assert.ok(c.id && w.id)
})

test('xoá ở máy kia thì máy này cũng xoá theo', async () => {
  const { c, w } = await dungDuLieu()

  // máy kia: cùng dữ liệu, nhưng đã xoá một khoản
  const tx = live(await db.transactions.toArray())
  const bo = tx.find((t) => t.note === 'cà phê')!
  await softDelete('transactions', bo.id)
  const tepMoi = await buildSyncFile(MK)

  // dựng lại máy này ở trạng thái CŨ, khi khoản đó còn sống
  await reset()
  await db.categories.add(c)
  await db.wallets.add(w)
  await db.transactions.bulkAdd(tx)
  assert.equal(live(await db.transactions.toArray()).length, 2)

  await applySyncFile(tepMoi, MK)
  assert.equal(live(await db.transactions.toArray()).length, 1, 'tin đã xoá phải lan sang')
})

/* ================= không bỏ sót bảng nào ================= */

/**
 * Dễ thêm một bảng vào lược đồ rồi quên nối vào đường đồng bộ. Hỏng kiểu đó im
 * lặng tuyệt đối: mọi thứ khác đồng bộ đúng, chỉ riêng một bảng đứng yên.
 */
test('mọi bảng trong SYNC_TABLES đều đi qua được vòng tròn', async () => {
  await reset()
  const c = danhMuc('Ăn uống')
  const w = vi('Tiền mặt')
  await db.categories.add(c)
  await db.wallets.add(w)
  await db.transactions.add(giaoDich('cà phê', c.id, w.id))
  await db.budgets.add(stamp({ month: '2026-09', categoryId: c.id, limit: 1_000_000 }))
  await db.dayMarks.add(stamp({ date: '2026-09-29', markedAt: Date.now() }))
  await db.templates.add(stamp({ label: 'trà sữa', kind: 'expense' as const, amount: 35_000, categoryId: c.id, walletId: w.id, uses: 1 }))
  await db.recurring.add(stamp({ name: 'Tiền nhà', kind: 'expense' as const, amount: 4_500_000, categoryId: c.id, walletId: w.id, freq: 'monthly' as const, nextDate: '2026-10-01', active: true }))
  await db.goals.add(stamp({ name: 'Mua xe', walletId: w.id, target: 50_000_000 }))
  await db.settings.add(stamp({ currency: 'VND', locale: 'vi', theme: 'system' as const, startDayOfMonth: 1, gapWindowDays: 14, nudgeAfterGapDays: 3, reconcileEveryDays: 7 }))

  const dem = new Map<string, number>()
  for (const name of SYNC_TABLES) dem.set(name, (await db.table(name).toArray()).length)

  const tep = await buildSyncFile(MK)
  await reset()
  await applySyncFile(tep, MK)

  for (const name of SYNC_TABLES) {
    assert.equal((await db.table(name).toArray()).length, dem.get(name), `bảng ${name} không đi qua được vòng tròn`)
  }
})

/**
 * Ngày trong tên tệp phải theo giờ ĐỊA PHƯƠNG.
 *
 * `toISOString()` trả về ngày UTC; ở Việt Nam (UTC+7) thì từ 0h tới 7h sáng nó
 * lùi một ngày. Lỗi này đã lộ ra trên máy thật lúc 1h13 sáng: bản sao lưu ghi
 * 30/09 còn tệp đồng bộ xuất sau đó vài giây ghi 29/09.
 */
test('ngày trong tên tệp theo giờ địa phương, không phải UTC', async () => {
  const { todayISO } = await import('../src/lib/date')
  assert.equal(syncFileName(), `xaxi-dong-bo-${todayISO()}.xaxi`)
})
