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
  /**
   * Moc tao, dung lam THU TU HIEN THI.
   *
   * Khong co truong nay thi Dexie tra ve theo thu tu UUID — tuc ngau nhien.
   * Xem lib/order.ts.
   *
   * Tuy chon vi du lieu tu ban cu chua co; `backfillOrder()` gan lai luc mo app.
   */
  createdAt?: number

  /** ma dinh danh on dinh cho cac danh muc he thong */
  slug?: CategorySlug
  /** tu khoa de o nhap nhanh doan ra danh muc nay */
  keywords?: string[]
  /**
   * Hu ma danh muc nay thuoc ve, theo phuong phap sau hu.
   *
   * Kieu la chuoi chu khong phai JarSlug nhap tu lib/jars: tep nay la lop du
   * lieu, khong duoc phu thuoc vao lop tinh toan. Gia tri khong hop le thi
   * `jarStates` don gian la khong xep no vao hu nao.
   */
  jar?: string
}

export type WalletKind = 'cash' | 'bank' | 'ewallet' | 'credit' | 'saving'

export interface Wallet extends Syncable {
  id: Id
  name: string
  kind: WalletKind
  icon: string
  color: string
  /**
   * Moc tao, dung lam THU TU HIEN THI.
   *
   * Khong co truong nay thi Dexie tra ve theo thu tu UUID — tuc ngau nhien.
   * Xem lib/order.ts.
   *
   * Tuy chon vi du lieu tu ban cu chua co; `backfillOrder()` gan lai luc mo app.
   */
  createdAt?: number

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

/**
 * Muc tieu tiet kiem.
 *
 * Tien do KHONG luu o day — no la so du cua `walletId`. Luu mot con so
 * "da gop duoc" rieng nghia la co hai nguon su that phai tu giu khop nhau
 * bang tay, va nguoi dung quen cap nhat thi thanh tien do dung yen ma van
 * trong nhu that.
 */
export interface Goal extends Syncable {
  id: Id
  name: string
  icon: string
  /** so tien can dat */
  target: number
  /** vi duoc theo doi; tien do chinh la so du vi nay */
  walletId: Id
  /** han mong muon, 'YYYY-MM-DD'; khong bat buoc */
  dueDate?: string
  /** da cat di khoi danh sach dang theo doi */
  archived?: boolean
  createdAt: number
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
  /** tu xoa anh bien lai cu hon ngan nay ngay (0 hoac thieu = giu mai) */
  attachmentRetentionDays?: number
  /**
   * Ty le phan tram cua tung hu, khoa la JarSlug.
   *
   * Thieu hoac khong hop le thi rot ve ty le goc cua phuong phap JARS.
   */
  jarPercents?: Record<string, number>
}

/**
 * Anh bien lai dinh kem mot giao dich.
 *
 * Co MOT diem khac biet co y voi moi kieu khac trong tep nay: no KHONG mo rong
 * `Syncable`. Khong `updatedAt`, khong `deviceId`, khong bia mo. Day khong
 * phai thieu sot — do la cach bao dam bang cau truc rang anh khong bao gio roi
 * khoi may. Giao thuc dong bo hop nhat theo `updatedAt`; mot ban ghi khong co
 * truong do thi khong the tham gia, va khong ai co the "quen" loai no ra sau nay.
 *
 * Cung vi vay anh khong nam trong `BackupFile`. Muon mang anh sang may khac thi
 * phai xuat rieng bang tay — xem `lib/attachments.ts`.
 */
export interface Attachment {
  id: Id
  /** giao dich so huu anh nay */
  transactionId: Id
  /** anh da nen, luu thang duoi dang Blob chu khong phai base64 */
  blob: Blob
  /** kieu that sau khi nen — 'image/webp' hoac 'image/jpeg' khi may khong ma hoa duoc webp */
  mime: string
  /** so byte sau khi nen, de tinh dung luong ma khong phai doc het blob */
  bytes: number
  width: number
  height: number
  createdAt: number
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
    /** them tu ban 2; ban sao luu cu khong co truong nay */
    goals?: Goal[]
  }
}
