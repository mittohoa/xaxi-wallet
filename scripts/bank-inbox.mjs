/**
 * Đọc email biến động số dư từ hộp thư CỦA CHÍNH NGƯỜI DÙNG, xuất ra CSV để
 * nhập vào app.
 *
 *   npm run bank:inbox            # xem thử, không ghi tệp
 *   npm run bank:inbox -- --write # ghi ra CSV
 *
 * ĐÂY LÀ CÔNG CỤ CHẠY TẠI MÁY, KHÔNG PHẢI MỘT PHẦN CỦA APP.
 *
 * App không bao giờ hỏi thông tin đăng nhập nào, và nguyên tắc đó không đổi.
 * Công cụ này chạy trên máy tính của người dùng, nối thẳng tới máy chủ thư của
 * họ, và ghi kết quả ra một tệp CSV nằm trên đĩa của họ. Không có máy chủ trung
 * gian, không có tài khoản, không một byte nào đi tới đâu khác.
 *
 * Bốn điều được ép ở tầng thấp hơn, không phải chỉ hứa trong tài liệu:
 *
 *   · luôn đi qua TLS, và các cổng chưa mã hoá bị từ chối thẳng
 *   · mở hộp thư bằng EXAMINE, tức CHỈ ĐỌC — không thể đánh dấu đã đọc hay xoá
 *   · không phụ thuộc thư viện ngoài nào — xem chú thích đầu imap/client.mjs
 *   · mật khẩu không bao giờ được in ra, kể cả trong thông báo lỗi
 *
 * Với Gmail và phần lớn nhà cung cấp, phải dùng MẬT KHẨU ỨNG DỤNG riêng chứ
 * không phải mật khẩu chính. Mật khẩu ứng dụng thu hồi được bất cứ lúc nào mà
 * không ảnh hưởng tài khoản.
 */
import { build } from 'esbuild'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, imapDate } from './imap/client.mjs'
import { decodeHeader, extractText, parseHeaders, splitMessage } from './imap/mime.mjs'

const CONFIG = 'xaxi-imap.json'

const MAU = {
  host: 'imap.gmail.com',
  user: 'ban@gmail.com',
  pass: 'mat khau ung dung 16 ky tu',
  mailbox: 'INBOX',
  since: '2026-09-01',
  from: ['bidv.com.vn', 'vietcombank.com.vn', 'techcombank.com.vn'],
}

function doiCauHinh() {
  if (!existsSync(CONFIG)) {
    console.error(`Chưa có ${CONFIG}. Tạo tệp đó với nội dung như sau:\n`)
    console.error(JSON.stringify(MAU, null, 2))
    console.error(`\n${CONFIG} đã nằm trong .gitignore — nó chứa mật khẩu, không được commit.`)
    console.error('Với Gmail hãy dùng mật khẩu ứng dụng, không dùng mật khẩu chính.')
    process.exit(1)
  }
  const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'))
  for (const key of ['host', 'user', 'pass']) {
    if (!cfg[key]) {
      console.error(`${CONFIG} thiếu trường "${key}".`)
      process.exit(1)
    }
  }
  return { mailbox: 'INBOX', from: [], ...cfg }
}

/**
 * Nạp đúng bộ đọc biên lai mà app đang dùng.
 *
 * Viết lại một bộ đọc riêng ở đây là có hai bộ luật phải giữ khớp bằng tay, và
 * người dùng sẽ gặp trường hợp công cụ đọc ra một số còn app dán tay ra số
 * khác. Biên dịch thẳng từ nguồn thì hai bên luôn là một.
 */
async function napBoDoc() {
  const dir = mkdtempSync(join(tmpdir(), 'xaxi-imap-'))
  const out = join(dir, 'receipt.mjs')
  await build({
    entryPoints: ['src/lib/receipt.ts'],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'error',
  })
  return import(`file://${out.replace(/\\/g, '/')}`)
}

function csvCell(v) {
  const s = String(v ?? '')
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCSV(rows) {
  const head = ['Ngày', 'Nội dung', 'Số tiền']
  const body = rows.map((r) => [r.date, r.note, r.kind === 'expense' ? -r.amount : r.amount].map(csvCell).join(','))
  // BOM để Excel đọc đúng tiếng Việt
  return '﻿' + [head.join(','), ...body].join('\r\n')
}

/* ============================================================ */

const viet = process.argv.includes('--write')
const cfg = doiCauHinh()
const { parseReceipt } = await napBoDoc()

console.log(`Nối tới ${cfg.host} với tài khoản ${cfg.user}…`)
const box = await connect({ host: cfg.host, port: cfg.port ?? 993, user: cfg.user, pass: cfg.pass })

let rows = []
let doc = 0
let boQua = 0

try {
  await box.examine(cfg.mailbox)
  console.log(`Đã mở ${cfg.mailbox} ở chế độ chỉ đọc.`)

  // Lọc ngay ở máy chủ: tải ít thư hơn, và thư không liên quan không bao giờ
  // rời khỏi hộp thư
  const dieuKien = [cfg.since ? `SINCE ${imapDate(cfg.since)}` : 'ALL']
  const nguon = cfg.from.length ? cfg.from : [null]

  const seen = new Set()
  for (const f of nguon) {
    const q = f ? `${dieuKien.join(' ')} FROM "${f}"` : dieuKien.join(' ')
    for (const n of await box.search(q)) seen.add(n)
  }

  const ids = [...seen].sort((a, b) => a - b)
  console.log(`Tìm thấy ${ids.length} thư khớp điều kiện.`)

  for (const id of ids) {
    const raw = await box.fetchRaw(id)
    if (!raw) continue
    doc++

    const headers = parseHeaders(splitMessage(raw).head)
    const subject = decodeHeader(headers.get('subject'))
    const from = decodeHeader(headers.get('from'))
    const text = extractText(raw)

    // Tiêu đề thường mang chính số tiền, nên ghép vào trước phần thân
    const parsed = parseReceipt(`${subject}\n${text}`)
    if (!parsed) {
      boQua++
      continue
    }
    rows.push({ ...parsed, from, subject })
  }
} finally {
  await box.close()
}

rows.sort((a, b) => a.date.localeCompare(b.date))

console.log('')
for (const r of rows.slice(0, 20)) {
  const dau = r.kind === 'expense' ? '−' : '+'
  console.log(`  ${r.date}  ${dau}${String(r.amount).padStart(12)}  ${(r.note || r.issuer || '').slice(0, 44)}`)
}
if (rows.length > 20) console.log(`  … và ${rows.length - 20} dòng nữa`)

console.log('')
console.log(`Đọc ${doc} thư · nhận ra ${rows.length} giao dịch · bỏ qua ${boQua} thư không có số tiền.`)

if (!viet) {
  console.log('\nĐây là lần xem thử. Thêm --write để ghi ra CSV.')
  process.exit(0)
}

if (rows.length === 0) {
  console.log('Không có gì để ghi.')
  process.exit(0)
}

const ten = `xaxi-sao-ke-${new Date().toISOString().slice(0, 10)}.csv`
writeFileSync(ten, toCSV(rows), 'utf8')
console.log(`\nĐã ghi ${ten}`)
console.log('Mở app → gõ "sao kê" → chọn tệp này. App sẽ tự loại những dòng trùng với giao dịch đã có.')
