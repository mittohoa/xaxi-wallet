/**
 * Bộ khách Telegram Bot API tối giản, chạy trên node:https, không phụ thuộc gói nào.
 *
 * VÌ SAO TỰ VIẾT: công cụ này cầm token của bot. Ai có token thì đọc được mọi
 * tin nhắn gửi tới bot đó và giả danh nó. Mỗi gói phụ thuộc thêm vào là một cửa
 * nữa mà token có thể đi ra, và một chuỗi cập nhật nữa phải theo dõi. Phần API
 * cần dùng ở đây có bốn phương thức.
 *
 * Token KHÔNG bao giờ được in ra, kể cả trong thông báo lỗi — nó nằm ngay trong
 * đường dẫn URL, nên mọi chỗ ghi lại URL đều phải che nó đi.
 */
import https from 'node:https'

const HOST = 'api.telegram.org'

export class TelegramError extends Error {}

/** Che token trong bất cứ chuỗi nào sắp được in ra */
export function redact(text, token) {
  return token ? String(text).split(token).join('<token>') : String(text)
}

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

/**
 * Gọi một phương thức của Bot API.
 *
 * `timeoutMs` phải lớn hơn `timeout` của getUpdates: kiểu chờ dài giữ kết nối
 * mở cho tới khi có tin nhắn, nên đặt hạn ngắn hơn là tự cắt mỗi vòng.
 */
export async function callApi(token, method, params = {}, { timeoutMs = 15_000 } = {}) {
  const payload = JSON.stringify(params)
  const res = await Promise.race([
    request(
      {
        host: HOST,
        path: `/bot${token}/${method}`,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
      },
      payload,
    ),
    new Promise((_, reject) => setTimeout(() => reject(new TelegramError(`${method}: quá hạn`)), timeoutMs)),
  ])

  let json
  try {
    json = JSON.parse(res.body)
  } catch {
    throw new TelegramError(`${method}: máy chủ trả về thứ không phải JSON (HTTP ${res.status})`)
  }
  if (!json.ok) {
    // description do Telegram sinh ra, không chứa token — nhưng che cho chắc
    throw new TelegramError(`${method}: ${redact(json.description ?? 'lỗi không rõ', token)}`)
  }
  return json.result
}

/**
 * Dựng thân multipart/form-data.
 *
 * Tách riêng và xuất ra để kiểm được mà không cần chạm tới mạng: phần dễ sai
 * nhất của tệp này là mấy dấu xuống dòng giữa các phần, và sai ở đó thì tệp
 * gửi lên hỏng mà lỗi trả về lại chẳng nói gì về nguyên nhân.
 */
export function buildMultipart(fields, file, boundary) {
  const parts = []
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`, 'utf8'),
    )
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.name}"\r\n` +
          `Content-Type: ${file.type}\r\n\r\n`,
        'utf8',
      ),
      Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8'),
      Buffer.from('\r\n', 'utf8'),
    )
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'))
  return Buffer.concat(parts)
}

/** Gửi một tệp vào cuộc trò chuyện */
export async function sendDocument(token, chatId, { name, data, caption }) {
  const boundary = `xaxi${'-'.repeat(8)}${name.length}${data.length}`
  const body = buildMultipart(
    { chat_id: String(chatId), ...(caption ? { caption } : {}) },
    { field: 'document', name, data, type: 'text/csv' },
    boundary,
  )

  const res = await request(
    {
      host: HOST,
      path: `/bot${token}/sendDocument`,
      method: 'POST',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': body.length },
    },
    body,
  )

  const json = JSON.parse(res.body)
  if (!json.ok) throw new TelegramError(`sendDocument: ${redact(json.description ?? 'lỗi không rõ', token)}`)
  return json.result
}

export const sendMessage = (token, chatId, text) =>
  callApi(token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })

/**
 * Chờ dài: giữ kết nối mở tới `seconds` giây cho tới khi có tin mới.
 *
 * Rẻ hơn hẳn việc hỏi liên tục, và tin nhắn tới thì nhận gần như tức thì.
 */
export const getUpdates = (token, offset, seconds = 25) =>
  callApi(
    token,
    'getUpdates',
    { offset, timeout: seconds, allowed_updates: ['message'] },
    { timeoutMs: (seconds + 10) * 1000 },
  )
