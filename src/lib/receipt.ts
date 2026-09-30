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

/* ---------------- hoa don giay ---------------- */

/**
 * Nhan cua dong tong tien tren hoa don in, xep theo DO UU TIEN.
 *
 * Mot to hoa don co nhieu con so to: tong hang, thue, tong thanh toan, tien
 * khach dua, tien thoi lai. Chi mot trong so do la so tien giao dich. Thu tu
 * duoi day quyet dinh lay cai nao — "thanh toan" thang "tong cong", vi tong
 * cong thuong la truoc thue.
 */
const TOTAL_LABELS: RegExp[] = [
  /t[oôổ]ng\s*thanh\s*to[aá]n/i,
  /thanh\s*to[aá]n|th[aà]nh\s*ti[eề]n/i,
  /t[oôổ]ng\s*c[oộ]ng|t[oôổ]ng\s*ti[eề]n|t[oôổ]ng\s*s[oố]\s*ti[eề]n/i,
  /grand\s*total|total|amount\s*due/i,
  /t[oôổ]ng|c[oộ]ng/i,
]

/**
 * Dong co so to nhung KHONG phai so tien giao dich.
 *
 * "Tien mat 200.000" la so khach dua, "Tien thua 12.080" la tien thoi lai. Lay
 * nham mot trong hai thi khoan chi ghi vao so sai, ma nhin qua van hop ly.
 */
const NOT_TOTAL = /ti[eề]n\s*m[aặ]t|ti[eề]n\s*th[uừ]a|ti[eề]n\s*th[oố]i|kh[aá]ch\s*[dđ]ua|ti[eề]n\s*kh[aá]ch|cash|change/i

/** So tien in tran, khong kem don vi: 187.920 hoac 187920 */
const BARE_MONEY = /\d{1,3}(?:[.,]\d{3})+|\d{4,}/g

/**
 * Tim so tien tren dong tong cua mot to hoa don in.
 *
 * Can GIU NGUYEN xuong dong, nen ham nay nhan van ban tho chu khong phai ban da
 * lam phang: "dong nao co chu THANH TOAN" la toan bo y tuong.
 */
function findTotalOnLine(raw: string): number | null {
  const lines = raw.split(/\r?\n/)
  for (const label of TOTAL_LABELS) {
    for (const line of lines) {
      if (!label.test(line) || NOT_TOTAL.test(line)) continue
      const nums = [...line.matchAll(BARE_MONEY)]
        .map((m) => Number(m[0].replace(/[.,]/g, '')))
        // Duoi 1000 thi gan nhu chac chan la so luong, gio, hay ma so
        .filter((n) => Number.isFinite(n) && n >= 1000)
      if (nums.length > 0) return Math.max(...nums)
    }
  }
  return null
}

/**
 * Ten cua hang, doan tu phan dau to hoa don.
 *
 * Khong lay don gian "dong dau tien": anh chup thuong dinh ca thanh trang thai
 * cua dien thoai, nen dong dau co the la "8:26 ae M". Lay dong NHIEU CHU CAI
 * nhat trong vai dong dau thi ten cua hang thang, vi no von duoc in to va dam.
 */
function findShopName(raw: string): string {
  const dau = raw
    .split(/\r?\n/)
    .slice(0, 6)
    .map((l) => l.trim())
    .filter((l) => l.length >= 3 && !/^[-=_.*\s]+$/.test(l))

  /*
   * Cham diem theo CHU IN HOA truoc, roi moi den tong so chu cai.
   *
   * Ten cua hang tren hoa don gan nhu luon in hoa va in to. Chi dem tong so chu
   * cai thi dong dia chi chi nhanh dai hon lai thang — da thay dung nhu vay tren
   * may that: "Chi nh anh Nguyen Hue" (20 chu) danh bai "HIGHLANDS COFFEE" (15).
   */
  let best = ''
  let bestHoa = -1
  let bestChu = 0
  for (const line of dau) {
    const hoa = (line.match(/[\p{Lu}]/gu) ?? []).length
    const chu = (line.match(/[\p{L}]/gu) ?? []).length
    if (hoa > bestHoa || (hoa === bestHoa && chu > bestChu)) {
      bestHoa = hoa
      bestChu = chu
      best = line
    }
  }
  return bestChu >= 4 ? best.replace(/\s+/g, ' ').slice(0, 80) : ''
}

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

/** Lay phan mo ta giao dich: sau 'ND:', 'ND ', 'tai', 'cho', 'noi dung' */
function findNote(text: string): string {
  const patterns = [
    // Co dau hai cham hoac gach ngang — dang ro rang nhat
    /(?:^|[\s.;|])(?:nd|noi dung|nội dung|content|ct|mo ta|mô tả)\s*[:\-]\s*([^\n.;|]{3,120})/i,
    // Chi cach bang khoang trang. Nhieu ngan hang viet "ND GRAB CHUYEN DI" khong
    // dau hai cham; thieu dang nay thi ghi chu roi ve ten ngan hang, va danh muc
    // khong bao gio doan dung. Bo 'ct' khoi danh sach o day vi hai ky tu do qua
    // de trung voi thu khac khi khong con dau phan cach de neo.
    /(?:^|[\s.;|])(?:nd|noi dung|nội dung|content|mo ta|mô tả)\s+([^\n.;|]{3,120})/i,
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
  /*
   * Khong thay so tien nao kem don vi — co the day la HOA DON GIAY.
   *
   * Tin nhan ngan hang luon ghi "120,000VND" hay "-35.000d". To hoa don in thi
   * in so tran trong mot cot: "THANH TOAN    187.920". Truoc khi co duong nay,
   * chup mot to hoa don that ra chu doc duoc nhung khong ra so tien nao —
   * dung cai da do tren may that.
   */
  if (hits.length === 0) {
    const total = findTotalOnLine(raw)
    if (total === null) return null
    return {
      amount: Math.round(total),
      // To hoa don ban hang luon la mot khoan chi
      kind: 'expense',
      date: findDate(text) ?? toISO(new Date()),
      note: findShopName(raw),
      // Khong co don vi tien te thi day van la mot phong doan; nguoi dung duyet lai
      confidence: 'low',
    }
  }

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
