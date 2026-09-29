/**
 * Bộ khách IMAP tối giản, chạy trên node:tls, không phụ thuộc thư viện nào.
 *
 * VÌ SAO TỰ VIẾT: công cụ này cầm mật khẩu hộp thư của người dùng. Mỗi gói phụ
 * thuộc thêm vào là một cửa nữa mà mật khẩu đó có thể đi ra, và một chuỗi cập
 * nhật nữa phải theo dõi. Phần IMAP cần cho việc đọc vài chục thư nhỏ hơn nhiều
 * so với cái giá đó.
 *
 * Chỉ làm đúng năm lệnh: LOGIN, EXAMINE, SEARCH, FETCH, LOGOUT.
 *
 * MỞ HỘP THƯ Ở CHẾ ĐỘ CHỈ ĐỌC. `EXAMINE` thay vì `SELECT` — nhờ vậy công cụ
 * không thể đánh dấu thư đã đọc, không thể xoá, không thể đổi nhãn. Một công cụ
 * lặng lẽ đánh dấu đã đọc toàn bộ thư ngân hàng của người dùng là một công cụ
 * hỏng, dù nó lấy dữ liệu đúng.
 *
 * KHÔNG hỗ trợ kết nối không mã hoá. Cổng 143 và STARTTLS đều bị từ chối: mật
 * khẩu hộp thư không được phép đi qua một kết nối có thể bị đọc lén.
 */
import tls from 'node:tls'

const CRLF = '\r\n'

export class ImapError extends Error {}

/** Cổng vốn dành cho giao thức chưa mã hoá; không bao giờ nối tới đây */
const PLAINTEXT_PORTS = new Set([25, 110, 143, 587])

/**
 * @param ca chứng chỉ gốc tự ký, cho máy chủ thư nội bộ của công ty.
 *           Bỏ trống thì dùng bộ chứng chỉ gốc của hệ thống — đúng cho Gmail,
 *           Outlook và mọi nhà cung cấp công cộng.
 */
export async function connect({ host, port = 993, user, pass, timeout = 30_000, ca }) {
  // Kết nối LUÔN đi qua TLS — tệp này không có đường nào khác, chỉ dùng
  // tls.connect. Danh sách dưới đây chặn riêng những cổng vốn là cổng chưa mã
  // hoá: trỏ TLS vào đó chỉ tạo ra một lỗi bắt tay khó hiểu, còn người dùng thì
  // tưởng mình đang nối an toàn.
  if (PLAINTEXT_PORTS.has(port)) {
    throw new ImapError(
      `Cổng ${port} là cổng chưa mã hoá. Dùng IMAPS — hầu hết nhà cung cấp là cổng 993.`,
    )
  }

  const socket = await new Promise((resolve, reject) => {
    const s = tls.connect({ host, port, servername: host, ca }, () => resolve(s))
    s.setTimeout(timeout)
    s.once('error', reject)
    s.once('timeout', () => {
      s.destroy()
      reject(new ImapError(`Quá hạn kết nối tới ${host}:${port}`))
    })
  })

  if (!socket.authorized && socket.authorizationError) {
    socket.destroy()
    throw new ImapError(`Chứng chỉ của ${host} không hợp lệ: ${socket.authorizationError}`)
  }

  let buffer = ''
  const waiters = []

  socket.setEncoding('binary')
  socket.on('data', (chunk) => {
    buffer += chunk
    for (const w of [...waiters]) {
      const hit = w.test(buffer)
      if (hit) {
        waiters.splice(waiters.indexOf(w), 1)
        const taken = buffer.slice(0, hit)
        buffer = buffer.slice(hit)
        w.resolve(taken)
      }
    }
  })

  const until = (test) =>
    new Promise((resolve, reject) => {
      const w = { test, resolve, reject }
      waiters.push(w)
      const t = setTimeout(() => {
        const i = waiters.indexOf(w)
        if (i >= 0) waiters.splice(i, 1)
        reject(new ImapError('Máy chủ không trả lời kịp'))
      }, timeout)
      const done = () => clearTimeout(t)
      Promise.resolve().then(() => {
        const original = w.resolve
        w.resolve = (v) => {
          done()
          original(v)
        }
      })
      // Dữ liệu có thể đã nằm sẵn trong bộ đệm trước khi ai kịp chờ
      const hit = test(buffer)
      if (hit) {
        const i = waiters.indexOf(w)
        if (i >= 0) waiters.splice(i, 1)
        done()
        const taken = buffer.slice(0, hit)
        buffer = buffer.slice(hit)
        resolve(taken)
      }
    })

  // Lời chào của máy chủ
  await until((b) => {
    const at = b.indexOf(CRLF)
    return at < 0 ? 0 : at + 2
  })

  let counter = 0

  /**
   * Gửi một lệnh và đọc tới dòng kết thúc mang đúng thẻ của lệnh đó.
   *
   * IMAP cho phép máy chủ chen các dòng thông báo không mời mà đến giữa chừng,
   * nên không thể chỉ đọc một dòng — phải đọc tới đúng thẻ mình gửi.
   */
  async function send(command, { secret = false } = {}) {
    const tag = `A${String(++counter).padStart(4, '0')}`
    socket.write(`${tag} ${command}${CRLF}`, 'binary')

    const raw = await until((b) => {
      const at = b.indexOf(`${CRLF}${tag} `)
      if (at < 0) return b.startsWith(`${tag} `) ? (b.indexOf(CRLF) < 0 ? 0 : b.indexOf(CRLF) + 2) : 0
      const end = b.indexOf(CRLF, at + 2)
      return end < 0 ? 0 : end + 2
    })

    const at = raw.lastIndexOf(`${tag} `)
    const status = raw.slice(at + tag.length + 1).trim()
    if (!/^OK/i.test(status)) {
      // Không bao giờ in lại lệnh khi lệnh đó chứa mật khẩu
      throw new ImapError(`${secret ? 'LOGIN' : command.split(' ')[0]} bị từ chối: ${status}`)
    }
    return raw.slice(0, at)
  }

  await send(`LOGIN ${quote(user)} ${quote(pass)}`, { secret: true })

  return {
    /** Mở hộp thư ở chế độ CHỈ ĐỌC */
    async examine(mailbox) {
      await send(`EXAMINE ${quote(mailbox)}`)
    },

    /** Trả về danh sách số thứ tự thư khớp điều kiện */
    async search(criteria) {
      const raw = await send(`SEARCH ${criteria}`)
      const line = raw.split(CRLF).find((l) => /^\* SEARCH/i.test(l)) ?? ''
      return line
        .replace(/^\* SEARCH/i, '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(Number)
    },

    /** Lấy trọn nội dung một thư, không đánh dấu đã đọc */
    async fetchRaw(seq) {
      const raw = await send(`FETCH ${seq} (BODY.PEEK[])`)
      // Máy chủ trả literal: * 12 FETCH (BODY[] {4096}\r\n<4096 byte>\r\n)
      const m = raw.match(/\{(\d+)\}\r\n/)
      if (!m) return ''
      const start = raw.indexOf(m[0]) + m[0].length
      return raw.slice(start, start + Number(m[1]))
    },

    async close() {
      try {
        await send('LOGOUT')
      } catch {
        /* đóng kết nối là việc dọn dẹp, hỏng cũng không ảnh hưởng kết quả */
      }
      socket.destroy()
    },
  }
}

/** Bọc chuỗi theo đúng cách IMAP đòi, thoát dấu nháy và gạch chéo */
function quote(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Ngày theo định dạng IMAP: 29-Sep-2026 */
export function imapDate(iso) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [y, m, d] = iso.split('-').map(Number)
  return `${d}-${months[m - 1]}-${y}`
}
