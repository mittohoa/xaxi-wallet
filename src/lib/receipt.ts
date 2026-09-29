/**
 * Doc van ban bien lai / tin nhan bien dong so du do NGUOI DUNG chu dong dan vao.
 *
 * Chu y ve quyen rieng tu: module nay khong doc SMS, khong nghe thong bao,
 * khong dung Accessibility Service. No chi xu ly doan van ban duoc dan hoac
 * chia se vao app, va ket qua luon hien ra cho nguoi dung duyet truoc khi luu.
 */
import type { TxKind } from '../types'
import { toISO } from './date'

export interface ReceiptParse {
  amount: number
  kind: TxKind
  date: string
  note: string
  /** so du sau giao dich, neu tin nhan co ghi — dung de doi soat vi */
  balance?: number
  /** ten ngan hang / vi doan duoc tu noi dung */
  issuer?: string
  /** do tin cay tho: 'high' khi co ca dau va don vi tien te */
  confidence: 'high' | 'low'
}

const MONEY = /([+-]?)\s*(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(vnd|vnđ|đ|d\b)/gi

const BALANCE_LABEL = /(so du|số dư|sd|sodu|balance|available)/i
const EXPENSE_HINTS = [
  'thanh toan', 'thanh toán', 'chuyen tien', 'chuyển tiền', 'chuyen khoan', 'chuyển khoản',
  'rut tien', 'rút tiền', 'mua', 'tru tien', 'trừ tiền', 'chi tieu', 'chi tiêu', 'quet the', 'quét thẻ',
  'ghi no', 'ghi nợ', 'debit', 'payment', 'da tra', 'đã trả',
]
const INCOME_HINTS = [
  'nhan tien', 'nhận tiền', 'nhan duoc', 'nhận được', 'ghi co', 'ghi có', 'credit',
  'nap tien', 'nạp tiền', 'hoan tien', 'hoàn tiền', 'tien ve', 'tiền về', 'luong', 'lương', 'refund',
]

const ISSUERS: [RegExp, string][] = [
  [/vietcombank|\bvcb\b/i, 'Vietcombank'],
  [/techcombank|\btcb\b/i, 'Techcombank'],
  [/vietinbank|\bctg\b/i, 'VietinBank'],
  [/\bbidv\b/i, 'BIDV'],
  [/\bmb ?bank\b|\bmbb\b/i, 'MB Bank'],
  [/\bacb\b/i, 'ACB'],
  [/\btpbank\b|\btpb\b/i, 'TPBank'],
  [/\bvpbank\b|\bvpb\b/i, 'VPBank'],
  [/sacombank|\bstb\b/i, 'Sacombank'],
  [/\bagribank\b/i, 'Agribank'],
  [/\bmomo\b/i, 'MoMo'],
  [/zalopay/i, 'ZaloPay'],
  [/viettel ?money/i, 'Viettel Money'],
  [/\bvnpay\b/i, 'VNPay'],
  [/shopeepay|\bairpay\b/i, 'ShopeePay'],
]

function toNumber(intPart: string, decimals?: string): number {
  const whole = Number(intPart.replace(/[.,]/g, ''))
  if (!Number.isFinite(whole)) return NaN
  return decimals ? whole + Number(`0.${decimals}`) : whole
}

function findDate(text: string): string | null {
  const now = new Date()
  const m = text.match(/(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  let year = m[3] ? Number(m[3]) : now.getFullYear()
  if (year < 100) year += 2000
  const d = new Date(year, month - 1, day)
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null
  if (!m[3] && d > now) d.setFullYear(year - 1)
  return toISO(d)
}

/**
 * Cac nhan thuong dung sau phan mo ta — dung de biet mo ta ket thuc o dau.
 * Van ban tu OCR khong co dau cau nen khong the chi dua vao dau cham.
 */
const NOTE_STOPPERS = [
  'so du', 'số dư', 'sd:', 'sodu', 'balance', 'available',
  'ref', 'ma gd', 'mã gd', 'ma giao dich', 'mã giao dịch', 'trace',
  'so tk', 'số tk', 'luc ', 'lúc ', 'thoi gian', 'thời gian',
]

/** Cat chuoi tai nhan dau tien gap phai */
function cutAtStopper(text: string): string {
  const lower = text.toLowerCase()
  let end = text.length
  for (const stopper of NOTE_STOPPERS) {
    const at = lower.indexOf(stopper)
    if (at > 0 && at < end) end = at
  }
  return text.slice(0, end)
}

/** Lay phan mo ta giao dich: sau 'ND:', 'tai', 'cho', 'noi dung' */
function findNote(text: string): string {
  const patterns = [
    /(?:^|[\s.;|])(?:nd|noi dung|nội dung|content|ct|mo ta|mô tả)\s*[:\-]\s*([^\n.;|]{3,120})/i,
    /(?:tai|tại|cho|to|at)\s+([A-Za-zÀ-ỹ0-9][^\n.;|]{2,120})/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (!m) continue
    const note = cutAtStopper(m[1])
      .replace(/\s+/g, ' ')
      .replace(/[.,;:\-]+$/, '')
      .trim()
    if (note.length >= 2) return note.slice(0, 80)
  }
  return ''
}

export function parseReceipt(raw: string): ReceiptParse | null {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (text.length < 6) return null

  // Thu thap moi so tien kem don vi, ghi nho no co nam ngay sau nhan 'so du' hay khong
  interface Hit {
    value: number
    sign: string
    index: number
    isBalance: boolean
  }
  const hits: Hit[] = []
  MONEY.lastIndex = 0
  for (let m = MONEY.exec(text); m; m = MONEY.exec(text)) {
    const value = toNumber(m[2], m[3])
    if (!Number.isFinite(value) || value <= 0) continue
    const before = text.slice(Math.max(0, m.index - 28), m.index)
    hits.push({ value, sign: m[1], index: m.index, isBalance: BALANCE_LABEL.test(before) })
  }
  if (hits.length === 0) return null

  const balanceHit = [...hits].reverse().find((h) => h.isBalance)
  const amountHit = hits.find((h) => !h.isBalance) ?? hits[0]
  if (!amountHit) return null

  const lower = text.toLowerCase()
  let kind: TxKind
  if (amountHit.sign === '-') kind = 'expense'
  else if (amountHit.sign === '+') kind = 'income'
  else if (INCOME_HINTS.some((h) => lower.includes(h))) kind = 'income'
  else if (EXPENSE_HINTS.some((h) => lower.includes(h))) kind = 'expense'
  else kind = 'expense'

  const issuer = ISSUERS.find(([re]) => re.test(text))?.[1]

  return {
    amount: Math.round(amountHit.value),
    kind,
    date: findDate(text) ?? toISO(new Date()),
    note: findNote(text) || issuer || '',
    balance: balanceHit && balanceHit !== amountHit ? Math.round(balanceHit.value) : undefined,
    issuer,
    confidence: amountHit.sign || /vnd|vnđ|đ/i.test(text) ? 'high' : 'low',
  }
}
