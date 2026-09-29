/**
 * Nhìn về phía trước: khoản sắp tới và dự báo cuối kỳ.
 *
 * Cả tệp này KHÔNG đòi người dùng nhập thêm gì. Nó chỉ đọc thứ app đã có —
 * quy tắc định kỳ và lịch sử giao dịch — rồi trả lời câu người ta thật sự hỏi
 * trước khi tiêu: *từ giờ tới cuối tháng còn phải trả những gì, và với nhịp này
 * thì cuối tháng hết bao nhiêu?*
 *
 * Biết điều đó ngày 12 thì còn kịp xoay; biết ngày 30 thì chỉ còn hối tiếc.
 */
import type { Recurring, Transaction } from '../types'
import { advance } from './recurring'
import { isTransfer } from './stats'

const DAY = 86_400_000
const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

/** Số ngày từ `from` tới `to`, tính cả hai đầu. Trả 0 khi `to` nằm trước `from`. */
export function daysInclusive(from: string, to: string): number {
  if (to < from) return 0
  return Math.round((at(to) - at(from)) / DAY) + 1
}

/**
 * Mọi lần đến hạn của một quy tắc trong khoảng `[from, to]`.
 *
 * `cap` là chốt an toàn: quy tắc hàng ngày trong một khoảng dài sẽ sinh ra rất
 * nhiều mốc, và không màn hình nào cần tới hàng nghìn mốc.
 */
export function occurrencesBetween(rule: Recurring, from: string, to: string, cap = 200): string[] {
  const out: string[] = []
  let cursor = rule.nextDate
  // Quy tắc có thể đang trễ hạn; nhảy tới đầu khoảng trước đã
  for (let guard = 0; cursor < from && guard < cap; guard++) cursor = advance(rule, cursor)
  for (let guard = 0; cursor <= to && guard < cap; guard++) {
    out.push(cursor)
    cursor = advance(rule, cursor)
  }
  return out
}

export interface Upcoming {
  rule: Recurring
  /** ngày đến hạn gần nhất còn nằm trong kỳ */
  date: string
  /** còn bao nhiêu ngày nữa; 0 là hôm nay */
  daysAway: number
}

/**
 * Các khoản định kỳ sắp đến hạn, gần nhất trước.
 *
 * Mỗi quy tắc chỉ lấy MỘT lần đến hạn gần nhất. Quy tắc hàng ngày mà liệt kê
 * hết thì chiếm sạch danh sách và đẩy tiền nhà — thứ người ta thật sự cần nhớ —
 * xuống dưới.
 */
export function upcoming(rules: Recurring[], today: string, end: string, limit = 3): Upcoming[] {
  const out: Upcoming[] = []
  for (const rule of rules) {
    if (!rule.active) continue
    const [first] = occurrencesBetween(rule, today, end, 1)
    if (!first) continue
    out.push({ rule, date: first, daysAway: Math.round((at(first) - at(today)) / DAY) })
  }
  return out.sort((a, b) => (a.date === b.date ? b.rule.amount - a.rule.amount : a.date.localeCompare(b.date))).slice(0, limit)
}

/** Tổng tiền các khoản chi định kỳ CHƯA tới hạn, còn lại trong kỳ */
export function committedRemaining(rules: Recurring[], today: string, end: string): number {
  let total = 0
  for (const rule of rules) {
    if (!rule.active || rule.kind !== 'expense') continue
    // Bỏ chính hôm nay: khoản của hôm nay đã được postDueRecurring ghi vào rồi
    for (const _ of occurrencesBetween(rule, nextDay(today), end)) total += rule.amount
  }
  return total
}

function nextDay(iso: string): string {
  return new Date(at(iso) + DAY).toISOString().slice(0, 10)
}

export interface Forecast {
  /** tổng chi dự báo cho cả kỳ */
  projected: number
  /** đã chi thật tới hôm nay */
  spent: number
  /** khoản định kỳ chắc chắn sẽ phát sinh trong phần còn lại của kỳ */
  committed: number
  /** nhịp chi biến đổi, trung bình mỗi ngày */
  dailyRate: number
  daysLeft: number
  /**
   * Có đủ căn cứ để đưa ra con số này không.
   *
   * false thì MÀN HÌNH KHÔNG ĐƯỢC HIỆN DỰ BÁO. Dự báo từ dữ liệu thủng là bịa
   * số, và con số bịa trong một app tài chính còn tệ hơn là không có con số.
   */
  confident: boolean
}

/**
 * Dự báo tổng chi cuối kỳ.
 *
 * Tách chi định kỳ khỏi chi biến đổi rồi mới suy ra nhịp — không thì tiền nhà
 * ghi ngày mùng 3 sẽ bị nhân lên cho cả tháng và dự báo phóng đại gấp mấy lần.
 *
 * @param coverage tỉ lệ ngày đã có dữ liệu trong cửa sổ gần đây, 0–1
 */
export function forecast(
  periodTx: Transaction[],
  rules: Recurring[],
  today: string,
  range: { start: string; end: string },
  coverage: number,
): Forecast {
  const spendable = periodTx.filter((t) => t.kind === 'expense' && !isTransfer(t))
  const spent = spendable.reduce((s, t) => s + t.amount, 0)
  const variable = spendable.filter((t) => t.source !== 'recurring').reduce((s, t) => s + t.amount, 0)

  const elapsed = daysInclusive(range.start, today < range.end ? today : range.end)
  const daysLeft = today >= range.end ? 0 : daysInclusive(nextDay(today), range.end)
  const dailyRate = elapsed > 0 ? variable / elapsed : 0
  const committed = committedRemaining(rules, today, range.end)

  return {
    projected: Math.round(spent + dailyRate * daysLeft + committed),
    spent,
    committed,
    dailyRate: Math.round(dailyRate),
    daysLeft,
    // Bốn điều kiện, mỗi cái chặn một kiểu nói nhảm:
    //
    //   elapsed >= 5   năm ngày là mốc tối thiểu để một nhịp có nghĩa; dưới đó
    //                  một bữa nhậu cũng đủ làm dự báo cả tháng sai gấp đôi
    //   daysLeft >= 3  còn một hai ngày thì dự báo gần bằng số đã chi — đúng
    //                  nhưng vô dụng, và một con số vô dụng chiếm chỗ thì lần
    //                  sau người dùng thôi nhìn vào chỗ đó
    //   coverage       dữ liệu thủng thì mọi phép ngoại suy đều là bịa
    //   spent > 0      chưa ghi khoản nào thì không có gì để suy ra
    confident: elapsed >= 5 && daysLeft >= 3 && coverage >= 0.5 && spent > 0,
  }
}
