/**
 * Ghi CSV đúng định dạng mà đường "Nhập sao kê CSV" của app đọc được.
 *
 * Dùng chung cho mọi công cụ chạy tại máy: bộ đọc email ngân hàng và bot
 * Telegram đều kết thúc ở cùng một chỗ — một tệp CSV nằm trên đĩa người dùng.
 * Giữ một bản duy nhất để tiêu đề cột không bao giờ lệch nhau.
 */

/** Ba cột này phải khớp với bộ đọc sao kê trong src/lib/statement.ts */
const HEAD = ['Ngày', 'Nội dung', 'Số tiền']

function cell(value) {
  const s = String(value ?? '')
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * @param {{date: string, note: string, amount: number, kind: 'income'|'expense'}[]} rows
 */
export function toCSV(rows) {
  const body = rows.map((r) => [r.date, r.note, r.kind === 'expense' ? -r.amount : r.amount].map(cell).join(','))
  // BOM để Excel đọc đúng tiếng Việt; không có nó thì mở ra toàn ký tự lạ
  return '﻿' + [HEAD.join(','), ...body].join('\r\n')
}

/** Tên tệp theo ngày, để chạy nhiều lần trong ngày không đè lên nhau */
export function csvName(prefix, iso) {
  return `${prefix}-${iso}.csv`
}
