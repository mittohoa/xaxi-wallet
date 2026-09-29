/**
 * Khoá chính là chuỗi UUID chứ không phải số tự tăng.
 *
 * Lý do: hai thiết bị cùng ghi một giao dịch sẽ cùng sinh ra `id = 5` nếu dùng
 * số tự tăng — trùng khoá, không thể hợp nhất khi đồng bộ. Đổi lúc chưa ai có
 * dữ liệu thật thì gần như không tốn gì; để sau thì phải viết cả tầng ánh xạ
 * id cũ–mới và mọi bản sao lưu cũ đều thành vấn đề.
 */
export type Id = string

/**
 * Ba trường mọi bản ghi đồng bộ được đều phải có.
 * Chưa bật đồng bộ nhưng phải ghi từ bây giờ, không thì dữ liệu tạo ra trong
 * giai đoạn này sẽ thiếu thông tin để hợp nhất về sau.
 */
export interface Syncable {
  /** mốc sửa gần nhất — bản mới hơn thắng khi hai máy cùng sửa */
  updatedAt: number
  /** bia mộ: xoá mà không ghi lại thì máy kia sẽ đồng bộ ngược nó về */
  deletedAt?: number
  /** thiết bị tạo ra bản ghi, dùng phá thế hoà khi `updatedAt` trùng nhau */
  deviceId?: string
}

export type TxKind = 'income' | 'expense'

export type CategorySlug =
  | 'uncategorized-expense'
  | 'uncategorized-income'
  | 'reconcile-expense'
  | 'reconcile-income'
  | 'transfer-out'
  | 'transfer-in'

export interface Category extends Syncable {
  id: Id
  name: string
  kind: TxKind
  icon: string
  color: string
  /** khong cho xoa: danh muc he thong ma logic app phu thuoc vao */
  builtin?: boolean
  /** ma dinh danh on dinh cho cac danh muc he thong */
  slug?: CategorySlug
  /** tu khoa de o nhap nhanh doan ra danh muc nay */
  keywords?: string[]
}

export type WalletKind = 'cash' | 'bank' | 'ewallet' | 'credit' | 'saving'

export interface Wallet extends Syncable {
  id: Id
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
export type TxSource = 'manual' | 'quick' | 'recurring' | 'reconcile' | 'transfer'

export interface Transaction extends Syncable {
  id: Id
  kind: TxKind
  /** luon luu so duong, dau phu thuoc `kind` */
  amount: number
  categoryId: Id
  walletId: Id
  /** ISO date 'YYYY-MM-DD' */
  date: string
  note?: string
  createdAt: number
  source?: TxSource
  /** so tien la uoc luong, khong phai con so chinh xac */
  estimated?: boolean
  /** id cua quy tac dinh ky da sinh ra ban ghi nay */
  recurringId?: Id
  /**
   * Chuyen tien giua hai vi duoc ghi thanh MOT CAP ban ghi cung mang ma nay:
   * mot ban ghi kieu 'expense' o vi nguon, mot ban ghi kieu 'income' o vi dich.
   *
   * Nho vay phep tinh so du tung vi khong phai doi gi, nhung MOI phep tinh
   * thu/chi deu phai loai cap nay ra — tien chi chuyen cho, khong phai chi tieu.
   */
  transferId?: Id
}

export interface Budget extends Syncable {
  id: Id
  categoryId: Id
  /** 'YYYY-MM' */
  month: string
  limit: number
}

/**
 * Danh dau mot ngay da duoc xac nhan la KHONG co chi tieu.
 * Day la thu phan biet "ngay khong chi" voi "ngay quen ghi" —
 * nho no ma do phu du lieu van tron ven khi nguoi dung luoi.
 */
export interface DayMark extends Syncable {
  id: Id
  /** 'YYYY-MM-DD' */
  date: string
  markedAt: number
}

/** Phim tat ghi nhanh mot khoan hay lap lai */
export interface Template extends Syncable {
  id: Id
  label: string
  kind: TxKind
  amount: number
  categoryId: Id
  walletId?: Id
  note?: string
  /** so lan da dung, de xep hang goi y */
  uses: number
  lastUsedAt?: number
  pinned?: boolean
}

export type RecurringFreq = 'daily' | 'weekly' | 'monthly'

/** Quy tac sinh giao dich tu dong (tien nha, luong, internet...) */
export interface Recurring extends Syncable {
  id: Id
  name: string
  kind: TxKind
  amount: number
  categoryId: Id
  walletId: Id
  freq: RecurringFreq
  /** 1..31 cho 'monthly'; 0..6 (CN..T7) cho 'weekly'; bo qua voi 'daily' */
  anchor: number
  /** ngay ke tiep can sinh giao dich, 'YYYY-MM-DD' */
  nextDate: string
  active: boolean
  note?: string
}

export interface Settings extends Syncable {
  id: Id
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
