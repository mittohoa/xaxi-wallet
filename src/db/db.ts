import Dexie, { type Table } from 'dexie'
import type { Attachment, Budget, Category, DayMark, Goal, Id, Recurring, Settings, Syncable, Template, Transaction, Wallet } from '../types'
import { CATEGORY_COLORS, SYSTEM_COLOR } from '../lib/palette'

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
  attachments!: Table<Attachment, Id>
  goals!: Table<Goal, Id>

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

    /**
     * Anh bien lai. Bang nay CO Y khong nam trong `SYNC_TABLES`: no khong ra
     * ban sao luu, khong ra may chu, khong di dau ca. Xem chu thich cua
     * `Attachment` trong types.ts.
     */
    this.version(2).stores({
      attachments: 'id, transactionId, createdAt',
    })

    this.version(3).stores({
      goals: 'id, walletId, archived, updatedAt',
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
  'goals',
] as const

/**
 * Bang chi ton tai tren may nay. Khong sao luu, khong dong bo, nhung "xoa sach
 * du lieu" thi van phai don — nguoi dung bam nut do la muon may sach, khong
 * phai muon giu lai mot dong anh mo coi.
 */
export const LOCAL_ONLY_TABLES = ['attachments'] as const

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

/**
 * Như `stamp()`, nhưng mốc sửa là 0 — dành cho BỘ HẠT GIỐNG.
 *
 * Bản ghi gieo sẵn không phải một chỉnh sửa của người dùng, nó là chỗ trống có
 * sẵn tên. Nên nó phải THUA mọi bản thật khi hợp nhất.
 *
 * Nếu để `Date.now()` thì hỏng đúng ở lần dùng thật đầu tiên: cài app lên máy
 * mới, nó gieo "Tiền mặt" với số dư đầu kỳ 0 vào lúc T2; nhập tệp từ máy cũ có
 * "Tiền mặt" thật sửa lần cuối lúc T1 < T2. Hai ví cùng tên bị gộp, và cái mới
 * hơn — tức cái TRẮNG — thắng. Số dư đầu kỳ của người dùng biến mất, không có
 * gì báo.
 *
 * Đã đo trên máy thật: nhập một tệp chứa ba giao dịch 146.000 đ mà số dư tụt
 * 2.146.000 đ. Hai triệu chênh ra chính là số dư đầu kỳ bị ví trắng ghi đè.
 */
export function seedStamp<T extends object>(record: T): T & { id: Id } & Syncable {
  return { ...stamp(record), updatedAt: 0 }
}

/** Mốc sửa cho một lần cập nhật — luôn đi kèm mọi lệnh update */
export function touch(): Pick<Syncable, 'updatedAt' | 'deviceId'> {
  return { updatedAt: Date.now(), deviceId: deviceId() }
}

/* ---------------- bia mộ ---------------- */

/**
 * XOÁ MỀM: ghi lại rằng bản ghi đã bị xoá, thay vì bỏ nó đi.
 *
 * Xoá hẳn thì máy thứ hai không có cách nào biết chuyện gì đã xảy ra. Nó vẫn
 * giữ bản ghi đó, thấy máy này thiếu, và "sửa giúp" bằng cách gửi ngược về —
 * khoản chi bạn vừa xoá lại mọc lên ở cả hai máy. Một bia mộ thì hợp nhất được
 * như mọi thay đổi khác: bản mới hơn thắng, mà bia mộ luôn mới hơn.
 *
 * Đây là điều kiện tiên quyết của đồng bộ, và phải có TRƯỚC khi đồng bộ được
 * bật — xem §3.6 docs/dinh-huong.md.
 */
export async function softDelete(table: string, ids: Id | Id[]): Promise<number> {
  const list = Array.isArray(ids) ? ids : [ids]
  if (list.length === 0) return 0
  const patch = { ...touch(), deletedAt: Date.now() }
  await Promise.all(list.map((id) => db.table(table).update(id, patch)))
  return list.length
}

/**
 * Lọc bỏ bia mộ.
 *
 * Gọi ở MỌI đường đọc dùng cho giao diện. Quên một chỗ thì khoản đã xoá hiện
 * lại đúng ở đó — và vì các chỗ khác vẫn đúng, lỗi nhìn như dữ liệu hỏng chứ
 * không như một chỗ quên lọc.
 */
export function live<T extends { deletedAt?: number }>(rows: T[]): T[] {
  return rows.filter((r) => !r.deletedAt)
}

/**
 * Giữ bia mộ bao lâu trước khi dọn hẳn.
 *
 * Dọn sớm quá thì một máy lâu ngày không mở sẽ không kịp thấy tin đã xoá, và
 * gửi ngược bản ghi cũ về — đúng thứ mà bia mộ sinh ra để chặn. Nửa năm là dài
 * hơn mọi khoảng thời gian hợp lý giữa hai lần đồng bộ.
 */
const TOMBSTONE_DAYS = 180

/** Dọn bia mộ đã quá cũ; trả về số bản ghi đã xoá hẳn */
export async function purgeTombstones(now = Date.now()): Promise<number> {
  const cutoff = now - TOMBSTONE_DAYS * 86_400_000
  let removed = 0
  for (const name of SYNC_TABLES) {
    const old = (await db.table(name).toArray()).filter(
      (r: Syncable) => r.deletedAt !== undefined && r.deletedAt < cutoff,
    )
    if (old.length === 0) continue
    await db.table(name).bulkDelete(old.map((r: { id: Id }) => r.id))
    removed += old.length
  }
  return removed
}

/* ---------------- dữ liệu mặc định ---------------- */

type Seed<T> = Omit<T, 'id' | 'updatedAt' | 'deviceId'>

const DEFAULT_CATEGORIES: Seed<Category>[] = [
  { name: 'Ăn uống', kind: 'expense', icon: '🍜', color: CATEGORY_COLORS[0], keywords: ['an', 'com', 'pho', 'bun', 'ca phe', 'cafe', 'coffee', 'tra sua', 'an sang', 'an trua', 'an toi', 'nhau', 'quan'] , jar: 'essentials'},
  { name: 'Đi lại', kind: 'expense', icon: '🛵', color: CATEGORY_COLORS[1], keywords: ['xang', 'grab', 'taxi', 'xe bus', 'gui xe', 've xe', 'do xe', 've may bay'] , jar: 'essentials'},
  { name: 'Nhà cửa', kind: 'expense', icon: '🏠', color: CATEGORY_COLORS[2], keywords: ['tien nha', 'thue nha', 'phong tro', 'sua nha', 'noi that'] , jar: 'essentials'},
  { name: 'Hoá đơn', kind: 'expense', icon: '🧾', color: CATEGORY_COLORS[3], keywords: ['dien', 'nuoc', 'internet', 'wifi', 'dien thoai', 'truyen hinh', 'hoa don'] , jar: 'essentials'},
  { name: 'Mua sắm', kind: 'expense', icon: '🛍️', color: CATEGORY_COLORS[4], keywords: ['mua', 'quan ao', 'giay', 'shopee', 'lazada', 'tiki', 'sieu thi'] , jar: 'play'},
  { name: 'Sức khoẻ', kind: 'expense', icon: '💊', color: CATEGORY_COLORS[5], keywords: ['thuoc', 'kham', 'benh vien', 'bao hiem', 'nha khoa', 'gym'] , jar: 'essentials'},
  { name: 'Giải trí', kind: 'expense', icon: '🎮', color: CATEGORY_COLORS[6], keywords: ['phim', 'game', 'du lich', 'netflix', 'spotify', 'ca nhac'] , jar: 'play'},
  { name: 'Giáo dục', kind: 'expense', icon: '📚', color: CATEGORY_COLORS[7], keywords: ['hoc', 'hoc phi', 'sach', 'khoa hoc'] , jar: 'education'},
  { name: 'Chi khác', kind: 'expense', icon: '📦', color: SYSTEM_COLOR, builtin: true, slug: 'uncategorized-expense' },
  { name: 'Chi chưa rõ', kind: 'expense', icon: '❔', color: SYSTEM_COLOR, builtin: true, slug: 'reconcile-expense' },
  { name: 'Chuyển đi', kind: 'expense', icon: '↗️', color: SYSTEM_COLOR, builtin: true, slug: 'transfer-out' },
  { name: 'Lương', kind: 'income', icon: '💼', color: CATEGORY_COLORS[1], keywords: ['luong', 'salary'] },
  { name: 'Thưởng', kind: 'income', icon: '🎁', color: CATEGORY_COLORS[0], keywords: ['thuong', 'bonus', 'li xi'] },
  { name: 'Đầu tư', kind: 'income', icon: '📈', color: CATEGORY_COLORS[3], keywords: ['lai', 'co tuc', 'dau tu', 'chung khoan'] },
  { name: 'Thu khác', kind: 'income', icon: '💰', color: SYSTEM_COLOR, builtin: true, slug: 'uncategorized-income' },
  { name: 'Thu chưa rõ', kind: 'income', icon: '❔', color: SYSTEM_COLOR, builtin: true, slug: 'reconcile-income' },
  { name: 'Chuyển đến', kind: 'income', icon: '↘️', color: SYSTEM_COLOR, builtin: true, slug: 'transfer-in' },
]

const DEFAULT_WALLETS: Seed<Wallet>[] = [
  { name: 'Tiền mặt', kind: 'cash', icon: '👛', color: CATEGORY_COLORS[0], openingBalance: 0 },
  { name: 'Ngân hàng', kind: 'bank', icon: '🏦', color: CATEGORY_COLORS[1], openingBalance: 0 },
  { name: 'Ví điện tử', kind: 'ewallet', icon: '📱', color: CATEGORY_COLORS[7], openingBalance: 0 },
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
    // `createdAt` la chi so trong bo hat giong, khong phai moc thoi gian that.
    // So nho nen chung luon dung truoc ban ghi nguoi dung tu tao sau nay
    // (Date.now() cỡ 1,7 nghìn tỷ). Xem lib/order.ts.
    // Đếm bản còn sống, không đếm bia mộ: người dùng xoá hết danh mục rồi mở
    // lại app thì phải được gieo lại bộ mặc định, chứ không phải nhìn màn trống
    if (live(await db.categories.toArray()).length === 0)
      await db.categories.bulkAdd(DEFAULT_CATEGORIES.map((c, i) => seedStamp({ ...c, createdAt: i })))
    if (live(await db.wallets.toArray()).length === 0)
      await db.wallets.bulkAdd(DEFAULT_WALLETS.map((w, i) => seedStamp({ ...w, createdAt: i })))
    if (live(await db.settings.toArray()).length === 0) await db.settings.add(seedStamp(DEFAULT_SETTINGS))

    // Du lieu chuyen sang tu ban cu chua co hai danh muc chuyen tien
    const slugs = new Set(live(await db.categories.toArray()).map((c) => c.slug).filter(Boolean))
    const missing = DEFAULT_CATEGORIES.filter(
      (c) => (c.slug === 'transfer-out' || c.slug === 'transfer-in') && !slugs.has(c.slug),
    )
    if (missing.length) {
      await db.categories.bulkAdd(
        missing.map((c) => seedStamp({ ...c, createdAt: DEFAULT_CATEGORIES.indexOf(c) })),
      )
    }
  })
}

/**
 * Màu của bộ hạt giống cũ, trước khi bộ màu được đo lại.
 *
 * Bộ này trượt phép kiểm: "#52514e" độ bão hoà 0,005 nên đọc ra xám, và
 * "#e34948" với "#e87ba4" chỉ cách nhau ΔE 13,2 — mắt thường cũng khó phân
 * biệt hai danh mục mang hai màu đó trong cùng một biểu đồ.
 */
const LEGACY_COLORS = new Set([
  '#eb6834', '#2a78d6', '#4a3aa7', '#52514e', '#e87ba4',
  '#e34948', '#1baf7a', '#eda100', '#898781', '#ec835a', '#72727e',
])

/**
 * Đổi màu các danh mục vẫn đang mang màu của bộ hạt giống cũ.
 *
 * Chỉ đụng tới danh mục có TÊN trùng bộ mặc định VÀ màu vẫn là một trong các
 * màu cũ. Người dùng tự chọn màu khác thì giữ nguyên — màu đó là lựa chọn của
 * họ, không phải giá trị mặc định bị bỏ quên.
 *
 * Chạy nhiều lần không sao: sau lần đầu thì không màu nào còn nằm trong danh
 * sách cũ nữa.
 */
export async function refreshCategoryColors(): Promise<number> {
  const rows = live(await db.categories.toArray())
  const wanted = new Map(DEFAULT_CATEGORIES.map((c) => [`${c.kind}|${c.name}`, c.color]))

  const changes = rows
    .filter((c) => LEGACY_COLORS.has(c.color))
    .map((c) => ({ row: c, color: wanted.get(`${c.kind}|${c.name}`) }))
    .filter((x): x is { row: Category; color: string } => Boolean(x.color) && x.color !== x.row.color)

  for (const { row, color } of changes) await db.categories.update(row.id, { ...touch(), color })
  return changes.length
}

/**
 * Gan thu tu hien thi cho ban ghi cu chua co `createdAt`.
 *
 * Truoc ban nay, vi va danh muc khong mang thu tu nao, nen moi cho hien thi
 * deu xep theo UUID — ngau nhien. Ham nay gan lai mot lan:
 *
 *   · ban ghi trung ten voi bo hat giong lay dung chi so trong bo do, nen thu
 *     tu quen thuoc duoc dung lai y nguyen (Tien mat, Ngan hang, Vi dien tu)
 *   · ban ghi nguoi dung tu them xep sau, theo `updatedAt`
 *
 * Chay nhieu lan khong sao: lan sau khong con ban ghi nao thieu `createdAt`.
 */
export async function backfillOrder(): Promise<number> {
  let changed = 0

  const fix = async <T extends { id: Id; name: string; createdAt?: number; updatedAt: number }>(
    table: Table<T, Id>,
    seedNames: string[],
  ) => {
    const rows = await table.toArray()
    const missing = rows.filter((r) => typeof r.createdAt !== 'number')
    if (missing.length === 0) return

    missing.sort((a, b) => {
      const ia = seedNames.indexOf(a.name)
      const ib = seedNames.indexOf(b.name)
      const ka = ia < 0 ? Number.MAX_SAFE_INTEGER : ia
      const kb = ib < 0 ? Number.MAX_SAFE_INTEGER : ib
      if (ka !== kb) return ka - kb
      return a.updatedAt - b.updatedAt
    })

    for (const [i, row] of missing.entries()) {
      await table.update(row.id, { ...touch(), createdAt: i } as never)
      changed++
    }
  }

  await fix(db.categories, DEFAULT_CATEGORIES.map((c) => c.name))
  await fix(db.wallets, DEFAULT_WALLETS.map((w) => w.name))
  return changed
}

export async function wipeAll(): Promise<void> {
  const tables = [...SYNC_TABLES, ...LOCAL_ONLY_TABLES]
  await db.transaction(
    'rw',
    tables.map((name) => db.table(name)),
    async () => {
      await Promise.all(tables.map((name) => db.table(name).clear()))
    },
  )
  await seedIfEmpty()
}
