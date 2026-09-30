/**
 * Đọc HOÁ ĐƠN GIẤY — khác hẳn tin nhắn ngân hàng.
 *
 * Bộ đọc biên lai ban đầu chỉ bắt số tiền có kèm đơn vị: "120,000VND",
 * "-35.000đ". Tin nhắn ngân hàng luôn viết như thế. Nhưng một tờ hoá đơn in thì
 * in số trần trong một cột:
 *
 *     THANH TOAN               187.920
 *
 * Nên chụp một tờ hoá đơn thật ra được chữ nhưng KHÔNG ra số tiền nào — nút
 * "Chụp biên lai" hiện ra ngay trên màn hình đầu tiên mà không dùng được đúng
 * với thứ nó hứa. Đã đo trên máy thật trước khi sửa.
 *
 * Văn bản trong các bài kiểm dưới đây là bản ML Kit thật sự đọc ra, giữ nguyên
 * cả lỗi nhận dạng ("Chi nh anh", "030123 4 567") và dòng thanh trạng thái của
 * điện thoại lọt vào khung ảnh.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { parseReceipt } from '../src/lib/receipt'
import { rebuildLayout } from '../src/lib/receipt-layout'

/** Đúng những gì ML Kit đọc ra từ ảnh chụp trên A50s */
const HOA_DON = [
  '8:26 ae M',
  'HIGHLANDS COFFEE',
  'Chi nh anh Nguyen Hue',
  '45 Nguyen Hue, Q.1, TP.HCM',
  'MST: 030123 4 567',
  'HOA DON BAN HANG',
  'So: HD0092841',
  'Ngay: 30/09/2026   08:15',
  'Phin sua da (L)    x2    90.000',
  'Banh mi que        x1    29.000',
  'Tra sen vang (M)   x1    55.000',
  'Tong cong                174.000',
  'VAT 8%                    13.920',
  'THANH TOAN               187.920',
  'Tien mat                 200.000',
  'Tien thua                 12.080',
  'Cam on quy khach!',
].join('\n')

/**
 * Bài kiểm quan trọng nhất của tệp.
 *
 * Một tờ hoá đơn có bốn con số to, và chỉ MỘT là số tiền giao dịch:
 *
 *   174.000  tổng hàng, chưa thuế
 *   187.920  tổng thanh toán   ← đúng
 *   200.000  tiền khách đưa
 *    12.080  tiền thối lại
 *
 * Lấy nhầm bất cứ con nào trong ba con còn lại thì khoản chi ghi vào sổ sai, mà
 * nhìn qua vẫn hợp lý.
 */
test('lấy đúng dòng tổng thanh toán, không lấy tiền khách đưa', () => {
  const r = parseReceipt(HOA_DON)
  assert.ok(r, 'phải đọc ra được giao dịch')
  assert.equal(r.amount, 187_920)
  assert.equal(r.kind, 'expense', 'hoá đơn bán hàng luôn là khoản chi')
})

test('không có đơn vị tiền tệ thì độ tin cậy phải là thấp', () => {
  // Người dùng còn duyệt lại trước khi lưu; nói dối là chắc chắn mới nguy hiểm
  assert.equal(parseReceipt(HOA_DON)?.confidence, 'low')
})

test('lấy ngày in trên hoá đơn, không lấy ngày hôm nay', () => {
  assert.equal(parseReceipt(HOA_DON)?.date, '2026-09-30')
})

/**
 * Ảnh chụp thường dính cả thanh trạng thái điện thoại, nên dòng đầu có thể là
 * "8:26 ae M". Và dòng địa chỉ chi nhánh thường DÀI HƠN tên cửa hàng — chấm
 * điểm bằng tổng số chữ cái thì nó thắng. Tên cửa hàng gần như luôn in hoa.
 */
test('ghi chú lấy tên cửa hàng, không lấy địa chỉ chi nhánh', () => {
  assert.equal(parseReceipt(HOA_DON)?.note, 'HIGHLANDS COFFEE')
})

test('ưu tiên THANH TOAN hơn TONG CONG', () => {
  const r = parseReceipt(['CUA HANG ABC', 'Tong cong     100.000', 'Thanh toan    108.000'].join('\n'))
  assert.equal(r?.amount, 108_000, 'tổng cộng thường là trước thuế')
})

test('chỉ có TONG CONG thì lấy nó', () => {
  const r = parseReceipt(['SIEU THI XYZ', 'Tong cong     250.000'].join('\n'))
  assert.equal(r?.amount, 250_000)
})

test('bỏ qua dòng tiền mặt và tiền thừa dù số to hơn', () => {
  const r = parseReceipt(['QUAN AN', 'Thanh toan     87.000', 'Tien mat      500.000', 'Tien thua     413.000'].join('\n'))
  assert.equal(r?.amount, 87_000)
})

test('không nhầm số lượng, giờ hay mã số thuế thành tiền', () => {
  const r = parseReceipt(['CUA HANG', 'MST: 0301234567', 'Ngay 30/09/2026 08:15', 'Ca phe  x2   90.000', 'Thanh toan   90.000'].join('\n'))
  assert.equal(r?.amount, 90_000, 'mã số thuế 10 chữ số không được thắng')
})

test('không có dòng tổng nào thì thà không đọc ra còn hơn đoán bừa', () => {
  assert.equal(parseReceipt(['CUA HANG ABC', 'Ca phe   35.000', 'Banh mi  20.000'].join('\n')), null)
})

/* ================= không được làm hỏng đường cũ ================= */

test('tin nhắn ngân hàng vẫn đọc y như trước', () => {
  const r = parseReceipt('TK 9988 -120,000VND 29/09/2026 ND GRAB CHUYEN DI. So du: 1.234.567 VND')
  assert.equal(r?.amount, 120_000)
  assert.equal(r?.kind, 'expense')
  assert.equal(r?.balance, 1_234_567)
  assert.equal(r?.confidence, 'high', 'có đơn vị tiền tệ thì vẫn phải là độ tin cậy cao')
})

test('tin nhắn có tiền vào vẫn ra khoản thu', () => {
  const r = parseReceipt('TK 9988 +15,000,000VND luong thang 9. So du: 20.000.000 VND')
  assert.equal(r?.amount, 15_000_000)
  assert.equal(r?.kind, 'income')
})

/**
 * Đường hoá đơn giấy chỉ được chạy khi đường cũ KHÔNG tìm ra gì. Nếu nó chen
 * vào trước thì một tin nhắn ngân hàng có chữ "thanh toán" sẽ bị đọc sai.
 */
test('có số kèm đơn vị thì không đụng tới đường hoá đơn giấy', () => {
  const r = parseReceipt(['Thanh toan hoa don 250.000', 'TK 9988 -35.000d tai ABC'].join('\n'))
  assert.equal(r?.amount, 35_000, 'số có đơn vị luôn thắng')
  assert.equal(r?.confidence, 'high')
})

/* ================= dựng lại bố cục từ toạ độ ================= */

/**
 * Gốc rễ thật của việc "chụp hoá đơn không ra số tiền".
 *
 * Trên một tờ hoá đơn, nhãn và số nằm hai đầu một dòng, cách nhau một khoảng
 * trống rộng. ML Kit coi hai cột đó là HAI KHỐI khác nhau, nên `getText()` trả
 * về tất cả nhãn trước rồi mới đến tất cả số — không dòng nào còn chứa cả nhãn
 * lẫn số của nó. Đã thấy đúng như vậy trên máy thật:
 *
 *     VAT 8%
 *     Tong cong
 *     THANH TOAN
 *     Tien mat
 *     Tien thua
 *     08:15
 *     x2
 *
 * Chỉ có toạ độ mới ghép lại được.
 */

const dong = (text: string, x: number, y: number) => ({ text, x, y, w: text.length * 14, h: 30 })

test('ghép lại nhãn và số nằm hai đầu cùng một dòng', () => {
  // Cột nhãn ở trái, cột số ở phải — ML Kit trả về rời rạc, thứ tự lộn xộn
  const lines = [
    dong('Tong cong', 40, 500),
    dong('THANH TOAN', 40, 560),
    dong('Tien mat', 40, 620),
    dong('174.000', 700, 502),
    dong('187.920', 700, 562),
    dong('200.000', 700, 622),
  ]
  assert.equal(rebuildLayout(lines), ['Tong cong  174.000', 'THANH TOAN  187.920', 'Tien mat  200.000'].join('\n'))
})

test('bố cục dựng lại xong thì bộ đọc lấy ra đúng số tiền', () => {
  const lines = [
    dong('HIGHLANDS COFFEE', 200, 100),
    dong('Ngay: 30/09/2026', 40, 200),
    dong('Tong cong', 40, 500),
    dong('174.000', 700, 502),
    dong('THANH TOAN', 40, 560),
    dong('187.920', 700, 562),
    dong('Tien mat', 40, 620),
    dong('200.000', 700, 622),
  ]
  const r = parseReceipt(rebuildLayout(lines))
  assert.equal(r?.amount, 187_920)
  assert.equal(r?.note, 'HIGHLANDS COFFEE')
  assert.equal(r?.date, '2026-09-30')
})

test('dòng lệch nhau vài pixel vẫn coi là một hàng', () => {
  // Chữ hoa và chữ số cao thấp khác nhau nên ô bao không bao giờ trùng khít
  const out = rebuildLayout([dong('Thanh toan', 40, 500), dong('99.000', 700, 512)])
  assert.equal(out, 'Thanh toan  99.000')
})

test('hai dòng thật sự khác hàng thì không bị gộp', () => {
  const out = rebuildLayout([dong('Dong tren', 40, 100), dong('Dong duoi', 40, 400)])
  assert.equal(out, 'Dong tren\nDong duoi')
})

test('xếp theo chiều ngang, không theo thứ tự ML Kit trả về', () => {
  const out = rebuildLayout([dong('PHAI', 700, 500), dong('TRAI', 40, 500), dong('GIUA', 350, 500)])
  assert.equal(out, 'TRAI  GIUA  PHAI')
})

test('không có toạ độ thì không vỡ', () => {
  assert.equal(rebuildLayout([]), '')
})
