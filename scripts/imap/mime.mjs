/**
 * Giải mã thư điện tử, đủ dùng để lấy nội dung chữ ra khỏi email ngân hàng.
 *
 * VÌ SAO TỰ VIẾT thay vì dùng thư viện: công cụ này cầm mật khẩu hộp thư của
 * người dùng. Mọi gói phụ thuộc thêm vào đều là một cửa nữa mà mật khẩu đó có
 * thể đi ra, và một chuỗi cập nhật nữa phải theo dõi. Phần MIME cần cho việc
 * này nhỏ hơn nhiều so với cái giá đó.
 *
 * Cố ý KHÔNG làm đầy đủ RFC: không có message/rfc822 lồng nhau, không có
 * tệp đính kèm, không có chữ ký. Email ngân hàng là thư máy sinh, cấu trúc rất
 * đều — text/plain hoặc multipart/alternative với một nhánh HTML.
 */

/**
 * Nối lại các dòng tiêu đề bị gấp.
 *
 * RFC 5322 cho phép ngắt một tiêu đề dài thành nhiều dòng, dòng sau bắt đầu
 * bằng khoảng trắng. Không nối lại thì tiêu đề dài bị cắt cụt giữa chừng.
 */
export function unfold(raw) {
  return raw.replace(/\r?\n[ \t]+/g, ' ')
}

/** Tách phần tiêu đề và phần thân của một thư hoặc một nhánh MIME */
export function splitMessage(raw) {
  const at = raw.search(/\r?\n\r?\n/)
  if (at < 0) return { head: raw, body: '' }
  const gap = raw.slice(at).match(/^\r?\n\r?\n/)[0].length
  return { head: raw.slice(0, at), body: raw.slice(at + gap) }
}

/** Tiêu đề thành Map, khoá viết thường; tiêu đề trùng tên lấy cái đầu tiên */
export function parseHeaders(head) {
  const out = new Map()
  for (const line of unfold(head).split(/\r?\n/)) {
    const at = line.indexOf(':')
    if (at < 0) continue
    const key = line.slice(0, at).trim().toLowerCase()
    if (!out.has(key)) out.set(key, line.slice(at + 1).trim())
  }
  return out
}

function decodeCharset(bytes, charset) {
  const name = (charset || 'utf-8').toLowerCase()
  try {
    return new TextDecoder(name).decode(bytes)
  } catch {
    // Bộ ký tự lạ thì đọc như UTF-8 còn hơn là ném lỗi và mất cả thư
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/** Giải mã quoted-printable; `inHeader` bật thì dấu gạch dưới là khoảng trắng */
export function decodeQuotedPrintable(text, charset, inHeader = false) {
  const src = inHeader ? text.replace(/_/g, ' ') : text.replace(/=\r?\n/g, '')
  const bytes = []
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '=' && /^[0-9a-f]{2}$/i.test(src.slice(i + 1, i + 3))) {
      bytes.push(parseInt(src.slice(i + 1, i + 3), 16))
      i += 2
    } else {
      // Ký tự thường: đẩy từng byte UTF-8 của nó
      for (const b of new TextEncoder().encode(src[i])) bytes.push(b)
    }
  }
  return decodeCharset(new Uint8Array(bytes), charset)
}

/**
 * Giải mã tiêu đề có chứa từ mã hoá RFC 2047: =?UTF-8?B?...?=
 *
 * Hai từ mã hoá đứng liền nhau chỉ cách nhau bằng khoảng trắng thì khoảng trắng
 * đó phải BỎ đi — nó là dấu ngăn của định dạng, không phải khoảng trắng thật.
 * Không bỏ thì tên người gửi tiếng Việt bị chèn thêm dấu cách giữa các cụm.
 */
export function decodeHeader(value) {
  if (!value) return ''
  const pattern = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g

  let out = ''
  let last = 0
  let prevEncodedEnd = -1

  for (const m of value.matchAll(pattern)) {
    const between = value.slice(last, m.index)
    // Chỉ bỏ khoảng trắng nằm GIỮA hai từ mã hoá
    out += prevEncodedEnd === last && between.trim() === '' ? '' : between

    const [, charset, kind, data] = m
    out +=
      kind.toUpperCase() === 'B'
        ? decodeCharset(Uint8Array.from(Buffer.from(data, 'base64')), charset)
        : decodeQuotedPrintable(data, charset, true)

    last = m.index + m[0].length
    prevEncodedEnd = last
  }
  return out + value.slice(last)
}

/** Giá trị chính của một tiêu đề có tham số, ví dụ 'text/plain; charset=utf-8' */
function mainValue(v) {
  return (v ?? '').split(';')[0].trim().toLowerCase()
}

/** Một tham số của tiêu đề, ví dụ charset hoặc boundary */
function param(v, name) {
  const m = (v ?? '').match(new RegExp(`${name}\\s*=\\s*"([^"]*)"|${name}\\s*=\\s*([^;\\s]+)`, 'i'))
  return m ? (m[1] ?? m[2]) : undefined
}

function decodeBody(body, encoding, charset) {
  const enc = (encoding ?? '7bit').trim().toLowerCase()
  if (enc === 'base64') {
    return decodeCharset(Uint8Array.from(Buffer.from(body.replace(/\s+/g, ''), 'base64')), charset)
  }
  if (enc === 'quoted-printable') return decodeQuotedPrintable(body, charset)
  return decodeCharset(new TextEncoder().encode(body), charset)
}

/**
 * Bỏ thẻ HTML, giữ lại chữ đọc được.
 *
 * Bỏ hẳn nội dung của <style> và <script> trước: email ngân hàng thường nhúng
 * cả khối CSS, mà CSS lẫn vào thì bộ đọc biên lai sẽ bắt nhầm các con số trong
 * đó thành số tiền.
 */
export function stripHtml(html) {
  return html
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|td|th|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/[ \t]+/g, ' ')
    // Thẻ mở của khối kế tiếp đã hoá thành khoảng trắng, nằm ngay sau dấu xuống
    // dòng vừa tạo. Không dọn thì mỗi dòng bị thụt vào một ký tự vô cớ.
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Lấy nội dung chữ của một thư.
 *
 * Ưu tiên text/plain; không có thì lấy text/html rồi bỏ thẻ. Với
 * multipart/alternative, hai nhánh là cùng một nội dung ở hai định dạng, nên
 * lấy nhánh nào đọc được là đủ.
 */
export function extractText(raw, depth = 0) {
  if (depth > 4) return ''

  const { head, body } = splitMessage(raw)
  const headers = parseHeaders(head)
  const type = mainValue(headers.get('content-type')) || 'text/plain'
  const charset = param(headers.get('content-type'), 'charset')
  const encoding = headers.get('content-transfer-encoding')

  if (type.startsWith('multipart/')) {
    const boundary = param(headers.get('content-type'), 'boundary')
    if (!boundary) return ''
    const parts = body.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(--)?\\r?\\n?`))

    let html = ''
    for (const part of parts) {
      if (!part || !part.trim()) continue
      const text = extractText(part, depth + 1)
      if (!text) continue
      // Nhánh text/plain thắng ngay; nhánh HTML giữ lại làm phương án dự phòng
      const sub = mainValue(parseHeaders(splitMessage(part).head).get('content-type'))
      if (sub === 'text/plain' || sub === '') return text
      if (!html) html = text
    }
    return html
  }

  const decoded = decodeBody(body, encoding, charset)
  return type === 'text/html' ? stripHtml(decoded) : decoded.trim()
}
