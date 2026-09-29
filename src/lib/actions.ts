import { db, live, newId, softDelete, stamp, touch } from '../db/db'
import type { Category, CategorySlug, Id, Transaction, TxKind, TxSource, Wallet } from '../types'
import { todayISO } from './date'
import { normalize } from './quickadd'

export interface NewTransaction {
  kind: TxKind
  amount: number
  categoryId: Id
  walletId: Id
  date?: string
  note?: string
  source?: TxSource
  estimated?: boolean
}

export async function addTransaction(input: NewTransaction): Promise<Id> {
  return db.transactions.add(
    stamp({
    kind: input.kind,
    amount: Math.round(input.amount),
    categoryId: input.categoryId,
    walletId: input.walletId,
    date: input.date ?? todayISO(),
    note: input.note?.trim() || undefined,
    createdAt: Date.now(),
      source: input.source ?? 'manual',
      estimated: input.estimated || undefined,
    }),
  )
}

/** Danh muc he thong theo slug; rot ve danh muc cung loai dau tien neu thieu */
export function systemCategory(categories: Category[], slug: CategorySlug): Category | undefined {
  const kind: TxKind = slug.endsWith('income') ? 'income' : 'expense'
  return categories.find((c) => c.slug === slug) ?? categories.find((c) => c.kind === kind)
}

/* ---------- Ngay khong chi tieu ---------- */

export async function markNoSpend(date: string): Promise<void> {
  const existing = await db.dayMarks.where('date').equals(date).first()
  // Bỏ đánh dấu rồi đánh dấu lại: bản ghi cũ vẫn nằm đó dưới dạng bia mộ, và
  // cột `date` là duy nhất nên không thêm bản mới được — phải dựng lại bản cũ
  if (existing) {
    if (existing.deletedAt) await db.dayMarks.update(existing.id, { ...touch(), deletedAt: undefined, markedAt: Date.now() })
    return
  }
  await db.dayMarks.add(stamp({ date, markedAt: Date.now() }))
}

export async function unmarkNoSpend(date: string): Promise<void> {
  const existing = await db.dayMarks.where('date').equals(date).first()
  if (existing && !existing.deletedAt) await softDelete('dayMarks', existing.id)
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
    await db.wallets.update(wallet.id, { ...touch(), lastReconciledAt: date })
    return { difference: 0, createdKind: null }
  }

  const kind: TxKind = difference < 0 ? 'expense' : 'income'
  const slug = kind === 'expense' ? 'reconcile-expense' : 'reconcile-income'
  const category = systemCategory(categories, slug)
  if (!category) throw new Error('Thiếu danh mục hệ thống để ghi chênh lệch đối soát.')

  await db.transaction('rw', db.transactions, db.wallets, async () => {
    await db.transactions.add(
      stamp({
        kind,
        amount: Math.abs(difference),
        categoryId: category.id,
        walletId: wallet.id,
        date,
        note: kind === 'expense' ? 'Chênh lệch đối soát số dư' : 'Chênh lệch đối soát số dư (dư ra)',
        createdAt: Date.now(),
        source: 'reconcile' as const,
        estimated: true,
      }),
    )
    await db.wallets.update(wallet.id, { ...touch(), lastReconciledAt: date })
  })

  return { difference, createdKind: kind }
}

/* ---------- Phim tat tu hoc ---------- */

export interface Shortcut {
  key: string
  label: string
  kind: TxKind
  amount: number
  categoryId: Id
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
  const catById = new Map(categories.map((c) => [c.id, c]))

  const groups = new Map<string, Shortcut & { lastUsed: string }>()
  for (const t of transactions) {
    if (t.date < cutoffISO) continue
    if (t.source === 'reconcile' || t.transferId) continue
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

/* ---------- Chuyen tien giua hai vi ---------- */

export interface TransferInput {
  fromWalletId: Id
  toWalletId: Id
  amount: number
  date?: string
  note?: string
}

/**
 * Ghi mot lan chuyen tien thanh CAP ban ghi lien ket.
 *
 * Vi sao khong ghi mot ban ghi duy nhat: so du tung vi duoc suy ra bang cach
 * duyet giao dich va cong tru theo `walletId`. Mot ban ghi thi khong the vua
 * tru vi nguon vua cong vi dich. Cap ban ghi giu cho phep tinh so du khong
 * phai doi gi, con `transferId` la thu bao cho moi phep tinh thu/chi biet ma
 * loai chung ra.
 */
export async function transferBetweenWallets(
  input: TransferInput,
  categories: Category[],
): Promise<Id> {
  if (input.fromWalletId === input.toWalletId) {
    throw new Error('Ví nguồn và ví đích phải khác nhau.')
  }
  const amount = Math.round(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Số tiền chuyển phải lớn hơn 0.')
  }

  const out = systemCategory(categories, 'transfer-out')
  const into = systemCategory(categories, 'transfer-in')
  if (!out || !into) throw new Error('Thiếu danh mục hệ thống cho chuyển tiền.')

  const transferId = newId()
  const date = input.date ?? todayISO()
  const note = input.note?.trim() || undefined
  const createdAt = Date.now()

  await db.transactions.bulkAdd([
    stamp({
      kind: 'expense' as const,
      amount,
      categoryId: out.id,
      walletId: input.fromWalletId,
      date,
      note,
      createdAt,
      source: 'transfer' as const,
      transferId,
    }),
    stamp({
      kind: 'income' as const,
      amount,
      categoryId: into.id,
      walletId: input.toWalletId,
      date,
      note,
      createdAt: createdAt + 1,
      source: 'transfer' as const,
      transferId,
    }),
  ])

  return transferId
}

/** Xoa ca hai ve cua mot lan chuyen tien — xoa mot ve thi so du sai hai vi */
export async function deleteTransfer(transferId: Id): Promise<number> {
  const legs = live(await db.transactions.where('transferId').equals(transferId).toArray())
  await softDelete('transactions', legs.map((t) => t.id))
  return legs.length
}

/**
 * Danh mục người dùng được phép chọn tay.
 *
 * Bỏ hai nhóm danh mục hệ thống, vì cùng một lý do: chọn nhầm vào chúng thì
 * con số của người dùng sai mà không có gì báo.
 *
 * - `transfer-*`: chuyển tiền giữa hai ví bị loại khỏi MỌI phép tính thu/chi.
 *   Một khoản chi thật bị gán vào đây sẽ biến mất khỏi tổng chi tháng đó.
 * - `reconcile-*`: đây là phần chênh lệch do đối soát số dư sinh ra, luôn kèm
 *   cờ "ước tính". Người dùng gán tay vào đây là nói dối chính báo cáo của mình.
 *
 * `uncategorized-*` thì GIỮ: "Chi khác" là chỗ rót về hợp lệ khi chưa biết xếp
 * vào đâu, và nó vẫn được tính vào tổng chi bình thường.
 */
export function selectableCategories(categories: Category[], kind: TxKind): Category[] {
  const cam: CategorySlug[] = ['transfer-out', 'transfer-in', 'reconcile-expense', 'reconcile-income']
  return categories.filter((c) => c.kind === kind && !(c.slug && cam.includes(c.slug)))
}

/**
 * Ghi lại một khoản đã có, mang ngày hôm nay.
 *
 * "Hôm nay lại đúng như hôm qua" là trường hợp rất hay gặp — cà phê sáng, gửi
 * xe, ăn trưa cùng quán. Gõ lại từ đầu mỗi ngày chính là loại công sức mà cả
 * app này sinh ra để cắt.
 *
 * KHÔNG chép `transferId`, `recurringId` và cờ `estimated`. Chép một VẾ của
 * lần chuyển tiền sẽ tạo ra nửa cặp liên kết: số dư hai ví lệch nhau ngay, và
 * mọi phép tính thu/chi vẫn loại nó ra nên không con số nào lộ ra sai. Đây là
 * kiểu hỏng im lặng tệ nhất, nên chặn thẳng ở đây.
 */
export async function duplicateTransaction(source: Transaction): Promise<Id> {
  if (source.transferId !== undefined) {
    throw new Error('Không nhân bản được một vế của lần chuyển tiền.')
  }
  return addTransaction({
    kind: source.kind,
    amount: source.amount,
    categoryId: source.categoryId,
    walletId: source.walletId,
    date: todayISO(),
    note: source.note,
    source: 'quick',
  })
}
