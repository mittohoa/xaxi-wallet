/**
 * Hoc tu chinh du lieu cua nguoi dung — chay hoan toan tren may, khong mang,
 * khong mo hinh tai san, khong mot byte nao roi khoi thiet bi.
 *
 * Hai viec, ca hai deu nham dung mot dich: GIAM CONG NHAP LIEU.
 *
 *   1. Phan loai thong minh  — doan danh muc tu ghi chu, hoc tu thoi quen cua
 *      chinh nguoi dung thay vi tu khoa cung.
 *   2. Phat hien khoan dinh ky — tim nhung khoan lap lai deu dan de de xuat
 *      tu dong hoa, giam cong nhap VINH VIEN chu khong phai mot lan.
 */
import type { Category, Recurring, Transaction, TxKind } from '../types'
import { normalize } from './quickadd'
import { toISO } from './date'

/* ================= 1. Phan loai thong minh ================= */

/** Tach ghi chu thanh cac tu co y nghia; bo tu qua ngan va tu chi so luong */
function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t))
}

export interface Prediction {
  categoryId: number
  /** 0..1 — cao khi bang chung manh va tach bach so voi lua chon thu hai */
  confidence: number
}

export interface Classifier {
  predict(note: string, kind: TxKind): Prediction | null
  /** so giao dich da hoc, de hien cho nguoi dung biet may dua vao dau */
  trainedOn: number
}

const SMOOTHING = 0.4
const MIN_SAMPLES = 8

/**
 * Bo phan loai Naive Bayes da thuc, hoc tren ghi chu cua nguoi dung.
 *
 * Chon Naive Bayes vi no hop voi rang buoc cua app: hoc duoc tu vai chuc mau,
 * huan luyen tuc thi, khong can thu vien, va giai thich duoc tai sao lai doan
 * nhu vay — quan trong khi tien bac cua nguoi ta phu thuoc vao no.
 */
export function trainClassifier(transactions: Transaction[], categories: Category[]): Classifier {
  const known = new Set(categories.map((c) => c.id))
  // Danh muc 'chua phan loai' khong phai mot lua chon dung — khong hoc tu chung
  const generic = new Set(categories.filter((c) => c.slug).map((c) => c.id))

  const docCount = new Map<number, number>()
  const tokenCount = new Map<number, Map<string, number>>()
  const totalTokens = new Map<number, number>()
  const vocabulary = new Set<string>()
  let trained = 0

  for (const t of transactions) {
    if (!t.note || !known.has(t.categoryId) || generic.has(t.categoryId)) continue
    const tokens = tokenize(t.note)
    if (tokens.length === 0) continue

    trained++
    docCount.set(t.categoryId, (docCount.get(t.categoryId) ?? 0) + 1)
    let bucket = tokenCount.get(t.categoryId)
    if (!bucket) {
      bucket = new Map()
      tokenCount.set(t.categoryId, bucket)
    }
    for (const token of tokens) {
      bucket.set(token, (bucket.get(token) ?? 0) + 1)
      vocabulary.add(token)
      totalTokens.set(t.categoryId, (totalTokens.get(t.categoryId) ?? 0) + 1)
    }
  }

  const kindOf = new Map(categories.map((c) => [c.id!, c.kind]))
  const vocabSize = Math.max(vocabulary.size, 1)

  return {
    trainedOn: trained,
    predict(note: string, kind: TxKind): Prediction | null {
      if (trained < MIN_SAMPLES) return null
      const tokens = tokenize(note)
      if (tokens.length === 0) return null
      // Khong co tu nao tung gap thi doan cung chi la doan mo
      if (!tokens.some((t) => vocabulary.has(t))) return null

      const scores: { id: number; score: number; evidence: number }[] = []
      for (const [categoryId, docs] of docCount) {
        if (kindOf.get(categoryId) !== kind) continue
        const bucket = tokenCount.get(categoryId)!
        const total = totalTokens.get(categoryId) ?? 0
        let score = Math.log(docs / trained)
        let evidence = 0
        for (const token of tokens) {
          const seen = bucket.get(token) ?? 0
          if (seen > 0) evidence++
          score += Math.log((seen + SMOOTHING) / (total + SMOOTHING * vocabSize))
        }
        scores.push({ id: categoryId, score, evidence })
      }
      if (scores.length === 0) return null

      scores.sort((a, b) => b.score - a.score)
      const best = scores[0]
      const runnerUp = scores[1]

      // Khong co tu nao tung xuat hien trong danh muc thang cuoc thi day chi la
      // ket qua cua viec khong con lua chon nao khac — im lang con hon doan bua.
      if (best.evidence === 0) return null

      // Do tach bach giua lua chon nhat va nhi, nhan voi ty le tu duoc nhan ra
      const margin = runnerUp ? best.score - runnerUp.score : 3
      const separation = Math.min(1, Math.max(0, margin / 3))
      const coverage = best.evidence / tokens.length
      return { categoryId: best.id, confidence: separation * coverage }
    },
  }
}

/* ================= 2. Phat hien khoan dinh ky ================= */

export interface RecurringSuggestion {
  key: string
  name: string
  kind: TxKind
  /** so tien dai dien — lay trung vi de mot lan bat thuong khong keo lech */
  amount: number
  categoryId: number
  walletId: number
  freq: 'monthly' | 'weekly'
  anchor: number
  occurrences: number
  lastDate: string
  /** ngay du doan cho lan ke tiep */
  nextDate: string
  confidence: number
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000)
}

const MIN_OCCURRENCES = 3

/**
 * Tim nhung khoan lap lai deu dan de de xuat bien thanh giao dich tu dong.
 *
 * Yeu cau kha nghiem ngat — sai mot de xuat la tu dong ghi nham tien cua nguoi
 * ta — nen phai: it nhat 3 lan, khoang cach deu, va so tien on dinh.
 */
export function detectRecurring(
  transactions: Transaction[],
  existingRules: Recurring[],
  categories: Category[],
): RecurringSuggestion[] {
  const catById = new Map(categories.map((c) => [c.id!, c]))
  const groups = new Map<string, Transaction[]>()

  for (const t of transactions) {
    // Bo qua cac ban ghi do chinh may sinh ra, tranh de xuat vong lap
    if (t.source === 'recurring' || t.source === 'reconcile') continue
    const note = normalize(t.note ?? '')
    if (!note) continue
    const key = `${t.kind}|${t.categoryId}|${note}`
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  }

  const existingKeys = new Set(existingRules.map((r) => `${r.kind}|${r.categoryId}|${normalize(r.note ?? r.name)}`))
  const suggestions: RecurringSuggestion[] = []

  for (const [key, items] of groups) {
    if (items.length < MIN_OCCURRENCES) continue
    if (existingKeys.has(key)) continue

    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date))
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date))
    if (gaps.length === 0) continue

    const gap = median(gaps)
    const freq: 'monthly' | 'weekly' | null = gap >= 26 && gap <= 32 ? 'monthly' : gap >= 6 && gap <= 8 ? 'weekly' : null
    if (!freq) continue

    // Khoang cach phai deu: khong lan nao lech qua 25% so voi trung vi
    const regular = gaps.every((g) => Math.abs(g - gap) <= Math.max(2, gap * 0.25))
    if (!regular) continue

    // So tien phai on dinh: khong lan nao lech qua 20% so voi trung vi
    const amounts = sorted.map((t) => t.amount)
    const amount = median(amounts)
    const steady = amounts.every((a) => Math.abs(a - amount) <= amount * 0.2)
    if (!steady) continue

    const last = sorted[sorted.length - 1]
    const lastDate = new Date(`${last.date}T00:00:00`)
    const next = new Date(lastDate)
    if (freq === 'monthly') next.setMonth(next.getMonth() + 1)
    else next.setDate(next.getDate() + 7)

    const anchor = freq === 'monthly' ? lastDate.getDate() : lastDate.getDay()

    // Cang nhieu lan lap va cang deu thi cang chac
    const spread = gaps.reduce((s, g) => s + Math.abs(g - gap), 0) / gaps.length
    const confidence = Math.min(1, (sorted.length / 6) * (1 - Math.min(spread / gap, 1)))

    suggestions.push({
      key,
      name: last.note ?? catById.get(last.categoryId)?.name ?? 'Khoản định kỳ',
      kind: last.kind,
      amount,
      categoryId: last.categoryId,
      walletId: last.walletId,
      freq,
      anchor,
      occurrences: sorted.length,
      lastDate: last.date,
      nextDate: toISO(next),
      confidence,
    })
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence || b.amount - a.amount)
}
