/**
 * Mã hoá đầu-cuối cho tệp đồng bộ.
 *
 * Đồng bộ không mâu thuẫn với nguyên tắc riêng tư, **nếu chỗ chứa không bao giờ
 * đọc được nội dung** (§3.6). Khoá sinh ra từ cụm mật khẩu của người dùng và
 * không bao giờ rời khỏi máy; thứ đi ra ngoài chỉ là một khối byte vô nghĩa.
 *
 * Dùng WebCrypto có sẵn — không thêm thư viện mã hoá nào. Tự viết mã hoá là sai
 * lầm kinh điển, mà nhét thêm một thư viện vào đúng chỗ cầm khoá của người dùng
 * cũng không khá hơn.
 *
 * KHÔNG CÓ CỬA SAU. Mất cụm mật khẩu là mất sạch tệp đó — không ai khôi phục
 * được, kể cả người viết app. Giao diện phải nói thẳng điều này trước khi bật.
 */

/** Định dạng tệp; đổi thì phải đọc được cả bản cũ */
const VERSION = 1

/**
 * Số vòng lặp dẫn xuất khoá.
 *
 * Càng nhiều thì đoán mò cụm mật khẩu càng đắt, nhưng mở tệp cũng càng lâu. Mốc
 * này mất khoảng một phần tư giây trên điện thoại tầm trung — đủ để một lần mở
 * tệp không thấy khó chịu, mà kẻ đoán mò thì phải trả đúng ngần ấy cho MỖI lần
 * đoán.
 *
 * Nằm trong tệp chứ không viết cứng khi đọc: nâng số vòng sau này vẫn mở được
 * tệp cũ.
 */
const ITERATIONS = 250_000

const SALT_BYTES = 16
const IV_BYTES = 12

export class SyncCryptoError extends Error {}

/* ---------------- base64 ---------------- */

/**
 * Chuyển từng khúc chứ không một lần.
 *
 * `String.fromCharCode(...bytes)` với mảng vài trăm nghìn phần tử làm tràn ngăn
 * xếp — lỗi chỉ hiện ra khi người dùng đã có nhiều dữ liệu, tức là đúng lúc
 * việc đồng bộ mới bắt đầu đáng giá.
 */
function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

function fromBase64(text: string): Uint8Array {
  const raw = atob(text)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/* ---------------- nén ---------------- */

const canCompress = () => typeof CompressionStream !== 'undefined'

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  return drain(new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw')))
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  return drain(new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')))
}

/* ---------------- khoá ---------------- */

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/* ---------------- phong bì ---------------- */

export interface Envelope {
  app: 'xaxi-sync'
  v: number
  kdf: 'PBKDF2-SHA256'
  iter: number
  salt: string
  iv: string
  zip: boolean
  data: string
}

/**
 * Muối và véc-tơ khởi tạo nằm NGOÀI phần mã hoá, và đó là đúng.
 *
 * Cả hai không phải bí mật — chúng tồn tại để cùng một cụm mật khẩu không bao
 * giờ sinh ra hai tệp giống hệt nhau. Giấu chúng đi thì chính người dùng cũng
 * không mở được tệp của mình.
 */
export async function encryptSync(payload: unknown, passphrase: string): Promise<Envelope> {
  if (!passphrase) throw new SyncCryptoError('Chưa có cụm mật khẩu.')

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(passphrase, salt, ITERATIONS)

  const json = new TextEncoder().encode(JSON.stringify(payload))
  const zip = canCompress()
  const body = zip ? await deflate(json) : json

  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, body as BufferSource)

  return {
    app: 'xaxi-sync',
    v: VERSION,
    kdf: 'PBKDF2-SHA256',
    iter: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    zip,
    data: toBase64(new Uint8Array(sealed)),
  }
}

export async function decryptSync(envelope: unknown, passphrase: string): Promise<unknown> {
  const e = envelope as Partial<Envelope>
  if (!e || e.app !== 'xaxi-sync') throw new SyncCryptoError('Đây không phải tệp đồng bộ của XAXI.')
  if (typeof e.v !== 'number' || e.v > VERSION) {
    throw new SyncCryptoError(`Tệp thuộc bản ${e.v} — bản XAXI này chỉ đọc được tới ${VERSION}. Hãy cập nhật app.`)
  }
  if (e.kdf !== 'PBKDF2-SHA256') throw new SyncCryptoError(`Không hiểu cách dẫn xuất khoá "${e.kdf}".`)
  if (!e.salt || !e.iv || !e.data || !e.iter) throw new SyncCryptoError('Tệp đồng bộ thiếu thành phần, có thể đã hỏng.')

  const key = await deriveKey(passphrase, fromBase64(e.salt), e.iter)

  let body: ArrayBuffer
  try {
    body = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(e.iv) as BufferSource },
      key,
      fromBase64(e.data) as BufferSource,
    )
  } catch {
    /*
     * AES-GCM có thẻ xác thực, nên sai cụm mật khẩu và tệp bị sửa đổi đều dừng
     * ở đây. Không phân biệt được hai trường hợp — và cũng không nên: nói rõ
     * "mật khẩu sai nhưng tệp còn nguyên" là giúp người đoán mò.
     */
    throw new SyncCryptoError('Không mở được: sai cụm mật khẩu, hoặc tệp đã hỏng.')
  }

  const bytes = e.zip ? await inflate(new Uint8Array(body)) : new Uint8Array(body)
  return JSON.parse(new TextDecoder().decode(bytes))
}
