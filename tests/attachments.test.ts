/**
 * Kiểm thử ảnh biên lai.
 *
 * Bài kiểm quan trọng nhất trong tệp này không phải chuyện đọc ghi, mà là
 * "ảnh không được rời khỏi máy". Đó là một lời hứa với người dùng, và lời hứa
 * thì phải có thứ canh — không thì một hôm nào đó ai đó thêm `attachments` vào
 * `SYNC_TABLES` cho tiện và không ai nhận ra.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import 'fake-indexeddb/auto'

const { db, SYNC_TABLES, newId, stamp, wipeAll } = await import('../src/db/db')
const {
  attachmentUsage,
  deleteAttachmentsFor,
  exportAttachments,
  listAttachments,
  purgeOlderThan,
  purgeOrphans,
} = await import('../src/lib/attachments')
const { buildBackup } = await import('../src/lib/backup')

const DAY = 86_400_000

async function seedTransaction(note: string, amount = 35_000) {
  const id = newId()
  await db.transactions.add(
    stamp({
      id,
      kind: 'expense' as const,
      amount,
      categoryId: 'cat',
      walletId: 'wal',
      date: '2026-09-28',
      note,
      createdAt: Date.now(),
    }),
  )
  return id
}

async function seedPhoto(transactionId: string, body: string, ageDays = 0) {
  const blob = new Blob([body], { type: 'image/webp' })
  const id = newId()
  await db.attachments.add({
    id,
    transactionId,
    blob,
    mime: 'image/webp',
    bytes: blob.size,
    width: 800,
    height: 1000,
    createdAt: Date.now() - ageDays * DAY,
  })
  return id
}

/* ================= lời hứa cốt lõi ================= */

test('bảng ảnh không nằm trong danh sách đồng bộ', () => {
  assert.equal(
    (SYNC_TABLES as readonly string[]).includes('attachments'),
    false,
    'thêm attachments vào SYNC_TABLES là đưa ảnh lên mạng — không được phép',
  )
})

test('bản sao lưu không chứa ảnh dưới bất kỳ dạng nào', async () => {
  const tx = await seedTransaction('cà phê')
  await seedPhoto(tx, 'DỮ-LIỆU-ẢNH-BÍ-MẬT')

  const backup = await buildBackup()
  assert.equal('attachments' in backup.data, false, 'bản sao lưu không được có khoá attachments')

  // Kiểm cả chuỗi JSON: ảnh không được lọt vào qua bất kỳ trường nào khác
  const json = JSON.stringify(backup)
  assert.equal(json.includes('DỮ-LIỆU-ẢNH-BÍ-MẬT'), false)
  assert.equal(json.includes('image/webp'), false)
})

test('kiểu Attachment không có trường đồng bộ nào', async () => {
  const rows = await db.attachments.toArray()
  assert.ok(rows.length > 0)
  for (const a of rows) {
    assert.equal('updatedAt' in a, false, 'có updatedAt thì giao thức hợp nhất sẽ nhận ảnh vào')
    assert.equal('deviceId' in a, false)
    assert.equal('deletedAt' in a, false)
  }
})

/* ================= vòng đời ================= */

test('xoá giao dịch thì xoá luôn ảnh của nó', async () => {
  const keep = await seedTransaction('giữ lại')
  const drop = await seedTransaction('sắp xoá')
  await seedPhoto(keep, 'a')
  await seedPhoto(drop, 'b')
  await seedPhoto(drop, 'c')

  assert.equal((await listAttachments(drop)).length, 2)
  const removed = await deleteAttachmentsFor(drop)
  assert.equal(removed, 2)
  assert.equal((await listAttachments(drop)).length, 0)
  assert.equal((await listAttachments(keep)).length, 1, 'không được đụng tới ảnh của giao dịch khác')
})

test('ảnh mất giao dịch chủ bị dọn đi', async () => {
  const tx = await seedTransaction('rồi sẽ mồ côi')
  await seedPhoto(tx, 'x')
  // Xoá giao dịch mà KHÔNG gọi deleteAttachmentsFor — đúng kiểu lỗi cần lưới đỡ
  await db.transactions.delete(tx)

  assert.equal(await purgeOrphans(), 1)
  assert.equal(await purgeOrphans(), 0, 'chạy lại không được xoá nhầm ảnh còn chủ')
})

test('tự xoá theo hạn giữ chỉ đụng ảnh quá cũ', async () => {
  await db.attachments.clear()
  const tx = await seedTransaction('có ảnh cũ và mới')
  await seedPhoto(tx, 'moi', 10)
  await seedPhoto(tx, 'cu', 400)

  assert.equal(await purgeOlderThan(0), 0, 'giữ mãi thì không được xoá gì')
  assert.equal(await purgeOlderThan(-5), 0)
  assert.equal(await purgeOlderThan(365), 1)

  const left = await listAttachments(tx)
  assert.equal(left.length, 1)
  assert.equal(await left[0].blob.text(), 'moi')
})

test('xoá toàn bộ dữ liệu thì ảnh cũng phải sạch', async () => {
  const tx = await seedTransaction('trước khi xoá sạch')
  await seedPhoto(tx, 'y')
  await wipeAll()
  assert.equal(await db.attachments.count(), 0, 'người dùng bấm xoá hết là muốn máy sạch')
})

/* ================= dung lượng và mang ra ngoài ================= */

test('thống kê dung lượng cộng đúng và biết ảnh cũ nhất', async () => {
  await db.attachments.clear()
  const tx = await seedTransaction('thống kê')
  await seedPhoto(tx, '12345', 30)
  await seedPhoto(tx, '123', 5)

  const usage = await attachmentUsage()
  assert.equal(usage.count, 2)
  assert.equal(usage.bytes, 8)
  assert.equal(usage.oldest, new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10))
})

test('chưa có ảnh thì thống kê rỗng chứ không báo ngày vô nghĩa', async () => {
  await db.attachments.clear()
  const usage = await attachmentUsage()
  assert.deepEqual(usage, { count: 0, bytes: 0, oldest: '' })
})

test('xuất ZIP đặt tên theo ngày và số tiền của giao dịch', async () => {
  await db.attachments.clear()
  const tx = await seedTransaction('ăn trưa', 45_000)
  await seedPhoto(tx, 'anh mot')
  await seedPhoto(tx, 'anh hai')

  const { blob, count } = await exportAttachments()
  assert.equal(count, 2)

  const text = new TextDecoder('utf-8').decode(new Uint8Array(await blob.arrayBuffer()))
  assert.ok(text.includes(`2026-09-28__-45000__${tx.slice(0, 8)}.webp`), 'tên ảnh đầu')
  assert.ok(text.includes(`2026-09-28__-45000__${tx.slice(0, 8)}_2.webp`), 'ảnh thứ hai phải được đánh số, không đè lên')
})

test('ảnh mồ côi vẫn xuất được thay vì làm hỏng cả tệp', async () => {
  await db.attachments.clear()
  await seedPhoto('khong-ton-tai', 'anh mo coi')
  const { count, blob } = await exportAttachments()
  assert.equal(count, 1)
  const text = new TextDecoder('utf-8').decode(new Uint8Array(await blob.arrayBuffer()))
  assert.ok(text.includes('khong-ro'), 'không tra được giao dịch thì đặt tên trung tính')
})
