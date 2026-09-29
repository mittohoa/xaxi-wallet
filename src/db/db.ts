import Dexie, { type Table } from 'dexie'
import type { Budget, Category, DayMark, Recurring, Settings, Template, Transaction, Wallet } from '../types'

export class XaxiDB extends Dexie {
  categories!: Table<Category, number>
  wallets!: Table<Wallet, number>
  transactions!: Table<Transaction, number>
  budgets!: Table<Budget, number>
  dayMarks!: Table<DayMark, number>
  templates!: Table<Template, number>
  recurring!: Table<Recurring, number>
  settings!: Table<Settings, number>

  constructor() {
    super('xaxi')
    this.version(1).stores({
      categories: '++id, name, kind, slug',
      wallets: '++id, name, kind, archived',
      transactions: '++id, date, kind, categoryId, walletId, createdAt, recurringId',
      budgets: '++id, month, categoryId, [month+categoryId]',
      dayMarks: '++id, &date',
      templates: '++id, kind, uses, pinned',
      recurring: '++id, nextDate, active',
      settings: '++id',
    })
  }
}

export const db = new XaxiDB()

const DEFAULT_CATEGORIES: Category[] = [
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
  { name: 'Lương', kind: 'income', icon: '💼', color: '#2a78d6', keywords: ['luong', 'salary'] },
  { name: 'Thưởng', kind: 'income', icon: '🎁', color: '#1baf7a', keywords: ['thuong', 'bonus', 'lì xì', 'li xi'] },
  { name: 'Đầu tư', kind: 'income', icon: '📈', color: '#4a3aa7', keywords: ['lai', 'co tuc', 'dau tu', 'chung khoan'] },
  { name: 'Thu khác', kind: 'income', icon: '💰', color: '#898781', builtin: true, slug: 'uncategorized-income' },
  { name: 'Thu chưa rõ', kind: 'income', icon: '❔', color: '#eda100', builtin: true, slug: 'reconcile-income' },
]

const DEFAULT_WALLETS: Wallet[] = [
  { name: 'Tiền mặt', kind: 'cash', icon: '👛', color: '#1baf7a', openingBalance: 0 },
  { name: 'Ngân hàng', kind: 'bank', icon: '🏦', color: '#2a78d6', openingBalance: 0 },
  { name: 'Ví điện tử', kind: 'ewallet', icon: '📱', color: '#e87ba4', openingBalance: 0 },
]

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
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
    if ((await db.categories.count()) === 0) await db.categories.bulkAdd(DEFAULT_CATEGORIES)
    if ((await db.wallets.count()) === 0) await db.wallets.bulkAdd(DEFAULT_WALLETS)
    if ((await db.settings.count()) === 0) await db.settings.add(DEFAULT_SETTINGS)
  })
}

export async function wipeAll(): Promise<void> {
  await db.transaction(
    'rw',
    [db.categories, db.wallets, db.transactions, db.budgets, db.dayMarks, db.templates, db.recurring, db.settings],
    async () => {
      await Promise.all([
        db.transactions.clear(),
        db.budgets.clear(),
        db.dayMarks.clear(),
        db.templates.clear(),
        db.recurring.clear(),
        db.categories.clear(),
        db.wallets.clear(),
        db.settings.clear(),
      ])
    },
  )
  await seedIfEmpty()
}
