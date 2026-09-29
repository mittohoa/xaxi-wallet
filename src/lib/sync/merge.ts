/**
 * Hợp nhất dữ liệu từ hai máy.
 *
 * Chiến lược cơ bản là thứ §3.6 đã chốt: **hợp nhất theo từng bản ghi, bản mới
 * hơn thắng**. Chi tiêu cá nhân gần như chỉ có thêm mới, hiếm khi hai máy sửa
 * cùng một bản ghi cùng lúc, nên không cần CRDT.
 *
 * Nhưng "bản mới hơn thắng" chỉ giải được xung đột khi hai bên nói về CÙNG MỘT
 * id. Vấn đề khó hơn nằm ở chỗ khác: hai máy sinh ra hai bản ghi KHÁC id cho
 * cùng một thứ. Mỗi máy lúc mới cài đều tự gieo bộ danh mục mặc định, nên cả
 * hai đều có "Ăn uống" — với hai UUID khác nhau, và giao dịch ở mỗi máy trỏ vào
 * id của riêng máy đó. Ghép thẳng lại thì người dùng có hai danh mục "Ăn uống",
 * mỗi cái giữ một nửa số liệu.
 *
 * Nên trước khi hợp nhất phải GỘP TRÙNG theo khoá tự nhiên, rồi nối lại mọi
 * khoá ngoại đang trỏ vào bản thua.
 *
 * Toàn bộ tệp này là hàm thuần: không đụng cơ sở dữ liệu, không đụng mạng. Hợp
 * nhất sai thì hỏng số liệu tài chính của người dùng mà không có gì báo, nên nó
 * phải kiểm được đến từng trường hợp.
 */
import type { BackupFile } from '../../types'

type Data = BackupFile['data']

interface Row {
  id: string
  updatedAt: number
  deviceId?: string
  deletedAt?: number
}

export interface MergeReport {
  /** bản ghi chỉ có ở phía bên kia */
  added: number
  /** bản ghi cả hai cùng có, bên kia mới hơn */
  updated: number
  /** bản trùng bị gộp vào một */
  collapsed: number
  /** khoá ngoại được nối lại sau khi gộp */
  relinked: number
}

/* ================= bản mới hơn thắng ================= */

/**
 * So hai bản của cùng một id.
 *
 * Hoà `updatedAt` thì so `deviceId`. Không phải vì máy nào quan trọng hơn, mà
 * để HAI MÁY CÙNG RA MỘT KẾT QUẢ: nếu phá thế hoà bằng thứ tự ngẫu nhiên thì
 * mỗi máy chọn một bản khác nhau và chúng không bao giờ hội tụ.
 */
function newer<T extends Row>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b
  return (a.deviceId ?? '') >= (b.deviceId ?? '') ? a : b
}

function mergeById<T extends Row>(mine: T[], theirs: T[], report: MergeReport): T[] {
  const out = new Map<string, T>()
  for (const r of mine) out.set(r.id, r)

  for (const r of theirs) {
    const cur = out.get(r.id)
    if (!cur) {
      out.set(r.id, r)
      report.added++
      continue
    }
    const win = newer(cur, r)
    if (win !== cur) {
      out.set(r.id, win)
      report.updated++
    }
  }
  return [...out.values()]
}

/* ================= gộp bản trùng ================= */

/**
 * Gộp những bản ghi khác id nhưng cùng một thứ.
 *
 * Bản thua KHÔNG bị bỏ đi mà bị đánh bia mộ: máy bên kia cũng phải biết là nó
 * đã được gộp, nếu không lần đồng bộ sau nó lại gửi bản đó về.
 *
 * `key` trả về null nghĩa là bản ghi này không có khoá tự nhiên — hai giao dịch
 * cùng ngày cùng số tiền vẫn là hai lần tiêu khác nhau.
 */
function collapse<T extends Row>(
  rows: T[],
  key: (row: T) => string | null,
  now: number,
  report: MergeReport,
): { rows: T[]; remap: Map<string, string> } {
  const nhom = new Map<string, T[]>()
  for (const r of rows) {
    if (r.deletedAt) continue
    const k = key(r)
    if (k === null) continue
    const list = nhom.get(k)
    if (list) list.push(r)
    else nhom.set(k, [r])
  }

  const remap = new Map<string, string>()
  const thua = new Map<string, T>()

  for (const list of nhom.values()) {
    if (list.length < 2) continue
    const win = list.reduce(newer)
    for (const r of list) {
      if (r === win) continue
      remap.set(r.id, win.id)
      thua.set(r.id, { ...r, deletedAt: now, updatedAt: now })
      report.collapsed++
    }
  }

  return { rows: rows.map((r) => thua.get(r.id) ?? r), remap }
}

/** Nối lại các khoá ngoại trỏ vào bản đã bị gộp */
function relink<T extends object>(rows: T[], fields: (keyof T)[], remap: Map<string, string>, report: MergeReport): T[] {
  if (remap.size === 0) return rows
  return rows.map((row) => {
    let patch: Partial<T> | null = null
    for (const f of fields) {
      const value = row[f]
      const moi = typeof value === 'string' ? remap.get(value) : undefined
      if (moi) {
        patch = { ...(patch ?? {}), [f]: moi } as Partial<T>
        report.relinked++
      }
    }
    return patch ? { ...row, ...patch } : row
  })
}

/* ================= khoá tự nhiên của từng bảng ================= */

/**
 * Hai danh mục cùng loại cùng tên là một. Người dùng không cố ý tạo hai "Ăn
 * uống" chi — đó là dấu vết của việc hai máy cùng gieo bộ mặc định.
 */
const categoryKey = (c: { kind: string; name: string }) => `${c.kind}|${c.name.trim().toLowerCase()}`

const walletKey = (w: { name: string }) => w.name.trim().toLowerCase()

/**
 * Bút toán đối soát phải gộp theo ví và ngày.
 *
 * §3.6 gọi tên đúng chỗ này: hai máy cùng đối soát một ví thì mỗi máy sinh ra
 * một bút toán bù chênh lệch. Giữ cả hai là bù HAI LẦN — số dư ví sai đúng bằng
 * một lần chênh lệch, và không có gì báo cho người dùng biết.
 *
 * Giao dịch thường thì trả về null: hai lần mua cà phê cùng ngày cùng giá vẫn
 * là hai lần tiêu tiền thật.
 */
const reconcileKey = (t: { source?: string; walletId: string; date: string }) =>
  t.source === 'reconcile' ? `reconcile|${t.walletId}|${t.date}` : null

/* ================= hợp nhất toàn bộ ================= */

export function emptyReport(): MergeReport {
  return { added: 0, updated: 0, collapsed: 0, relinked: 0 }
}

/**
 * @param mine dữ liệu đang có trên máy này
 * @param theirs dữ liệu đọc từ tệp đồng bộ của máy kia
 * @param now mốc dùng cho bia mộ sinh ra khi gộp trùng; truyền vào để kiểm được
 */
export function mergeData(mine: Data, theirs: Data, now = Date.now()): { data: Data; report: MergeReport } {
  const report = emptyReport()
  const lay = <K extends keyof Data>(d: Data, k: K) => (d[k] ?? []) as NonNullable<Data[K]>

  // 1) hợp nhất theo id — phần dễ, "bản mới hơn thắng"
  let categories = mergeById(lay(mine, 'categories'), lay(theirs, 'categories'), report)
  let wallets = mergeById(lay(mine, 'wallets'), lay(theirs, 'wallets'), report)
  let transactions = mergeById(lay(mine, 'transactions'), lay(theirs, 'transactions'), report)
  let budgets = mergeById(lay(mine, 'budgets'), lay(theirs, 'budgets'), report)
  let dayMarks = mergeById(lay(mine, 'dayMarks'), lay(theirs, 'dayMarks'), report)
  let templates = mergeById(lay(mine, 'templates'), lay(theirs, 'templates'), report)
  let recurring = mergeById(lay(mine, 'recurring'), lay(theirs, 'recurring'), report)
  let goals = mergeById(lay(mine, 'goals'), lay(theirs, 'goals'), report)
  const settings = mergeById(lay(mine, 'settings'), lay(theirs, 'settings'), report)

  // 2) gộp trùng những bảng ĐƯỢC THAM CHIẾU, trước khi nối lại khoá ngoại
  const cat = collapse(categories, categoryKey, now, report)
  const wal = collapse(wallets, walletKey, now, report)
  categories = cat.rows
  wallets = wal.rows

  // 3) nối lại mọi khoá ngoại trỏ vào bản vừa bị gộp
  const idMap = new Map([...cat.remap, ...wal.remap])
  transactions = relink(transactions, ['categoryId', 'walletId'], idMap, report)
  budgets = relink(budgets, ['categoryId'], cat.remap, report)
  templates = relink(templates, ['categoryId', 'walletId'], idMap, report)
  recurring = relink(recurring, ['categoryId', 'walletId'], idMap, report)
  goals = relink(goals, ['walletId'], wal.remap, report)

  // 4) gộp những bảng có khoá tự nhiên — SAU khi khoá ngoại đã đúng, vì khoá
  //    tự nhiên của ngân sách có chứa categoryId
  dayMarks = collapse(dayMarks, (d) => d.date, now, report).rows
  budgets = collapse(budgets, (b) => `${b.month}|${b.categoryId}`, now, report).rows
  transactions = collapse(transactions, reconcileKey, now, report).rows

  /*
   * Cài đặt là bản ghi đơn. Hai máy đều có một dòng với id riêng, nên phải gộp
   * về một — nếu không thì app đọc phải dòng nào tuỳ thứ tự trả về của Dexie,
   * và giao diện đổi chủ đề theo từng lần mở.
   */
  const settingsRows = collapse(settings, () => 'settings', now, report).rows

  return {
    data: { categories, wallets, transactions, budgets, dayMarks, templates, recurring, settings: settingsRows, goals },
    report,
  }
}

/** Có gì thay đổi không — dùng để khỏi ghi lại cả cơ sở dữ liệu một cách vô ích */
export function hasChanges(r: MergeReport): boolean {
  return r.added > 0 || r.updated > 0 || r.collapsed > 0 || r.relinked > 0
}
