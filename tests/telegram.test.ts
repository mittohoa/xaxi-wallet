/**
 * Kiểm phần logic của bot Telegram — không chạm tới mạng, không cần token.
 *
 * Ba chỗ đáng canh nhất, theo thứ tự hậu quả nếu sai:
 *
 *   1. chốt cuộc trò chuyện — sai thì người lạ chèn được giao dịch vào sổ của bạn
 *   2. che token — lọt ra thì ai đọc được cũng giả danh được bot
 *   3. dựng multipart — sai một dấu xuống dòng là tệp gửi lên hỏng, mà lỗi trả
 *      về chẳng nói gì về nguyên nhân
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { buildMultipart, redact } from '../scripts/telegram/api.mjs'
import { Session, isAllowed, parseCommand } from '../scripts/telegram/session.mjs'
import { toCSV } from '../scripts/csv.mjs'

/* ================= chốt cuộc trò chuyện ================= */

/**
 * Bot Telegram là công khai: ai biết tên nó đều nhắn được. Không chốt theo chat
 * id thì bất cứ ai cũng ghi được khoản chi vào sổ của người khác.
 */
test('chỉ nhận tin từ đúng cuộc trò chuyện đã ghi trong cấu hình', () => {
  assert.equal(isAllowed({ chat: { id: 12345 } }, 12345), true)
  assert.equal(isAllowed({ chat: { id: 999 } }, 12345), false)
})

test('chat id so khớp bất kể là số hay chuỗi', () => {
  // Telegram trả về số, còn tệp cấu hình do người dùng gõ tay — rất dễ thành chuỗi
  assert.equal(isAllowed({ chat: { id: 12345 } }, '12345'), true)
  assert.equal(isAllowed({ chat: { id: -100987 } }, -100987), true)
})

test('tin không có chat thì không bao giờ được nhận', () => {
  assert.equal(isAllowed({}, 12345), false)
  assert.equal(isAllowed(null, 12345), false)
  assert.equal(isAllowed({ chat: {} }, 12345), false)
})

/* ================= che token ================= */

test('token không lọt vào chuỗi nào sắp in ra', () => {
  const token = '123456789:AAsieu-bi-mat'
  const loi = `getMe failed for https://api.telegram.org/bot${token}/getMe`
  const sach = redact(loi, token)
  assert.equal(sach.includes(token), false, 'token phải bị che')
  assert.ok(sach.includes('<token>'))
})

/* ================= tách lệnh ================= */

test('tách được lệnh, kể cả khi Telegram gắn thêm tên bot', () => {
  assert.deepEqual(parseCommand('/xuat'), { cmd: 'xuat', rest: '' })
  // Trong nhóm, Telegram viết /xuat@ten_bot — không cắt phần đuôi thì mọi lệnh đều trượt
  assert.deepEqual(parseCommand('/xuat@xaxi_bot'), { cmd: 'xuat', rest: '' })
  assert.deepEqual(parseCommand('/bo  2'), { cmd: 'bo', rest: '2' })
  assert.equal(parseCommand('cà phê 35k'), null)
  assert.equal(parseCommand(''), null)
})

/* ================= danh sách chờ ================= */

/** Bộ đọc giả, đủ hình dạng của QuickParse */
const docGia = (text: string) => {
  const m = text.match(/(\d+)k/)
  if (!m) return null
  return {
    kind: 'expense' as const,
    amount: Number(m[1]) * 1000,
    date: '2026-09-30',
    note: text.replace(/\s*\d+k\s*/, '').trim(),
    categoryId: null,
    reason: 'none' as const,
  }
}

test('ghi nhận khoản chi và giữ trong danh sách chờ', () => {
  const s = new Session(docGia)
  const r = s.handle('cà phê 35k')
  assert.ok(r.reply.includes('35.000'))
  assert.ok(r.reply.includes('cà phê'))
  assert.equal(s.pending.length, 1)
  assert.deepEqual(s.pending[0], { date: '2026-09-30', note: 'cà phê', amount: 35000, kind: 'expense' })
})

test('câu không có số tiền thì nói rõ, không ghi bừa', () => {
  const s = new Session(docGia)
  const r = s.handle('chào bot')
  assert.ok(r.reply.includes('Chưa nhận ra số tiền'))
  assert.equal(s.pending.length, 0, 'không được ghi gì vào danh sách chờ')
})

test('/bo gỡ đúng khoản vừa ghi', () => {
  const s = new Session(docGia)
  s.handle('cà phê 35k')
  s.handle('xăng 100k')
  assert.equal(s.pending.length, 2)

  const r = s.command({ cmd: 'bo', rest: '' })
  assert.ok(r.reply.includes('xăng'))
  assert.equal(s.pending.length, 1)
  assert.equal(s.pending[0].note, 'cà phê')
})

test('/bo lúc trống thì không vỡ', () => {
  const s = new Session(docGia)
  assert.ok(s.command({ cmd: 'bo', rest: '' }).reply.includes('Không có gì'))
})

test('/xuat trả về dữ liệu, và dọn danh sách để không xuất trùng', () => {
  const s = new Session(docGia)
  s.handle('cà phê 35k')
  s.handle('xăng 100k')

  const r = s.handle('/xuat')
  assert.equal(r.file?.rows.length, 2)

  // Bản sao, không phải chính mảng trong phiên — dọn xong vẫn phải dùng được
  assert.equal(s.clear(), 2)
  assert.equal(s.pending.length, 0)
  assert.equal(r.file?.rows.length, 2, 'dữ liệu đã trả ra không được rỗng đi theo')
})

test('/xuat lúc trống thì không sinh tệp', () => {
  const s = new Session(docGia)
  const r = s.handle('/xuat')
  assert.equal(r.file, undefined)
  assert.ok(r.reply.includes('Chưa có khoản nào'))
})

test('lệnh lạ thì chỉ dẫn, không im lặng', () => {
  const s = new Session(docGia)
  assert.ok(s.handle('/khongtontai').reply.includes('/giup'))
})

/* ================= CSV ================= */

test('CSV đúng định dạng mà app đọc được', () => {
  const csv = toCSV([
    { date: '2026-09-30', note: 'cà phê', amount: 35000, kind: 'expense' },
    { date: '2026-09-30', note: 'lương', amount: 15000000, kind: 'income' },
  ])

  const dong = csv.split('\r\n')
  assert.equal(dong[0], '﻿Ngày,Nội dung,Số tiền', 'có BOM để Excel đọc đúng tiếng Việt')
  assert.equal(dong[1], '2026-09-30,cà phê,-35000', 'khoản chi phải mang dấu âm')
  assert.equal(dong[2], '2026-09-30,lương,15000000')
})

test('nội dung có dấu phẩy hoặc nháy được bọc đúng', () => {
  const csv = toCSV([{ date: '2026-09-30', note: 'ăn, uống "ngon"', amount: 1000, kind: 'expense' }])
  assert.ok(csv.includes('"ăn, uống ""ngon"""'))
})

/* ================= multipart ================= */

test('thân multipart đúng cấu trúc', () => {
  const body = buildMultipart({ chat_id: '42' }, { field: 'document', name: 'a.csv', data: 'x,y', type: 'text/csv' }, 'BND')
  const text = body.toString('utf8')

  assert.ok(text.startsWith('--BND\r\n'))
  assert.ok(text.includes('Content-Disposition: form-data; name="chat_id"\r\n\r\n42\r\n'))
  assert.ok(text.includes('name="document"; filename="a.csv"'))
  assert.ok(text.includes('Content-Type: text/csv\r\n\r\nx,y\r\n'))
  assert.ok(text.endsWith('--BND--\r\n'), 'phải kết thúc bằng ranh giới đóng')
})

test('dữ liệu nhị phân đi qua nguyên vẹn', () => {
  // Nối bằng chuỗi thay vì Buffer sẽ làm hỏng byte ở đây
  const data = Buffer.from([0xff, 0x00, 0xfe, 0x41])
  const body = buildMultipart({}, { field: 'document', name: 'b.bin', data, type: 'application/octet-stream' }, 'B')
  const at = body.indexOf(data)
  assert.ok(at > 0, 'byte gốc phải còn nguyên trong thân')
  assert.deepEqual(body.subarray(at, at + 4), data)
})

test('không có tệp thì chỉ có các trường', () => {
  const body = buildMultipart({ a: '1' }, null, 'B').toString('utf8')
  assert.equal(body.includes('filename='), false)
  assert.ok(body.endsWith('--B--\r\n'))
})
