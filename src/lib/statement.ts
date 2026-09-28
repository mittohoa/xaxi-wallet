/**
 * Doc file sao ke (CSV) xuat tu app ngan hang.
 * Khong ket noi toi ngan hang, khong luu thong tin dang nhap —
 * nguoi dung tu tai file ve va chon tu may cua minh.
 */
import type { Transaction, TxKind } from '../types'
import { toISO } from './date'
import { normalize } from './quickadd'

export interface StatementRow {
  date: string
  amount: number
  kind: TxKind
  note: string
  /** trung voi mot giao dich da co trong app */
  duplicate: boolean
  /** nguoi dung chon co nhap dong nay hay khong */
  selected: boolean
}

export interface StatementParse {
  rows: StatementRow[]
  /** ten cot da nhan dien duoc, de hien cho nguoi dung doi chieu */
  mapping: { date: string; amount: string; note: string }
  skipped: number
}

/* ---------- CSV ---------- */

function sniffDelimiter(sample: string): string {
  const line = sample.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
  const counts: [string, number][] = [
    [';', (line.match(/;/g) ?? []).length],
    ['\t', (line.match(/\t/g) ?? []).length],
    [',', (line.match(/,/g) ?? []).length],
  ]
  counts.sort((a, b) => b[1] - a[1])
  return counts[0][1] > 0 ? counts[0][0] : ','
}

export function parseCSV(text: string, delimiter = sniffDelimiter(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (ch !== '\r') cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/* ---------- nhan dien cot ---------- */

const DATE_KEYS = ['ngay', 'ngay gd', 'ngay giao dich', 'date', 'transaction date', 'posting date', 'thoi gian']
const AMOUNT_KEYS = ['so tien', 'amount', 'gia tri', 'value', 'so tien gd']
const DEBIT_KEYS = ['ghi no', 'debit', 'chi', 'tien ra', 'withdrawal', 'rut']
const CREDIT_KEYS = ['ghi co', 'credit', 'thu', 'tien vao', 'deposit', 'nop']
const NOTE_KEYS = ['noi dung', 'mo ta', 'description', 'detail', 'dien giai', 'remark', 'memo', 'ghi chu']

function findColumn(header: string[], keys: string[]): number {
  const folded = header.map((h) => normalize(h))
  for (const key of keys) {
    const exact = folded.findIndex((h) => h === key)
    if (exact >= 0) return exact
  }
  for (const key of keys) {
    const partial = folded.findIndex((h) => h.includes(key))
    if (partial >= 0) return partial
  }
  return -1
}

function parseMoneyCell(cell: string): number {
  const cleaned = cell.replace(/[^\d,.\-+]/g, '').trim()
  if (!cleaned) return NaN
  const negative = /^-/.test(cleaned) || /\(/.test(cell)
  // Bo dau phan cach nghin; khong xu ly phan le vi sao ke VND hiem khi co
  const digits = cleaned.replace(/[^\d]/g, '')
  if (!digits) return NaN
  const value = Number(digits)
  return negative ? -value : value
}

function parseDateCell(cell: string): string | null {
  const s = cell.trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (dmy) {
    let year = Number(dmy[3])
    if (year < 100) year += 2000
    const d = new Date(year, Number(dmy[2]) - 1, Number(dmy[1]))
    if (d.getDate() !== Number(dmy[1])) return null
    return toISO(d)
  }
  return null
}

export function dedupeKey(kind: TxKind, date: string, amount: number, note: string | undefined): string {
  return `${kind}|${date}|${Math.round(amount)}|${normalize(note ?? '')}`
}

/**
 * Chuyen noi dung CSV thanh danh sach dong co the nhap.
 * `existing` dung de danh dau cac dong da co trong app.
 */
export function parseStatement(text: string, existing: Transaction[]): StatementParse | null {
  const table = parseCSV(text)
  if (table.length < 2) return null

  // Dong tieu de la dong dau tien nhan dien duoc cot ngay
  let headerIndex = -1
  let header: string[] = []
  for (let i = 0; i < Math.min(table.length, 12); i++) {
    if (findColumn(table[i], DATE_KEYS) >= 0) {
      headerIndex = i
      header = table[i]
      break
    }
  }
  if (headerIndex < 0) return null

  const dateCol = findColumn(header, DATE_KEYS)
  const amountCol = findColumn(header, AMOUNT_KEYS)
  const debitCol = findColumn(header, DEBIT_KEYS)
  const creditCol = findColumn(header, CREDIT_KEYS)
  const noteCol = findColumn(header, NOTE_KEYS)
  if (amountCol < 0 && debitCol < 0 && creditCol < 0) return null

  const seen = new Set(existing.map((t) => dedupeKey(t.kind, t.date, t.amount, t.note)))
  const rows: StatementRow[] = []
  let skipped = 0

  for (let i = headerIndex + 1; i < table.length; i++) {
    const cells = table[i]
    const date = parseDateCell(cells[dateCol] ?? '')
    if (!date) {
      skipped++
      continue
    }

    let amount = NaN
    let kind: TxKind = 'expense'
    if (debitCol >= 0 || creditCol >= 0) {
      const debit = debitCol >= 0 ? parseMoneyCell(cells[debitCol] ?? '') : NaN
      const credit = creditCol >= 0 ? parseMoneyCell(cells[creditCol] ?? '') : NaN
      if (Number.isFinite(debit) && Math.abs(debit) > 0) {
        amount = Math.abs(debit)
        kind = 'expense'
      } else if (Number.isFinite(credit) && Math.abs(credit) > 0) {
        amount = Math.abs(credit)
        kind = 'income'
      }
    }
    if (!Number.isFinite(amount) && amountCol >= 0) {
      const signed = parseMoneyCell(cells[amountCol] ?? '')
      if (Number.isFinite(signed) && signed !== 0) {
        amount = Math.abs(signed)
        kind = signed < 0 ? 'expense' : 'income'
      }
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      skipped++
      continue
    }

    const note = (noteCol >= 0 ? (cells[noteCol] ?? '') : '').replace(/\s+/g, ' ').trim().slice(0, 140)
    const duplicate = seen.has(dedupeKey(kind, date, amount, note))
    rows.push({ date, amount, kind, note, duplicate, selected: !duplicate })
  }

  if (rows.length === 0) return null

  return {
    rows: rows.sort((a, b) => b.date.localeCompare(a.date)),
    mapping: {
      date: header[dateCol] ?? '?',
      amount: amountCol >= 0 ? (header[amountCol] ?? '?') : `${header[debitCol] ?? '?'} / ${header[creditCol] ?? '?'}`,
      note: noteCol >= 0 ? (header[noteCol] ?? '') : '(không có)',
    },
    skipped,
  }
}
