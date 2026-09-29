/**
 * Sáu hũ — chia thu nhập theo tỷ lệ thay vì đặt hạn mức tuyệt đối từng tháng.
 *
 * VÌ SAO ĐÁNG LÀM, theo đúng bộ lọc quyết định của app: hạn mức tuyệt đối phải
 * chỉnh tay mỗi khi thu nhập đổi, và người lười thì không chỉnh — hạn mức cũ
 * nằm đó, con số so sánh vô nghĩa dần, rồi người dùng thôi nhìn vào ngân sách.
 * Tỷ lệ thì tự đúng ở tháng nhiều lẫn tháng ít.
 *
 * BỐN QUYẾT ĐỊNH:
 *
 * 1. Hũ là LỚP TRÊN của danh mục, không thay thế danh mục.
 *    Mỗi danh mục thuộc nhiều nhất một hũ. Ngân sách theo danh mục vẫn chạy
 *    song song cho ai muốn chi tiết hơn.
 *
 * 2. Mọi hũ đều là một khoản ĐƯỢC PHÉP TIÊU, kể cả hũ tiết kiệm.
 *    Phương pháp gốc bảo chuyển tiền thật sang từng hũ. Làm vậy đòi người dùng
 *    thao tác thêm mỗi tháng — đúng thứ app này sinh ra để cắt. Ở đây hũ tiết
 *    kiệm là khoản KHÔNG được tiêu, và "còn nguyên" nghĩa là đã giữ lại được.
 *    Không đòi nhập gì thêm, và con số vẫn đúng.
 *
 * 3. Vượt hũ thì CẢNH BÁO, không chặn.
 *    App không phán xét người dùng. Chặn một khoản chi có thật chỉ khiến người
 *    ta ngừng ghi, và dữ liệu thủng thì mọi con số khác cũng hỏng theo.
 *
 * 4. Không bao giờ hiện hạn mức bằng 0 chỉ vì lương chưa về.
 *    Xem `incomeBase`.
 */
import { monthRange, shiftMonth } from './date'
import { inRange, isTransfer } from './stats'
import type { Category, Settings, Transaction } from '../types'

export type JarSlug = 'essentials' | 'education' | 'play' | 'longterm' | 'freedom' | 'give'

export interface Jar {
  slug: JarSlug
  name: string
  icon: string
  /** phần trăm thu nhập */
  percent: number
  hint: string
  /** hũ để dành: tiêu vào đây là đi ngược mục đích của nó */
  saving?: boolean
}

/** Tỷ lệ gốc của phương pháp JARS; người dùng sửa được từng hũ */
export const JARS: Jar[] = [
  { slug: 'essentials', name: 'Thiết yếu', icon: '🏠', percent: 55, hint: 'ăn ở, đi lại, hoá đơn, thuốc men' },
  { slug: 'education', name: 'Giáo dục', icon: '📚', percent: 10, hint: 'học phí, sách, khoá học' },
  { slug: 'play', name: 'Hưởng thụ', icon: '🎮', percent: 10, hint: 'giải trí, mua sắm cho vui' },
  { slug: 'longterm', name: 'Tiết kiệm dài hạn', icon: '🏦', percent: 10, hint: 'mục tiêu lớn: nhà, xe, dự phòng', saving: true },
  { slug: 'freedom', name: 'Tự do tài chính', icon: '📈', percent: 10, hint: 'đầu tư — hũ này không bao giờ tiêu', saving: true },
  { slug: 'give', name: 'Cho đi', icon: '🎁', percent: 5, hint: 'biếu tặng, từ thiện', saving: true },
]

export const JAR_BY_SLUG = new Map(JARS.map((j) => [j.slug, j]))

/** Tỷ lệ đang dùng: người dùng sửa thì lấy của họ, không thì lấy tỷ lệ gốc */
export function jarPercents(settings: Pick<Settings, 'jarPercents'>): Record<JarSlug, number> {
  const out = {} as Record<JarSlug, number>
  for (const j of JARS) {
    const v = settings.jarPercents?.[j.slug]
    out[j.slug] = typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : j.percent
  }
  return out
}

export interface IncomeBase {
  amount: number
  /**
   * true nghĩa là con số này SUY RA từ các kỳ trước, không phải thu nhập thật
   * của kỳ này. Màn hình phải nói ra điều đó.
   */
  estimated: boolean
  /** số kỳ đã dùng để suy ra; 0 khi dùng thu nhập thật của kỳ này */
  from: number
}

/**
 * Nền để tính hạn mức từng hũ.
 *
 * Lấy thu nhập ĐÃ NHẬN trong kỳ này. Nhưng nửa đầu tháng, trước khi lương về,
 * con số đó bằng 0 — và mọi hũ sẽ hiện hạn mức 0₫, tức tính năng vô dụng đúng
 * lúc nó cần nhất. Nên khi kỳ này chưa có thu nhập, dùng TRUNG VỊ của tối đa
 * ba kỳ gần nhất có thu nhập, và đánh dấu là số ước tính.
 *
 * Trung vị chứ không phải trung bình: một tháng có thưởng Tết sẽ kéo trung bình
 * lên và làm hạn mức mọi hũ phồng theo suốt mấy tháng sau.
 */
export function incomeBase(
  transactions: Transaction[],
  month: string,
  startDayOfMonth: number,
): IncomeBase {
  const sumIncome = (m: string) => {
    const r = monthRange(m, startDayOfMonth)
    return inRange(transactions, r.start, r.end)
      .filter((t) => t.kind === 'income' && !isTransfer(t))
      .reduce((s, t) => s + t.amount, 0)
  }

  const thisPeriod = sumIncome(month)
  if (thisPeriod > 0) return { amount: thisPeriod, estimated: false, from: 0 }

  const past = [1, 2, 3].map((i) => sumIncome(shiftMonth(month, -i))).filter((v) => v > 0)
  if (past.length === 0) return { amount: 0, estimated: false, from: 0 }

  past.sort((a, b) => a - b)
  return { amount: past[Math.floor(past.length / 2)], estimated: true, from: past.length }
}

export interface JarState extends Jar {
  /** hạn mức = nền thu nhập × tỷ lệ */
  limit: number
  spent: number
  remaining: number
  /** tỷ lệ đã dùng, 0–1; bằng 0 khi chưa có hạn mức */
  ratio: number
  /** danh mục thuộc hũ này */
  categories: Category[]
}

/** Trạng thái sáu hũ trong một kỳ */
export function jarStates(
  periodTx: Transaction[],
  categories: Category[],
  settings: Pick<Settings, 'jarPercents'>,
  base: number,
): JarState[] {
  const percents = jarPercents(settings)

  const spentByCategory = new Map<string, number>()
  for (const t of periodTx) {
    if (t.kind !== 'expense' || isTransfer(t)) continue
    spentByCategory.set(t.categoryId, (spentByCategory.get(t.categoryId) ?? 0) + t.amount)
  }

  return JARS.map((jar) => {
    const mine = categories.filter((c) => c.jar === jar.slug)
    const spent = mine.reduce((s, c) => s + (spentByCategory.get(c.id) ?? 0), 0)
    const limit = Math.round((base * percents[jar.slug]) / 100)
    return {
      ...jar,
      percent: percents[jar.slug],
      limit,
      spent,
      remaining: limit - spent,
      ratio: limit > 0 ? spent / limit : 0,
      categories: mine,
    }
  })
}

/**
 * Tổng tỷ lệ sáu hũ.
 *
 * Không ép phải bằng 100: người dùng có thể cố ý để 90 và giữ 10 ngoài hệ
 * thống. Màn hình chỉ nói ra con số để họ biết mình đang ở đâu.
 */
export function totalPercent(settings: Pick<Settings, 'jarPercents'>): number {
  const p = jarPercents(settings)
  return JARS.reduce((s, j) => s + p[j.slug], 0)
}

/** Danh mục chi chưa được xếp vào hũ nào — cần người dùng quyết */
export function unassigned(categories: Category[]): Category[] {
  return categories.filter((c) => c.kind === 'expense' && !c.jar && !c.slug)
}
