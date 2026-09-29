/**
 * Kiểm thử bộ giải mã thư, dùng cho công cụ đọc email ngân hàng tại máy.
 *
 * Email ngân hàng là thư máy sinh nên cấu trúc rất đều, nhưng ba chỗ hay làm
 * hỏng: tiêu đề tiếng Việt mã hoá RFC 2047, thân thư quoted-printable với dòng
 * bị ngắt giữa chừng, và khối CSS nhúng trong HTML — nếu để CSS lẫn vào thì bộ
 * đọc biên lai sẽ bắt nhầm các con số trong đó thành số tiền.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  decodeHeader,
  decodeQuotedPrintable,
  extractText,
  parseHeaders,
  stripHtml,
  unfold,
} from '../scripts/imap/mime.mjs'

/* ================= tiêu đề ================= */

test('nối lại tiêu đề bị gấp nhiều dòng', () => {
  assert.equal(unfold('Subject: Thong bao\r\n bien dong so du'), 'Subject: Thong bao bien dong so du')
})

test('tiêu đề trùng tên lấy cái đầu tiên', () => {
  const h = parseHeaders('From: a@x.vn\r\nFrom: b@y.vn\r\nSubject: Hai')
  assert.equal(h.get('from'), 'a@x.vn')
  assert.equal(h.get('subject'), 'Hai')
})

test('giải mã tiêu đề tiếng Việt kiểu base64', () => {
  const goc = 'Thông báo biến động số dư'
  const b64 = Buffer.from(goc, 'utf8').toString('base64')
  assert.equal(decodeHeader(`=?UTF-8?B?${b64}?=`), goc)
})

test('giải mã tiêu đề kiểu quoted-printable, gạch dưới là khoảng trắng', () => {
  assert.equal(decodeHeader('=?UTF-8?Q?Bien_dong_so_du?='), 'Bien dong so du')
})

/**
 * Khoảng trắng GIỮA hai từ mã hoá là dấu ngăn của định dạng, không phải khoảng
 * trắng thật. Không bỏ thì tên tiếng Việt bị chèn thêm dấu cách giữa các cụm.
 */
test('bỏ khoảng trắng ngăn giữa hai từ mã hoá', () => {
  const a = Buffer.from('Ngân hàng ', 'utf8').toString('base64')
  const b = Buffer.from('BIDV', 'utf8').toString('base64')
  assert.equal(decodeHeader(`=?UTF-8?B?${a}?= =?UTF-8?B?${b}?=`), 'Ngân hàng BIDV')
})

test('giữ nguyên chữ thường nằm ngoài từ mã hoá', () => {
  const b64 = Buffer.from('Biến động', 'utf8').toString('base64')
  assert.equal(decodeHeader(`[BIDV] =?UTF-8?B?${b64}?= - TK 9988`), '[BIDV] Biến động - TK 9988')
})

test('tiêu đề rỗng không làm vỡ gì', () => {
  assert.equal(decodeHeader(''), '')
  assert.equal(decodeHeader(undefined as unknown as string), '')
})

/* ================= thân thư ================= */

test('quoted-printable nối lại dòng bị ngắt giữa chừng', () => {
  // Dấu = ở cuối dòng nghĩa là dòng bị ngắt, không phải ký tự thật
  assert.equal(decodeQuotedPrintable('So du: 1,234=\r\n,567VND', 'utf-8'), 'So du: 1,234,567VND')
})

test('quoted-printable giải đúng chữ tiếng Việt', () => {
  assert.equal(decodeQuotedPrintable('S=E1=BB=91 d=C6=B0', 'utf-8'), 'Số dư')
})

test('bộ ký tự lạ thì đọc như UTF-8 thay vì ném lỗi', () => {
  assert.equal(decodeQuotedPrintable('abc', 'x-khong-ton-tai'), 'abc')
})

/* ================= HTML ================= */

/**
 * Đây là bài kiểm quan trọng nhất của tệp.
 *
 * Email ngân hàng thường nhúng cả khối CSS. Để nó lẫn vào thì bộ đọc biên lai
 * gặp "font-size: 14px" và "padding: 12px" trước cả số tiền thật.
 */
test('bỏ hẳn nội dung khối style và script', () => {
  const html = `
    <style>.x { font-size: 14000px; padding: 12000px }</style>
    <script>var a = 99000;</script>
    <p>TK 9988 -120,000VND</p>`
  const text = stripHtml(html)
  assert.equal(text.includes('14000'), false, 'số trong CSS phải biến mất')
  assert.equal(text.includes('99000'), false, 'số trong script phải biến mất')
  assert.ok(text.includes('-120,000VND'))
})

test('thẻ xuống dòng và thẻ khối thành dấu xuống dòng thật', () => {
  assert.equal(stripHtml('<p>Một</p><p>Hai</p>'), 'Một\nHai')
  assert.equal(stripHtml('Một<br>Hai'), 'Một\nHai')
})

test('giải mã thực thể HTML, kể cả dạng số', () => {
  assert.equal(stripHtml('a&nbsp;b &amp; c &#273; &#x111;'), 'a b & c đ đ')
})

/* ================= thư hoàn chỉnh ================= */

function thu(headers: string, body: string) {
  return `${headers}\r\n\r\n${body}`
}

test('thư chữ thuần đọc ra nguyên nội dung', () => {
  const raw = thu(
    'From: no-reply@bidv.com.vn\r\nSubject: Bien dong\r\nContent-Type: text/plain; charset=utf-8',
    'TK 9988 -120,000VND 29/09/2026 ND GRAB CHUYEN DI',
  )
  assert.equal(extractText(raw), 'TK 9988 -120,000VND 29/09/2026 ND GRAB CHUYEN DI')
})

test('thư base64 giải đúng tiếng Việt', () => {
  const noiDung = 'Số dư: 1.234.567 VND'
  const raw = thu(
    'Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64',
    Buffer.from(noiDung, 'utf8').toString('base64'),
  )
  assert.equal(extractText(raw), noiDung)
})

test('thư nhiều nhánh ưu tiên nhánh chữ thuần', () => {
  const raw = [
    'Content-Type: multipart/alternative; boundary="X1"',
    '',
    '--X1',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p>bản HTML</p>',
    '--X1',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'bản chữ thuần',
    '--X1--',
  ].join('\r\n')
  assert.equal(extractText(raw), 'bản chữ thuần')
})

test('chỉ có nhánh HTML thì lấy nhánh đó và bỏ thẻ', () => {
  const raw = [
    'Content-Type: multipart/alternative; boundary="X1"',
    '',
    '--X1',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<style>.a{color:red}</style><p>TK 9988 -120,000VND</p>',
    '--X1--',
  ].join('\r\n')
  assert.equal(extractText(raw), 'TK 9988 -120,000VND')
})

test('thư lồng nhau quá sâu thì dừng chứ không chạy mãi', () => {
  // Nhánh tự trỏ vào chính ranh giới của nó — thư hỏng, nhưng không được treo
  const raw = 'Content-Type: multipart/mixed; boundary="X"\r\n\r\n--X\r\nContent-Type: multipart/mixed; boundary="X"\r\n\r\n--X\r\n'
  assert.equal(typeof extractText(raw), 'string')
})
