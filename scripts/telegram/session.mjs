/**
 * Phần logic thuần của bot: nhận một tin nhắn, trả về việc phải làm.
 *
 * Tách khỏi phần mạng để kiểm được mà không cần token, không cần Telegram, và
 * không cần chờ. Mọi quyết định của bot — nhận hay bỏ qua tin, hiểu ra giao
 * dịch gì, trả lời câu nào — đều nằm ở đây.
 *
 * KHÔNG CÓ KHO DỮ LIỆU. Danh sách chờ nằm trong bộ nhớ của tiến trình; đóng
 * chương trình là hết. Đây là điều phân biệt "mức A" với một con bot có cơ sở
 * dữ liệu riêng: không tồn tại kho chi tiêu nào ngoài máy bạn.
 */

/** Định dạng tiền cho câu trả lời — dấu chấm ngăn nghìn như trong app */
export function formatMoney(n) {
  return `${Math.round(n).toLocaleString('vi-VN')} đ`
}

/**
 * Tách lệnh khỏi tin nhắn.
 *
 * Telegram gắn thêm tên bot vào lệnh khi ở trong nhóm (`/xuat@xaxi_bot`), nên
 * phải cắt phần đó đi — nếu không thì mọi lệnh gõ trong nhóm đều không khớp.
 */
export function parseCommand(text) {
  const m = String(text ?? '').trim().match(/^\/([a-zA-Z_]+)(?:@\S+)?\s*(.*)$/s)
  return m ? { cmd: m[1].toLowerCase(), rest: m[2].trim() } : null
}

/**
 * Tin này có được xử lý không.
 *
 * Bot công khai: bất cứ ai biết tên nó đều nhắn được. Không chốt theo chat id
 * thì người lạ chèn được giao dịch vào sổ chi tiêu của bạn.
 *
 * Tin từ người lạ bị bỏ qua IM LẶNG, không trả lời gì. Trả lời là xác nhận cho
 * họ biết bot có thật và đang chạy.
 */
export function isAllowed(message, chatId) {
  return Boolean(message?.chat?.id) && String(message.chat.id) === String(chatId)
}

const GIUP = [
  '<b>XAXI · ghi chi qua Telegram</b>',
  '',
  'Gõ thẳng khoản chi, ví dụ:',
  '· <code>cà phê 35k</code>',
  '· <code>xăng 100k hôm qua</code>',
  '· <code>+15tr lương</code>',
  '',
  'Lệnh:',
  '/xem — những khoản đang chờ',
  '/bo — bỏ khoản vừa ghi',
  '/xuat — xuất tệp CSV để nhập vào app',
  '/giup — bảng này',
].join('\n')

/**
 * Danh sách chờ trong bộ nhớ.
 *
 * `parse` là hàm đọc một câu thành giao dịch — chính hàm mà app dùng, được
 * truyền vào từ ngoài để phần logic này không phải biết gì về app.
 */
export class Session {
  constructor(parse) {
    this.parse = parse
    this.pending = []
  }

  /**
   * @returns {{reply: string, file?: {rows: object[]}}}
   */
  handle(text) {
    const lenh = parseCommand(text)
    if (lenh) return this.command(lenh)

    const parsed = this.parse(text)
    if (!parsed || !(parsed.amount > 0)) {
      return {
        reply: [
          'Chưa nhận ra số tiền trong câu này.',
          '',
          'Thử kèm con số, ví dụ <code>cà phê 35k</code>. Gõ /giup để xem thêm.',
        ].join('\n'),
      }
    }

    const row = {
      date: parsed.date,
      note: parsed.note || text.trim(),
      amount: parsed.amount,
      kind: parsed.kind,
    }
    this.pending.push(row)

    const dau = row.kind === 'expense' ? '−' : '+'
    return {
      reply: [
        `${dau}${formatMoney(row.amount)} · ${row.note}`,
        `<i>${row.date} · đang chờ (${this.pending.length})</i>`,
      ].join('\n'),
    }
  }

  command({ cmd }) {
    if (cmd === 'giup' || cmd === 'help' || cmd === 'start') return { reply: GIUP }

    if (cmd === 'xem') {
      if (this.pending.length === 0) return { reply: 'Chưa có khoản nào đang chờ.' }
      const dong = this.pending.map((r, i) => {
        const dau = r.kind === 'expense' ? '−' : '+'
        return `${i + 1}. ${dau}${formatMoney(r.amount)} · ${r.note} <i>(${r.date})</i>`
      })
      return { reply: [`<b>${this.pending.length} khoản đang chờ</b>`, ...dong].join('\n') }
    }

    if (cmd === 'bo') {
      const bo = this.pending.pop()
      if (!bo) return { reply: 'Không có gì để bỏ.' }
      return { reply: `Đã bỏ: ${bo.note} · ${formatMoney(bo.amount)}` }
    }

    if (cmd === 'xuat') {
      if (this.pending.length === 0) return { reply: 'Chưa có khoản nào để xuất.' }
      // Chỉ trả về dữ liệu; ghi tệp và gửi đi là việc của phần ngoài
      return { reply: '', file: { rows: [...this.pending] } }
    }

    return { reply: `Không hiểu lệnh /${cmd}. Gõ /giup để xem danh sách.` }
  }

  /** Gọi sau khi xuất xong: danh sách chờ được dọn để không xuất trùng */
  clear() {
    const n = this.pending.length
    this.pending = []
    return n
  }
}
