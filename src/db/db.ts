import Dexie, { type Table } from 'dexie'
import type { Budget, Category, DayMark, Id, Recurring, Settings, Syncable, Template, Transaction, Wallet } from '../types'

/**
 * Tên CSDL đổi so với bản đầu vì khoá chính đổi từ số tự tăng sang UUID —
 * IndexedDB không cho đổi khoá chính của một kho đã tồn tại. Dữ liệu của bản
 * cũ được chuyển sang bằng `migrateLegacyDatabase()` trong migrate.ts.
 */
export const DB_NAME = 'xaxi-v2'
export const LEGACY_DB_NAME = 'xaxi'

export class XaxiDB extends Dexie {
  categories!: Table<Category, Id>
  wallets!: Table<Wallet, Id>
  transactions!: Table<Transaction, Id>
  budgets!: Table<Budget, Id>
  dayMarks!: Table<DayMark, Id>
  templates!: Table<Template, Id>
  recurring!: Table<Recurring, Id>
  settings!: Table<Settings, Id>

  constructor() {
    super(DB_NAME)
    this.version(1).stores({
      categories: 'id, name, kind, slug, updatedAt',
      wallets: 'id, name, kind, archived, updatedAt',
      transactions: 'id, date, kind, categoryId, walletId, createdAt, recurringId, transferId, updatedAt',
      budgets: 'id, month, categoryId, [month+categoryId], updatedAt',
      dayMarks: 'id, &date, updatedAt',
      templates: 'id, kind, uses, pinned, updatedAt',
      recurring: 'id, nextDate, active, updatedAt',
      settings: 'id, updatedAt',
    })
  }
}

export const db = new XaxiDB()

/** Mọi bảng đồng bộ được, theo đúng thứ tự dùng khi sao lưu và khôi phục */
export const SYNC_TABLES = [
  'categories',
  'wallets',
  'transactions',
  'budgets',
  'dayMarks',
  'templates',
  'recurring',
  'settings',
] as const

/* ---------------- danh tính thiết bị ---------------- */

const DEVICE_KEY = 'xaxi.deviceId'

/** UUID v4; dùng crypto khi có, rơi về bộ sinh thủ công khi không */
export function newId(): Id {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return `id-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e12).toString(36)}`
}

/** Mã thiết bị, sinh một lần rồi giữ nguyên — dùng phá thế hoà khi đồng bộ */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = newId()
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    // Vài WebView chặn localStorage — mã tạm cũng đủ dùng trong phiên
    return 'unknown'
  }
}

/** Gắn id, mốc sửa và mã thiết bị cho một bản ghi mới */
export function stamp<T extends object>(record: T): T & { id: Id } & Syncable {
  return { id: newId(), updatedAt: Date.now(), deviceId: deviceId(), ...record } as T & { id: Id } & Syncable
}

/** Mốc sửa cho một lần cập nhật — luôn đi kèm mọi lệnh update */
export function touch(): Pick<Syncable, 'updatedAt' | 'deviceId'> {
  return { updatedAt: Date.now(), deviceId: deviceId() }
}

/* ---------------- dữ liệu mặc định ---------------- */

type Seed<T> = Omit<T, 'id' | 'updatedAt' | 'deviceId'>

const DEFAULT_CATEGORIES: Seed<Category>[] = [
  { name: 'Ăn uống', kind: 'expense', icon: '🍜', color: '#eb6834', keywords: ['an', 'com', 'pho', 'bun', 'ca phe', 'cafe', 'tra sua', 'an sang', 'an trua', 'an toi', 'nhau', 'quan'] },
  { name: 'Đi lại', kind: 'expense', icon: '🛵', color: '#2a78d6', keywords: ['xang', 'grab', 'taxi', 'xe bus', 'gui xe', 've xe', 'do xe', 've may bay'] },
  { name: 'Nhà cửa', kind: 'expense', icon: '🏠', color: '#4a3aa7', keywords: ['tien nha', 'thue nha', 'phong tro', 'sua nha', 'noi that'] },
  { name: 'Hoá đơn', kind: 'expense', icon: '🧾', color: '#52514e', keywords: ['dien', 'nuoc', 'internet', 'wifi', 'dien thoai', 'truyen hinh', 'hoa don'] },
  { name: 'Mua sắm', kind: 'expense', icon: '🛍️', color: '#e87ba4', keywords: ['mua', 'quan ao', 'giay', 'shopee', 'lazada', 'tiki', 'sieu thi'] },
  { name: 'Sức khoẻ', kind: 'expense', icon: '💊', color: '#e34948', keywords: ['thuoc', 'kham', 'benh vien', 'bao hiem', 'nha khoa', 'gym'] },
  { name: 'Giải trí', kind: 'expense', icon: '🎮', color: '#1baf7a', keywords: ['phim', 'game', 'du lich', 'netflix', 'spotify', 'ca nhac'] },
  { name: 'Giáo dục', kind: 'expense', icon: '📚', color: '#eda100', keywords: ['hoc', 'hoc phi', 'sach', 'khoa hoc'] },
  { name: 'Chi khác', kind: 'expense', icon: '📦', color: '#898781', builtin: true, slug: 'uncategorized-expense' },
  { name: 'Chi chưa rõ', kind: 'expense', icon: '❔', color: '#ec835a', builtin: true, slug: 'reconcile-expense' },
  { name: 'Chuyển đi', kind: 'expense', icon: '↗️', color: '#72727e', builtin: true, slug: 'transfer-out' },
  { name: 'Lương', kind: 'income', icon: '💼', color: '#2a78d6', keywords: ['luong', 'salary'] },
  { name: 'Thưởng', kind: 'income', icon: '🎁', color: '#1baf7a', keywords: ['thuong', 'bonus', 'li xi'] },
  { name: 'Đầu tư', kind: 'income', icon: '📈', color: '#4a3aa7', keywords: ['lai', 'co tuc', 'dau tu', 'chung khoan'] },
  { name: 'Thu khác', kind: 'income', icon: '💰', color: '#898781', builtin: true, slug: 'uncategorized-income' },
  { name: 'Thu chưa rõ', kind: 'income', icon: '❔', color: '#eda100', builtin: true, slug: 'reconcile-income' },
  { name: 'Chuyển đến', kind: 'income', icon: '↘️', color: '#72727e', builtin: true, slug: 'transfer-in' },
]

const DEFAULT_WALLETS: Seed<Wallet>[] = [
  { name: 'Tiền mặt', kind: 'cash', icon: '👛', color: '#1baf7a', openingBalance: 0 },
  { name: 'Ngân hàng', kind: 'bank', icon: '🏦', color: '#2a78d6', openingBalance: 0 },
  { name: 'Ví điện tử', kind: 'ewallet', icon: '📱', color: '#e87ba4', openingBalance: 0 },
]

export const DEFAULT_SETTINGS: Seed<Settings> = {
  currency: 'VND',
  locale: 'vi-VN',
  theme: 'system',
  startDayOfMonth: 1,
  gapWindowDays: 14,
  nudgeAfterGapDays: 3,
  reconcileEveryDays: 7,
  dismissedSuggestions: [],
}

/** Tao du lieu mac dinh o lan chay dau tien. An toan khi goi nhieu lan. */
export async function seedIfEmpty(): Promise<void> {
  await db.transaction('rw', db.categories, db.wallets, db.settings, async () => {
    if ((await db.categories.count()) === 0) await db.categories.bulkAdd(DEFAULT_CATEGORIES.map(stamp))
    if ((await db.wallets.count()) === 0) await db.wallets.bulkAdd(DEFAULT_WALLETS.map(stamp))
    if ((await db.settings.count()) === 0) await db.settings.add(stamp(DEFAULT_SETTINGS))

    // Du lieu chuyen sang tu ban cu chua co hai danh muc chuyen tien
    const slugs = new Set((await db.categories.toArray()).map((c) => c.slug).filter(Boolean))
    const missing = DEFAULT_CATEGORIES.filter(
      (c) => (c.slug === 'transfer-out' || c.slug === 'transfer-in') && !slugs.has(c.slug),
    )
    if (missing.length) await db.categories.bulkAdd(missing.map(stamp))
  })
}

export async function wipeAll(): Promise<void> {
  await db.transaction(
    'rw',
    SYNC_TABLES.map((name) => db.table(name)),
    async () => {
      await Promise.all(SYNC_TABLES.map((name) => db.table(name).clear()))
    },
  )
  await seedIfEmpty()
}
