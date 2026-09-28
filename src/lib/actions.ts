import { db } from '../db/db'
import type { Category, Transaction, TxKind, TxSource, Wallet } from '../types'
import { todayISO } from './date'
import { normalize } from './quickadd'

export interface NewTransaction {
  kind: TxKind
  amount: number
  categoryId: number
  walletId: number
  date?: string
  note?: string
  source?: TxSource
  estimated?: boolean
}

export async function addTransaction(input: NewTransaction): Promise<number> {
  return db.transactions.add({
    kind: input.kind,
    amount: Math.round(input.amount),
    categoryId: input.categoryId,
    walletId: input.walletId,
    date: input.date ?? todayISO(),
    note: input.note?.trim() || undefined,
    createdAt: Date.now(),
    source: input.source ?? 'manual',
    estimated: input.estimated || undefined,
  })
}

/** Danh muc he thong theo slug; rot ve danh muc cung loai dau tien neu thieu */
export function systemCategory(categories: Category[], slug: NonNullable<Category['slug']>): Category | undefined {
  const kind: TxKind = slug.endsWith('income') ? 'income' : 'expense'
  return categories.find((c) => c.slug === slug) ?? categories.find((c) => c.kind === kind)
}

/* ---------- Ngay khong chi tieu ---------- */

export async function markNoSpend(date: string): Promise<void> {
  const existing = await db.dayMarks.where('date').equals(date).first()
  if (!existing) await db.dayMarks.add({ date, markedAt: Date.now() })
}

export async function unmarkNoSpend(date: string): Promise<void> {
  const existing = await db.dayMarks.where('date').equals(date).first()
  if (existing?.id) await db.dayMarks.delete(existing.id)
}

/* ---------- Doi soat so du ---------- */

export interface ReconcileResult {
  difference: number
  /** null khi so du da khop, khong can tao giao dich bu */
  createdKind: TxKind | null
}

/**
 * So sanh so du app dang tinh voi so du thuc te nguoi dung dem duoc,
 * tao mot giao dich bu phan chenh lech vao danh muc 'chua ro'.
 * Nho co ma tong so luon dung du nguoi dung khong ghi het tung khoan.
 */
export async function reconcileWallet(
  wallet: Wallet,
  computedBalance: number,
  countedBalance: number,
  categories: Category[],
  date = todayISO(),
): Promise<ReconcileResult> {
  const difference = Math.round(countedBalance - computedBalance)
  if (difference === 0) {
    await db.wallets.update(wallet.id!, { lastReconciledAt: date })
    return { difference: 0, createdKind: null }
  }

  const kind: TxKind = difference < 0 ? 'expense' : 'income'
  const slug = kind === 'expense' ? 'reconcile-expense' : 'reconcile-income'
  const category = systemCategory(categories, slug)
  if (!category?.id) throw new Error('Thiếu danh mục hệ thống để ghi chênh lệch đối soát.')

  await db.transaction('rw', db.transactions, db.wallets, async () => {
    await db.transactions.add({
      kind,
      amount: Math.abs(difference),
      categoryId: category.id!,
      walletId: wallet.id!,
      date,
      note: kind === 'expense' ? 'Chênh lệch đối soát số dư' : 'Chênh lệch đối soát số dư (dư ra)',
      createdAt: Date.now(),
      source: 'reconcile',
      estimated: true,
    })
    await db.wallets.update(wallet.id!, { lastReconciledAt: date })
  })

  return { difference, createdKind: kind }
}

/* ---------- Phim tat tu hoc ---------- */

export interface Shortcut {
  key: string
  label: string
  kind: TxKind
  amount: number
  categoryId: number
  note?: string
  uses: number
}

/**
 * Suy ra cac khoan hay lap lai tu lich su de lam phim tat 1 cham.
 * Gom theo (danh muc + ghi chu + so tien), chi xet `windowDays` gan nhat.
 */
export function suggestShortcuts(transactions: Transaction[], categories: Category[], limit = 6, windowDays = 90): Shortcut[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - windowDays)
  const cutoffISO = cutoff.toISOString().slice(0, 10)
  const catById = new Map(categories.map((c) => [c.id!, c]))

  const groups = new Map<string, Shortcut & { lastUsed: string }>()
  for (const t of transactions) {
    if (t.date < cutoffISO) continue
    if (t.source === 'reconcile') continue
    const note = t.note?.trim() ?? ''
    const key = `${t.kind}|${t.categoryId}|${normalize(note)}|${t.amount}`
    const existing = groups.get(key)
    if (existing) {
      existing.uses++
      if (t.date > existing.lastUsed) existing.lastUsed = t.date
      continue
    }
    const cat = catById.get(t.categoryId)
    groups.set(key, {
      key,
      label: note || cat?.name || 'Khoản chi',
      kind: t.kind,
      amount: t.amount,
      categoryId: t.categoryId,
      note: note || undefined,
      uses: 1,
      lastUsed: t.date,
    })
  }

  return [...groups.values()]
    .filter((g) => g.uses >= 2)
    .sort((a, b) => (b.uses === a.uses ? b.lastUsed.localeCompare(a.lastUsed) : b.uses - a.uses))
    .slice(0, limit)
    .map(({ lastUsed: _lastUsed, ...rest }) => rest)
}
