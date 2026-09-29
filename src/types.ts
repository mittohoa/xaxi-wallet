export type TxKind = 'income' | 'expense'

export interface Category {
  id?: number
  name: string
  kind: TxKind
  icon: string
  color: string
  /** khong cho xoa: danh muc he thong ma logic app phu thuoc vao */
  builtin?: boolean
  /** ma dinh danh on dinh cho cac danh muc he thong */
  slug?: 'uncategorized-expense' | 'uncategorized-income' | 'reconcile-expense' | 'reconcile-income'
  /** tu khoa de o nhap nhanh doan ra danh muc nay */
  keywords?: string[]
}

export type WalletKind = 'cash' | 'bank' | 'ewallet' | 'credit' | 'saving'

export interface Wallet {
  id?: number
  name: string
  kind: WalletKind
  icon: string
  color: string
  /** so du ban dau, khong bao gom giao dich */
  openingBalance: number
  archived?: boolean
  /** lan doi soat so du gan nhat, 'YYYY-MM-DD' */
  lastReconciledAt?: string
}

/** Nguon goc ban ghi — quyet dinh cach hien thi va do tin cay */
export type TxSource = 'manual' | 'quick' | 'recurring' | 'reconcile'

export interface Transaction {
  id?: number
  kind: TxKind
  /** luon luu so duong, dau phu thuoc `kind` */
  amount: number
  categoryId: number
  walletId: number
  /** ISO date 'YYYY-MM-DD' */
  date: string
  note?: string
  createdAt: number
  source?: TxSource
  /** so tien la uoc luong, khong phai con so chinh xac */
  estimated?: boolean
  /** id cua quy tac dinh ky da sinh ra ban ghi nay */
  recurringId?: number
}

export interface Budget {
  id?: number
  categoryId: number
  /** 'YYYY-MM' */
  month: string
  limit: number
}

/**
 * Danh dau mot ngay da duoc xac nhan la KHONG co chi tieu.
 * Day la thu phan biet "ngay khong chi" voi "ngay quen ghi" —
 * nho no ma do phu du lieu van tron ven khi nguoi dung luoi.
 */
export interface DayMark {
  id?: number
  /** 'YYYY-MM-DD' */
  date: string
  markedAt: number
}

/** Phim tat ghi nhanh mot khoan hay lap lai */
export interface Template {
  id?: number
  label: string
  kind: TxKind
  amount: number
  categoryId: number
  walletId?: number
  note?: string
  /** so lan da dung, de xep hang goi y */
  uses: number
  lastUsedAt?: number
  pinned?: boolean
}

export type RecurringFreq = 'daily' | 'weekly' | 'monthly'

/** Quy tac sinh giao dich tu dong (tien nha, luong, internet...) */
export interface Recurring {
  id?: number
  name: string
  kind: TxKind
  amount: number
  categoryId: number
  walletId: number
  freq: RecurringFreq
  /** 1..31 cho 'monthly'; 0..6 (CN..T7) cho 'weekly'; bo qua voi 'daily' */
  anchor: number
  /** ngay ke tiep can sinh giao dich, 'YYYY-MM-DD' */
  nextDate: string
  active: boolean
  note?: string
}

export interface Settings {
  id?: number
  currency: string
  locale: string
  theme: 'light' | 'dark' | 'system'
  /** ngay bat dau ky ke toan trong thang, 1..28 */
  startDayOfMonth: number
  /** so ngay quay lai khi liet ke khoang trong du lieu */
  gapWindowDays: number
  /** chi nhac khi da trong tu ngan nay ngay tro len (0 = tat) */
  nudgeAfterGapDays: number
  /** so ngay giua hai lan nhac doi soat so du (0 = tat) */
  reconcileEveryDays: number
  /** khoa cua cac de xuat dinh ky nguoi dung da tu choi, de khong hoi lai */
  dismissedSuggestions?: string[]
}

export interface BackupFile {
  app: 'xaxi'
  version: number
  exportedAt: string
  data: {
    categories: Category[]
    wallets: Wallet[]
    transactions: Transaction[]
    budgets: Budget[]
    dayMarks: DayMark[]
    templates: Template[]
    recurring: Recurring[]
    settings: Settings[]
  }
}
