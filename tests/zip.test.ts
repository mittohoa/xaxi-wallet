/**
 * Kiểm thử bộ đóng gói ZIP tự viết.
 *
 * Tệp ZIP hỏng thì người dùng chỉ biết khi đã đổi máy và cần tới ảnh — lúc đó
 * quá muộn. Nên ở đây phải đọc ngược lại từng trường của định dạng thay vì chỉ
 * kiểm tra "có sinh ra byte nào không".
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { crc32, zipStore } from '../src/lib/zip'

const enc = new TextEncoder()

/** Bộ đọc ZIP tối giản, chỉ dùng trong kiểm thử — cố tình không dùng chung mã với bộ ghi */
function readZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (at: number) => view.getUint16(at, true)
  const u32 = (at: number) => view.getUint32(at, true)

  // Phần đuôi nằm ở 22 byte cuối khi không có chú thích
  const eocd = bytes.length - 22
  assert.equal(u32(eocd), 0x06054b50, 'thiếu chữ ký phần đuôi')
  const count = u16(eocd + 10)
  const centralSize = u32(eocd + 12)
  const centralStart = u32(eocd + 16)
  assert.equal(centralStart + centralSize, eocd, 'thư mục trung tâm không khớp với phần đuôi')

  const files: { name: string; bytes: Uint8Array; crcOk: boolean }[] = []
  let at = centralStart
  for (let i = 0; i < count; i++) {
    assert.equal(u32(at), 0x02014b50, 'thiếu chữ ký mục thư mục')
    const crc = u32(at + 16)
    const size = u32(at + 24)
    const nameLen = u16(at + 28)
    const localAt = u32(at + 42)
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen))

    assert.equal(u32(localAt), 0x04034b50, 'thiếu chữ ký phần đầu cục bộ')
    const localNameLen = u16(localAt + 26)
    const localExtraLen = u16(localAt + 28)
    const dataAt = localAt + 30 + localNameLen + localExtraLen
    const data = bytes.subarray(dataAt, dataAt + size)

    files.push({ name, bytes: data, crcOk: crc32(data) === crc })
    at += 46 + nameLen
  }
  return files
}

test('CRC-32 khớp giá trị chuẩn của thuật toán', () => {
  // Vector kiểm chuẩn: "123456789" luôn ra 0xCBF43926
  assert.equal(crc32(enc.encode('123456789')), 0xcbf43926)
  assert.equal(crc32(new Uint8Array(0)), 0)
})

test('tệp nén đọc ngược lại được đúng nội dung', async () => {
  const blob = zipStore([
    { name: '2026-09-28__-35000__ab12cd34.webp', bytes: enc.encode('anh mot') },
    { name: '2026-09-29__+18000000__ff00aa99.jpg', bytes: enc.encode('anh hai, dai hon mot chut') },
  ])
  const files = readZip(new Uint8Array(await blob.arrayBuffer()))

  assert.equal(files.length, 2)
  assert.equal(files[0].name, '2026-09-28__-35000__ab12cd34.webp')
  assert.equal(new TextDecoder().decode(files[0].bytes), 'anh mot')
  assert.equal(new TextDecoder().decode(files[1].bytes), 'anh hai, dai hon mot chut')
  assert.ok(
    files.every((f) => f.crcOk),
    'CRC ghi trong thư mục trung tâm phải khớp dữ liệu thật',
  )
})

test('tên tệp tiếng Việt giữ nguyên dấu', async () => {
  const blob = zipStore([{ name: 'hoá-đơn-ăn-trưa.webp', bytes: enc.encode('x') }])
  const files = readZip(new Uint8Array(await blob.arrayBuffer()))
  assert.equal(files[0].name, 'hoá-đơn-ăn-trưa.webp')
})

test('tệp nén rỗng vẫn là tệp ZIP hợp lệ', async () => {
  const blob = zipStore([])
  const bytes = new Uint8Array(await blob.arrayBuffer())
  assert.equal(bytes.length, 22, 'chỉ còn phần đuôi')
  assert.equal(readZip(bytes).length, 0)
})

test('dữ liệu nhị phân đi qua nguyên vẹn', async () => {
  const raw = new Uint8Array(512)
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 37) % 256
  const blob = zipStore([{ name: 'a.bin', bytes: raw }])
  const files = readZip(new Uint8Array(await blob.arrayBuffer()))
  assert.deepEqual([...files[0].bytes], [...raw])
})
