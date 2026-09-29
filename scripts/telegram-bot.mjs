/**
 * Ghi chi bằng cách nhắn cho một con bot Telegram — bot chạy TRÊN MÁY BẠN.
 *
 *   npm run telegram:bot
 *
 * ĐÂY LÀ CÔNG CỤ CHẠY TẠI MÁY, KHÔNG PHẢI MỘT PHẦN CỦA APP.
 *
 * Vì sao làm theo cách này: cái hay của Telegram là bắt được khoản chi ngay lúc
 * vừa tiêu, khi mở app ra là phiền. Cái dở của một con bot thông thường là nó
 * chạy trên máy chủ của ai đó và giữ một bản sao toàn bộ chi tiêu của bạn ở
 * ngoài kia.
 *
 * Bot này không có cơ sở dữ liệu. Nó chạy trên máy bạn, danh sách chờ nằm trong
 * bộ nhớ tiến trình, đóng chương trình là hết. Không tồn tại kho chi tiêu nào
 * ngoài máy bạn — đó là toàn bộ điểm khác biệt, xem §3.3 docs/dinh-huong.md.
 *
 * Bốn điều được ép ở tầng thấp hơn, không phải chỉ hứa trong tài liệu:
 *
 *   · chỉ nhận tin từ ĐÚNG MỘT cuộc trò chuyện đã ghi trong cấu hình; tin của
 *     người lạ bị bỏ qua im lặng, không trả lời — trả lời là xác nhận bot có thật
 *   · không phụ thuộc gói ngoài nào — xem chú thích đầu telegram/api.mjs
 *   · token không bao giờ được in ra, kể cả trong thông báo lỗi
 *   · bot KHÔNG đoán danh mục: nó chỉ tách số tiền, ngày và nội dung, còn phân
 *     loại để app làm — chỉ app mới có lịch sử và mô hình đã học của bạn
 *
 * ĐIỀU BOT NÀY KHÔNG LÀM: không nhận tin nhắn thoại. Phần nhận diện giọng nói
 * của Telegram gửi âm thanh lên dịch vụ bên ngoài, trong khi XAXI đã có giọng
 * nói chạy thẳng trên máy — đổi sang cách kia là đi lùi về quyền riêng tư.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { toCSV, csvName } from './csv.mjs'
import { loadFromSource } from './compile-src.mjs'
import { TelegramError, callApi, getUpdates, redact, sendDocument, sendMessage } from './telegram/api.mjs'
import { Session, isAllowed } from './telegram/session.mjs'

const CONFIG = 'xaxi-telegram.json'

const MAU = {
  token: '123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  chatId: 0,
  guiTep: true,
}

function huongDan() {
  console.error(`Chưa có ${CONFIG}. Các bước:\n`)
  console.error('  1. Mở Telegram, nhắn cho @BotFather, gõ /newbot rồi đặt tên.')
  console.error('  2. BotFather trả về một token. Tạo tệp dưới đây với token đó:\n')
  console.error(JSON.stringify(MAU, null, 2))
  console.error(`\n  3. Để chatId là 0 rồi chạy lại — công cụ sẽ nói cho bạn số cần điền.`)
  console.error(`\n${CONFIG} đã nằm trong .gitignore — nó chứa token, không được commit.`)
  console.error('\nguiTep: sau /xuat thì gửi luôn tệp CSV vào cuộc trò chuyện, để lấy được')
  console.error('trên điện thoại. Tệp đó không thêm thông tin gì mới cho Telegram — mọi dòng')
  console.error('trong nó đều từ tin nhắn chính bạn đã gõ ở đấy. Đặt false nếu vẫn muốn tắt.')
  process.exit(1)
}

function doiCauHinh() {
  if (!existsSync(CONFIG)) huongDan()
  const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'))
  if (!cfg.token) {
    console.error(`${CONFIG} thiếu trường "token".`)
    process.exit(1)
  }
  return { guiTep: true, ...cfg }
}

/* ============================================================ */

const cfg = doiCauHinh()
const { parseQuickEntry } = await loadFromSource('src/lib/quickadd.ts')

/**
 * Danh mục và lịch sử truyền vào rỗng — CÓ CHỦ Ý.
 *
 * Chúng nằm trong IndexedDB trên máy chạy app, không phải ở đây. Bot đoán danh
 * mục bằng một bộ dữ liệu rỗng thì đoán sai, mà đoán sai lại còn ghi vào sổ thì
 * tệ hơn là không đoán. Để trống thì khi nhập vào, app xếp chúng vào "chờ phân
 * loại" và tự đoán bằng chính mô hình đã học của bạn.
 */
const doc = (text) => parseQuickEntry(text, [], [])

let me
try {
  me = await callApi(cfg.token, 'getMe')
} catch (e) {
  console.error(redact(e.message, cfg.token))
  if (e instanceof TelegramError) console.error('\nToken có đúng không? Lấy lại bằng /mybots trong @BotFather.')
  process.exit(1)
}
console.log(`Bot @${me.username} sẵn sàng.`)

let offset = 0

/* ---------------- ghép đôi lần đầu ---------------- */

if (!cfg.chatId) {
  console.log('\nChưa có chatId. Hãy mở Telegram và nhắn một câu bất kỳ cho bot…')
  for (;;) {
    const updates = await getUpdates(cfg.token, offset)
    for (const u of updates) {
      offset = u.update_id + 1
      const chat = u.message?.chat
      if (!chat) continue
      console.log(`\nThấy tin từ: ${chat.first_name ?? chat.title ?? '(không tên)'}`)
      console.log(`Điền số này vào ${CONFIG} rồi chạy lại:\n`)
      console.log(`  "chatId": ${chat.id}`)
      process.exit(0)
    }
  }
}

/* ---------------- vòng chính ---------------- */

const phien = new Session(doc)

function ghiTep(rows) {
  const ten = csvName('xaxi-telegram', new Date().toISOString().slice(0, 10))
  writeFileSync(ten, toCSV(rows), 'utf8')
  return ten
}

async function xuat(rows) {
  const ten = ghiTep(rows)
  console.log(`Đã ghi ${ten} (${rows.length} khoản)`)

  const loi = [
    `<b>${rows.length} khoản</b> · đã ghi ra <code>${ten}</code> trên máy.`,
    '',
    'Mở app → gõ "sao kê" → chọn tệp này. App sẽ tự đoán danh mục và loại những dòng trùng.',
  ].join('\n')

  if (!cfg.guiTep) return loi

  try {
    await sendDocument(cfg.token, cfg.chatId, {
      name: ten,
      data: toCSV(rows),
      caption: 'Tải về rồi mở bằng "Nhập sao kê CSV" trong XAXI.',
    })
    return loi
  } catch (e) {
    console.error(redact(e.message, cfg.token))
    return `${loi}\n\n<i>Không gửi được tệp qua Telegram, nhưng nó đã nằm trên máy rồi.</i>`
  }
}

/** Ctrl+C mà còn khoản đang chờ thì ghi ra đĩa — chúng chỉ nằm trong bộ nhớ */
function thoat() {
  if (phien.pending.length > 0) {
    const ten = ghiTep(phien.pending)
    console.log(`\nCòn ${phien.pending.length} khoản chưa xuất — đã ghi vào ${ten}`)
  } else {
    console.log('\nKhông còn khoản nào đang chờ.')
  }
  process.exit(0)
}
process.on('SIGINT', thoat)

console.log('Đang nghe. Ctrl+C để dừng (khoản đang chờ sẽ được ghi ra tệp).\n')

for (;;) {
  let updates
  try {
    updates = await getUpdates(cfg.token, offset)
  } catch (e) {
    // Mạng chập chờn là chuyện thường của một tiến trình chạy dài; chờ rồi thử lại
    console.error(redact(e.message, cfg.token))
    await new Promise((r) => setTimeout(r, 5000))
    continue
  }

  for (const u of updates) {
    offset = u.update_id + 1
    const msg = u.message
    if (!msg) continue

    // Im lặng với người lạ: trả lời là xác nhận cho họ biết bot đang chạy
    if (!isAllowed(msg, cfg.chatId)) {
      console.log(`Bỏ qua tin từ cuộc trò chuyện ${msg.chat?.id}`)
      continue
    }

    if (!msg.text) {
      await sendMessage(cfg.token, cfg.chatId, 'Chỉ nhận chữ. Tin nhắn thoại thì hãy dùng nút micro trong app — nó chạy ngay trên máy.')
      continue
    }

    const { reply, file } = phien.handle(msg.text)
    const text = file ? await xuat(file.rows) : reply
    if (file) phien.clear()

    console.log(`< ${msg.text}`)
    try {
      await sendMessage(cfg.token, cfg.chatId, text)
    } catch (e) {
      console.error(redact(e.message, cfg.token))
    }
  }
}
