/**
 * Chuyển dữ liệu từ CSDL bản đầu (khoá số tự tăng) sang bản mới (khoá UUID).
 *
 * IndexedDB không cho đổi khoá chính của một kho đã tồn tại, nên phải đọc hết
 * sang một CSDL mới. Việc này chạy đúng một lần, ngay trước khi app mở dữ liệu.
 *
 * Nguyên tắc an toàn: **không xoá bản cũ cho tới khi bản mới đã ghi xong**.
 * Mất điện giữa chừng thì lần mở sau chạy lại từ đầu, không mất gì.
 */
import Dexie from 'dexie'
import { LEGACY_DB_NAME, db, deviceId, newId } from './db'
import type { Budget, Category, DayMark, Id, Recurring, Settings, Template, Transaction, Wallet } from '../types'

/** Bản ghi cũ: khoá là số, chưa có ba trường đồng bộ */
interface LegacyRow {
  id?: number
  [key: string]: unknown
}

export interface MigrationResult {
  ran: boolean
  moved: Record<string, number>
}

async function legacyExists(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false
  // Dexie.exists() mo roi dong lai, khong tao moi
  return Dexie.exists(LEGACY_DB_NAME)
}

/** Đọc một bảng của CSDL cũ; bảng không tồn tại thì coi như rỗng */
function readTable(legacy: Dexie, name: string): Promise<LegacyRow[]> {
  try {
    return legacy.table(name).toArray()
  } catch {
    return Promise.resolve([])
  }
}

export async function migrateLegacyDatabase(): Promise<MigrationResult> {
  const moved: Record<string, number> = {}
  if (!(await legacyExists())) return { ran: false, moved }

  // Da co du lieu o ban moi thi khong dam vao nua
  if ((await db.categories.count()) > 0 || (await db.transactions.count()) > 0) {
    return { ran: false, moved }
  }

  const legacy = new Dexie(LEGACY_DB_NAME)
  legacy.version(1).stores({
    categories: '++id, name, kind, slug',
    wallets: '++id, name, kind, archived',
    transactions: '++id, date, kind, categoryId, walletId, createdAt, recurringId',
    budgets: '++id, month, categoryId, [month+categoryId]',
    dayMarks: '++id, &date',
    templates: '++id, kind, uses, pinned',
    recurring: '++id, nextDate, active',
    settings: '++id',
  })
  await legacy.open()

  const [categories, wallets, transactions, budgets, dayMarks, templates, recurring, settings] = await Promise.all([
    readTable(legacy, 'categories'),
    readTable(legacy, 'wallets'),
    readTable(legacy, 'transactions'),
    readTable(legacy, 'budgets'),
    readTable(legacy, 'dayMarks'),
    readTable(legacy, 'templates'),
    readTable(legacy, 'recurring'),
    readTable(legacy, 'settings'),
  ])

  const device = deviceId()
  const now = Date.now()

  /** Bản đồ id cũ (số) sang id mới (UUID), một bản đồ cho mỗi bảng */
  const map = (rows: LegacyRow[]) => {
    const table = new Map<number, Id>()
    for (const row of rows) if (typeof row.id === 'number') table.set(row.id, newId())
    return table
  }

  const catIds = map(categories)
  const walletIds = map(wallets)
  const recurringIds = map(recurring)

  /** Giữ nguyên mọi trường cũ, thay id và gắn ba trường đồng bộ */
  const convert = <T>(row: LegacyRow, id: Id, patch: Partial<T> = {}): T => {
    const { id: _old, ...rest } = row
    return { ...rest, ...patch, id, updatedAt: now, deviceId: device } as T
  }

  const newCategories = categories
    .filter((r) => typeof r.id === 'number')
    .map((r) => convert<Category>(r, catIds.get(r.id as number)!))

  const newWallets = wallets
    .filter((r) => typeof r.id === 'number')
    .map((r) => convert<Wallet>(r, walletIds.get(r.id as number)!))

  const newRecurring = recurring
    .filter((r) => typeof r.id === 'number')
    .map((r) =>
      convert<Recurring>(r, recurringIds.get(r.id as number)!, {
        categoryId: catIds.get(r.categoryId as number),
        walletId: walletIds.get(r.walletId as number),
      } as Partial<Recurring>),
    )

  // Giao dich tham chieu toi ca ba bang tren — bo ban ghi mo coi thay vi giu id hong
  const newTransactions = transactions
    .filter((r) => typeof r.id === 'number')
    .map((r) =>
      convert<Transaction>(r, newId(), {
        categoryId: catIds.get(r.categoryId as number),
        walletId: walletIds.get(r.walletId as number),
        recurringId: typeof r.recurringId === 'number' ? recurringIds.get(r.recurringId) : undefined,
      } as Partial<Transaction>),
    )
    .filter((t) => t.categoryId !== undefined && t.walletId !== undefined)

  const newBudgets = budgets
    .filter((r) => typeof r.id === 'number')
    .map((r) => convert<Budget>(r, newId(), { categoryId: catIds.get(r.categoryId as number) } as Partial<Budget>))
    .filter((b) => b.categoryId !== undefined)

  const newDayMarks = dayMarks.filter((r) => typeof r.id === 'number').map((r) => convert<DayMark>(r, newId()))

  const newTemplates = templates
    .filter((r) => typeof r.id === 'number')
    .map((r) =>
      convert<Template>(r, newId(), {
        categoryId: catIds.get(r.categoryId as number),
        walletId: typeof r.walletId === 'number' ? walletIds.get(r.walletId) : undefined,
      } as Partial<Template>),
    )
    .filter((t) => t.categoryId !== undefined)

  const newSettings = settings.filter((r) => typeof r.id === 'number').map((r) => convert<Settings>(r, newId()))

  await db.transaction(
    'rw',
    [db.categories, db.wallets, db.transactions, db.budgets, db.dayMarks, db.templates, db.recurring, db.settings],
    async () => {
      await Promise.all([
        db.categories.bulkAdd(newCategories),
        db.wallets.bulkAdd(newWallets),
        db.transactions.bulkAdd(newTransactions),
        db.budgets.bulkAdd(newBudgets),
        db.dayMarks.bulkAdd(newDayMarks),
        db.templates.bulkAdd(newTemplates),
        db.recurring.bulkAdd(newRecurring),
        db.settings.bulkAdd(newSettings),
      ])
    },
  )

  moved.categories = newCategories.length
  moved.wallets = newWallets.length
  moved.transactions = newTransactions.length
  moved.budgets = newBudgets.length
  moved.dayMarks = newDayMarks.length
  moved.templates = newTemplates.length
  moved.recurring = newRecurring.length
  moved.settings = newSettings.length

  // Chi xoa ban cu sau khi ban moi da ghi xong
  legacy.close()
  await Dexie.delete(LEGACY_DB_NAME)

  return { ran: true, moved }
}
