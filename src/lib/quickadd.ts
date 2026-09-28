import type { Category, Transaction, TxKind } from '../types'
import { parseAmount } from './format'
import { todayISO, toISO } from './date'

const COMBINING = /[̀-ͯ]/g

/**
 * Bo dau tieng Viet + ha chu thuong nhung GIU NGUYEN do dai chuoi,
 * de chi so tim duoc tren ban normalize van ap dung duoc cho chuoi goc.
 */
function foldKeepLength(text: string): string {
  return text.normalize('NFD').replace(COMBINING, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
}

/** Ban rut gon dung de so khop tu khoa (co gom khoang trang) */
export function normalize(text: string): string {
  return foldKeepLength(text).replace(/\s+/g, ' ').trim()
}

export interface QuickParse {
  kind: TxKind
  amount: number
  date: string
  note: string
  categoryId: number | null
  /** cach doan ra danh muc, de hien cho nguoi dung biet */
  reason: 'history' | 'keyword' | 'none'
}

const AMOUNT_RE = /(?:^|\s)([+-]?\d[\d.,]*)\s*(k|nghin|tr|trieu|m|ty|d|vnd)?(?=\s|$)/gi

const INCOME_HINTS = ['thu ', 'luong', 'nhan', 'duoc', 'thuong', 'hoan tien', 'lai', 'co tuc', 'li xi']

interface DateHit {
  /** ngay suy ra */
  date: string
  /** vi tri cum tu chi ngay tren chuoi da fold */
  span: [number, number]
}

function matchDate(folded: string): DateHit | null {
  const today = new Date()
  const shift = (days: number) => {
    const d = new Date(today)
    d.setDate(d.getDate() - days)
    return toISO(d)
  }

  const phrases: [RegExp, number][] = [
    [/hom kia/, 2],
    [/hom qua/, 1],
    [/hom nay/, 0],
  ]
  for (const [re, days] of phrases) {
    const m = folded.match(re)
    if (m && m.index !== undefined) return { date: shift(days), span: [m.index, m.index + m[0].length] }
  }

  const ago = folded.match(/(\d{1,2}) ngay truoc/)
  if (ago && ago.index !== undefined) {
    return { date: shift(Number(ago[1])), span: [ago.index, ago.index + ago[0].length] }
  }

  // '12/9' hoac '12/9/2026'
  const explicit = folded.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
  if (explicit && explicit.index !== undefined) {
    const day = Number(explicit[1])
    const month = Number(explicit[2])
    let year = explicit[3] ? Number(explicit[3]) : today.getFullYear()
    if (year < 100) year += 2000
    const d = new Date(year, month - 1, day)
    if (d.getMonth() === month - 1 && d.getDate() === day) {
      // khong ghi nam ma ngay roi vao tuong lai -> hieu la nam ngoai
      if (!explicit[3] && d > today) d.setFullYear(year - 1)
      return { date: toISO(d), span: [explicit.index, explicit.index + explicit[0].length] }
    }
  }
  return null
}

/**
 * Doc mot dong van ban thanh giao dich.
 * Vi du: 'ca phe 35k', '+15tr luong thang 9', 'xang 100k hom qua'
 * Tra ve null neu khong tim thay so tien hop le.
 */
export function parseQuickEntry(input: string, categories: Category[], history: Transaction[]): QuickParse | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const folded = foldKeepLength(trimmed)

  // 1) ngay — tim truoc de khong nham '12/9' thanh so tien
  const dateHit = matchDate(folded)
  const date = dateHit?.date ?? todayISO()
  const maskedForAmount = dateHit
    ? folded.slice(0, dateHit.span[0]) + ' '.repeat(dateHit.span[1] - dateHit.span[0]) + folded.slice(dateHit.span[1])
    : folded

  // 2) so tien — lay cum lon nhat, tranh nham voi '2 ly' hay 'thang 9'
  let amount = NaN
  let amountSpan: [number, number] | null = null
  let explicitSign: TxKind | null = null
  AMOUNT_RE.lastIndex = 0
  for (let m = AMOUNT_RE.exec(maskedForAmount); m; m = AMOUNT_RE.exec(maskedForAmount)) {
    const start = m.index + m[0].indexOf(m[1])
    const end = start + m[0].length - m[0].indexOf(m[1])
    const sign = m[1].startsWith('+') ? 'income' : m[1].startsWith('-') ? 'expense' : null
    const value = parseAmount(`${m[1].replace(/^[+-]/, '')}${m[2] ?? ''}`)
    if (!Number.isFinite(value) || value <= 0) continue
    if (!Number.isFinite(amount) || value > amount) {
      amount = value
      amountSpan = [start, end]
      explicitSign = sign
    }
  }
  if (!Number.isFinite(amount) || amount <= 0) return null

  // 3) phan chu con lai lam ghi chu
  const cuts = [amountSpan, dateHit?.span].filter(Boolean) as [number, number][]
  cuts.sort((a, b) => b[0] - a[0])
  let rest = trimmed
  for (const [start, end] of cuts) rest = rest.slice(0, start) + ' ' + rest.slice(end)
  const note = rest.replace(/\s+/g, ' ').trim()
  const foldedNote = normalize(note)

  // 4) loai giao dich
  let kind: TxKind = explicitSign ?? 'expense'
  if (!explicitSign && INCOME_HINTS.some((h) => ` ${foldedNote} `.includes(h))) kind = 'income'

  // 5) danh muc: uu tien thoi quen cua chinh nguoi dung, sau do toi tu khoa
  let categoryId: number | null = null
  let reason: QuickParse['reason'] = 'none'

  if (foldedNote) {
    const sameNote = history
      .filter((t) => t.kind === kind && t.note && normalize(t.note) === foldedNote)
      .sort((a, b) => b.createdAt - a.createdAt)[0]
    if (sameNote) {
      categoryId = sameNote.categoryId
      reason = 'history'
    }
  }

  if (categoryId === null && foldedNote) {
    let best: { id: number; len: number } | null = null
    const consider = (id: number, token: string) => {
      const k = normalize(token)
      if (k && foldedNote.includes(k) && (!best || k.length > best.len)) best = { id, len: k.length }
    }
    for (const c of categories) {
      if (c.kind !== kind || c.id === undefined) continue
      for (const kw of c.keywords ?? []) consider(c.id, kw)
      consider(c.id, c.name)
    }
    if (best) {
      categoryId = (best as { id: number; len: number }).id
      reason = 'keyword'
    }
  }

  return { kind, amount: Math.round(amount), date, note, categoryId, reason }
}
