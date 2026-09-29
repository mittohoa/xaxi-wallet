/**
 * Tang tro ly cua XAXI — bac 1: bo hieu tat dinh, chay hoan toan tren may.
 *
 * Mot o nhap duy nhat nhan ca ba loai dau vao:
 *   ghi     'ca phe 35k'                  -> tao giao dich
 *   hoi     'thang nay an uong bao nhieu' -> tra loi ngay tai cho
 *   lenh    'cai dat', 'ngan sach'        -> mo man hinh tuong ung
 *
 * Bac 2 (OCR bang ML Kit) va bac 3 (mo hinh ngon ngu) se cam vao dung cho nay
 * ma khong doi giao dien: chung chi can tra ve cung kieu `Answer`.
 */
import type { Budget, Category, DayMark, Id, Transaction, TxKind, Wallet } from '../types'
import { containsWord, normalize, parseQuickEntry, type CategoryGuesser, type QuickParse } from './quickadd'
import { defaultRange, extractTimeRange, type TimeRange } from './timerange'
import { byCategory, inRange, spendable, sumTotals, walletBalances, type CategorySlice, type Totals } from './stats'
import { computeCoverage, firstActivity } from './coverage'
import { monthOf } from './date'

/* ---------------- lenh ---------------- */

export type CommandName =
  | 'settings'
  | 'budgets'
  | 'reports'
  | 'receipt'
  | 'reconcile'
  | 'statement'
  | 'history'
  | 'gaps'
  | 'transfer'
  | 'newEntry'
  | 'help'

interface CommandSpec {
  name: CommandName
  /** cac cach go deu dan toi lenh nay, da chuan hoa */
  triggers: string[]
  label: string
  hint: string
}

export const COMMANDS: CommandSpec[] = [
  { name: 'receipt', triggers: ['dan bien lai', 'bien lai', 'dan tin nhan', 'sms'], label: 'Dán biên lai', hint: 'dán tin nhắn biến động số dư' },
  { name: 'newEntry', triggers: ['ghi day du', 'nhap day du', 'giao dich moi', 'them giao dich'], label: 'Ghi đầy đủ', hint: 'chọn ví, danh mục và ngày cụ thể' },
  { name: 'transfer', triggers: ['chuyen tien', 'chuyen khoan noi bo', 'rut tien', 'chuyen vi'], label: 'Chuyển tiền giữa ví', hint: 'không tính vào thu hay chi' },
  { name: 'reconcile', triggers: ['doi soat', 'so du that', 'kiem ke'], label: 'Đối soát số dư', hint: 'gõ một con số, app tự bù phần chưa ghi' },
  { name: 'budgets', triggers: ['ngan sach', 'han muc'], label: 'Ngân sách', hint: 'đặt hạn mức theo danh mục' },
  { name: 'reports', triggers: ['bao cao', 'thong ke', 'bieu do'], label: 'Báo cáo', hint: 'sáu tháng gần nhất' },
  { name: 'statement', triggers: ['sao ke', 'nhap csv', 'import'], label: 'Nhập sao kê', hint: 'file CSV từ app ngân hàng' },
  { name: 'gaps', triggers: ['lap khoang trong', 'ngay trong', 'ngay chua ghi', 'bo sot'], label: 'Lấp khoảng trống', hint: 'ngày nào chưa ghi, một chạm là xong' },
  { name: 'history', triggers: ['giao dich', 'lich su', 'so giao dich'], label: 'Lịch sử giao dịch', hint: 'lọc theo tháng, ví, danh mục' },
  { name: 'settings', triggers: ['cai dat', 'thiet lap', 'tuy chon', 'sao luu', 'xuat du lieu', 'backup'], label: 'Cài đặt', hint: 'danh mục, ví, sao lưu, giao diện' },
  { name: 'help', triggers: ['giup', 'huong dan', 'lam sao', 'go gi', '?'], label: 'Hướng dẫn', hint: 'gõ được những gì' },
]

/* ---------------- ket qua tra loi ---------------- */

export interface AnswerBase {
  title: string
  range?: TimeRange
}

export type Answer =
  | (AnswerBase & { kind: 'total'; totals: Totals; count: number; focus: TxKind | 'both'; category?: Category; estimated: number })
  | (AnswerBase & { kind: 'breakdown'; slices: CategorySlice[]; total: number; focus: TxKind })
  | (AnswerBase & { kind: 'list'; transactions: Transaction[]; total: number })
  | (AnswerBase & { kind: 'balance'; wallets: { wallet: Wallet; balance: number }[]; total: number })
  | (AnswerBase & { kind: 'budget'; month: string; items: { category: Category; limit: number; spent: number }[] })
  | (AnswerBase & { kind: 'compare'; current: Totals; previous: Totals; currentLabel: string; previousLabel: string; focus: TxKind })
  | (AnswerBase & { kind: 'coverage'; ratio: number; gaps: string[]; window: number })
  | (AnswerBase & { kind: 'help'; commands: CommandSpec[] })
  | (AnswerBase & { kind: 'none'; message: string })

export type Intent =
  | { type: 'empty' }
  | { type: 'command'; command: CommandName; label: string }
  | { type: 'entry'; parse: QuickParse; category: Category | undefined }
  | { type: 'query'; answer: Answer }

export interface AskContext {
  transactions: Transaction[]
  categories: Category[]
  wallets: Wallet[]
  budgets: Budget[]
  dayMarks: DayMark[]
  gapWindowDays: number
  /** bo phan loai da hoc tu lich su; khong co thi rot ve tu khoa */
  guesser?: CategoryGuesser
}

/* ---------------- nhan dien tu khoa ---------------- */

const QUESTION_MARKERS = [
  'bao nhieu', 'bn', 'may', 'the nao', 'ra sao', 'con lai', 'con bao',
  'nhieu nhat', 'top', 'lon nhat', 'cao nhat', 'so voi', 'so sanh',
  'liet ke', 'danh sach', 'xem', 'tim', 'thong ke', 'tong',
]

const LIST_MARKERS = ['liet ke', 'danh sach', 'tim', 'xem lai', 'nhung khoan', 'cac khoan']
const BREAKDOWN_MARKERS = ['nhieu nhat', 'top', 'lon nhat', 'cao nhat', 'phan bo', 'vao viec gi', 'vao gi']
const COMPARE_MARKERS = ['so voi', 'so sanh', 'hon hay kem', 'tang hay giam']
const BALANCE_MARKERS = ['so du', 'con bao nhieu tien', 'con bao nhieu', 'trong vi', 'tong tien']
const COVERAGE_MARKERS = ['do phu', 'bo sot', 'ngay trong', 'chua ghi']
const INCOME_MARKERS = ['thu nhap', 'thu vao', 'kiem duoc', 'nhan duoc', 'luong']

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((n) => text.includes(n))
}

function findCommand(folded: string): CommandSpec | undefined {
  return COMMANDS.find((c) => c.triggers.some((t) => folded === t || folded.startsWith(t + ' ') || folded.endsWith(' ' + t)))
}

/** Tim danh muc duoc nhac toi trong cau; uu tien ten dai nhat de 'an uong' khong bi 'an' cuop */
function findCategory(folded: string, categories: Category[], kind?: TxKind): Category | undefined {
  let best: { category: Category; len: number } | undefined
  for (const c of categories) {
    if (kind && c.kind !== kind) continue
    const candidates = [c.name, ...(c.keywords ?? [])]
    for (const raw of candidates) {
      const token = normalize(raw)
      if (token.length < 2 || !containsWord(folded, token)) continue
      if (!best || token.length > best.len) best = { category: c, len: token.length }
    }
  }
  return best?.category
}

/* ---------------- diem vao ---------------- */

export function interpret(input: string, ctx: AskContext): Intent {
  const trimmed = input.trim()
  if (!trimmed) return { type: 'empty' }

  const folded = normalize(trimmed)

  // '?' vua la lenh tro giup vua chua dau hoi — xu ly truoc de khong roi vao nhanh cau hoi
  const helpSpec = COMMANDS.find((c) => c.name === 'help')!
  if (helpSpec.triggers.includes(folded)) return { type: 'command', command: 'help', label: helpSpec.label }

  // Cau hoi duoc uu tien hon ghi chep: 'thang 8 chi bao nhieu' co so nhung khong phai khoan chi
  const looksLikeQuestion = trimmed.includes('?') || hasAny(folded, QUESTION_MARKERS)

  // 'ngan sach' la lenh mo man hinh, nhung 'ngan sach con bao nhieu' la cau hoi.
  // Chi coi la lenh khi nguoi dung khong hoi gi them.
  if (!looksLikeQuestion) {
    const command = findCommand(folded)
    if (command) return { type: 'command', command: command.name, label: command.label }
  }

  if (!looksLikeQuestion) {
    const parse = parseQuickEntry(trimmed, ctx.categories, ctx.transactions, ctx.guesser)
    if (parse) {
      const category = ctx.categories.find((c) => c.id === parse.categoryId)
      return { type: 'entry', parse, category }
    }
  }

  return { type: 'query', answer: answerQuestion(trimmed, folded, ctx) }
}

function answerQuestion(original: string, folded: string, ctx: AskContext): Answer {
  const timeHit = extractTimeRange(folded)
  const range = timeHit?.range ?? defaultRange()
  const rest = timeHit?.rest ?? folded

  // Xet nhanh cu the truoc nhanh chung: 'ngan sach con bao nhieu' vua khop
  // 'ngan sach' vua khop 'con bao nhieu', va y nguoi dung la hoi ngan sach.
  if (hasAny(rest, ['ngan sach', 'han muc'])) return answerBudget(ctx, range)
  if (hasAny(rest, COVERAGE_MARKERS)) return answerCoverage(ctx)
  if (hasAny(rest, BALANCE_MARKERS)) return answerBalance(ctx)

  const focus: TxKind = hasAny(rest, INCOME_MARKERS) ? 'income' : 'expense'
  const category = findCategory(rest, ctx.categories, focus)
  const scoped = inRange(ctx.transactions, range.start, range.end)
  const filtered = category ? scoped.filter((t) => t.categoryId === category.id) : scoped

  if (hasAny(rest, COMPARE_MARKERS) && range.previous) {
    const prev = inRange(ctx.transactions, range.previous.start, range.previous.end)
    const prevFiltered = category ? prev.filter((t) => t.categoryId === category.id) : prev
    return {
      kind: 'compare',
      title: category ? category.name : focus === 'income' ? 'Thu nhập' : 'Chi tiêu',
      range,
      current: sumTotals(filtered),
      previous: sumTotals(prevFiltered),
      currentLabel: range.label,
      previousLabel: range.previous.label,
      focus,
    }
  }

  if (hasAny(rest, BREAKDOWN_MARKERS) && !category) {
    const slices = byCategory(scoped, ctx.categories, focus)
    return {
      kind: 'breakdown',
      title: focus === 'income' ? `Thu ${range.label}` : `Chi ${range.label}`,
      range,
      slices,
      total: slices.reduce((s, x) => s + x.amount, 0),
      focus,
    }
  }

  // Go tron mot tu khoa ('grab') thi nguoi dung muon thay cac khoan khop,
  // con go dung ten danh muc ('an uong') thi muon thay tong.
  const restIsCategoryName = category !== undefined && normalize(category.name) === rest
  const isBareKeyword = rest.length > 0 && !hasAny(rest, QUESTION_MARKERS) && !restIsCategoryName

  if (hasAny(rest, LIST_MARKERS) || isBareKeyword) {
    // Tim theo ghi chu khi nguoi dung go mot tu khoa tu do
    const needle = rest.replace(/\b(liet ke|danh sach|tim|xem lai|nhung khoan|cac khoan|chi|thu)\b/g, '').trim()
    const searchable = spendable(scoped)
    const matched = needle
      ? searchable.filter((t) =>
          normalize(`${t.note ?? ''} ${ctx.categories.find((c) => c.id === t.categoryId)?.name ?? ''}`).includes(needle),
        )
      : spendable(filtered)
    if (needle && matched.length === 0) {
      return { kind: 'none', title: 'Không tìm thấy', message: `Không có giao dịch nào khớp "${original.trim()}" trong ${range.label}.` }
    }
    return {
      kind: 'list',
      title: needle ? `"${needle}" · ${range.label}` : `Giao dịch ${range.label}`,
      range,
      transactions: [...matched].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date))),
      total: matched.reduce((s, t) => s + (t.kind === 'expense' ? t.amount : -t.amount), 0),
    }
  }

  const totals = sumTotals(filtered)
  return {
    kind: 'total',
    title: category ? `${category.name} · ${range.label}` : range.label,
    range,
    totals,
    count: filtered.length,
    focus: category ? focus : 'both',
    category,
    estimated: filtered.filter((t) => t.estimated).length,
  }
}

function answerBalance(ctx: AskContext): Answer {
  const balances = walletBalances(ctx.wallets, ctx.transactions)
  const active = ctx.wallets.filter((w) => !w.archived)
  const rows = active.map((w) => ({ wallet: w, balance: balances.get(w.id) ?? 0 }))
  return {
    kind: 'balance',
    title: 'Số dư hiện tại',
    wallets: rows,
    total: rows.reduce((s, r) => s + r.balance, 0),
  }
}

function answerCoverage(ctx: AskContext): Answer {
  const c = computeCoverage(ctx.transactions, ctx.dayMarks, ctx.gapWindowDays, firstActivity(ctx.transactions, ctx.dayMarks))
  return { kind: 'coverage', title: 'Độ phủ dữ liệu', ratio: c.ratio, gaps: c.gaps, window: c.window }
}

function answerBudget(ctx: AskContext, range: TimeRange): Answer {
  const month = monthOf(range.start)
  const scoped = inRange(ctx.transactions, range.start, range.end)
  const spentBy = new Map<Id, number>()
  for (const s of byCategory(scoped, ctx.categories, 'expense')) spentBy.set(s.category.id, s.amount)

  const items = ctx.budgets
    .filter((b) => b.month === month)
    .map((b) => ({
      category: ctx.categories.find((c) => c.id === b.categoryId),
      limit: b.limit,
      spent: spentBy.get(b.categoryId) ?? 0,
    }))
    .filter((x): x is { category: Category; limit: number; spent: number } => Boolean(x.category))
    .sort((a, b) => b.spent / b.limit - a.spent / a.limit)

  if (items.length === 0) {
    return { kind: 'none', title: 'Chưa đặt ngân sách', message: `Chưa có hạn mức nào cho ${range.label}. Gõ "ngân sách" để đặt.` }
  }
  return { kind: 'budget', title: `Ngân sách ${range.label}`, range, month, items }
}

export function helpAnswer(): Answer {
  return { kind: 'help', title: 'Gõ được những gì', commands: COMMANDS }
}
