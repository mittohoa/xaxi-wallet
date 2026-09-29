/**
 * Sinh du lieu mau cho nguoi dung thu app: khoang 3 thang chi tieu that,
 * co ca ngay khong chi tieu, vai ngay bo trong va mot but toan doi soat —
 * de thay ro cac co che chong bo cuoc hoat dong nhu the nao.
 *
 * Dung so ngau nhien co hat co dinh nen ket qua lap lai duoc.
 */
import { db, live, stamp, touch } from '../db/db'
import type { Budget, Category, DayMark, Transaction, Wallet } from '../types'
import { toISO, todayISO } from './date'
import { firstDueDate } from './recurring'

/** Bo sinh so gia ngau nhien tuyen tinh — cung mot hat cho cung mot ket qua */
function makeRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

interface Pattern {
  category: string
  /** xac suat xuat hien trong mot ngay */
  chance: number
  min: number
  max: number
  notes: string[]
}

const EXPENSE_PATTERNS: Pattern[] = [
  { category: 'Ăn uống', chance: 0.92, min: 25_000, max: 120_000, notes: ['ăn sáng', 'ăn trưa', 'cà phê', 'ăn tối', 'trà sữa'] },
  { category: 'Đi lại', chance: 0.38, min: 15_000, max: 90_000, notes: ['grab', 'xăng', 'gửi xe'] },
  { category: 'Mua sắm', chance: 0.14, min: 80_000, max: 900_000, notes: ['shopee', 'siêu thị', 'quần áo'] },
  { category: 'Giải trí', chance: 0.1, min: 50_000, max: 400_000, notes: ['xem phim', 'netflix', 'cà phê với bạn'] },
  { category: 'Sức khoẻ', chance: 0.05, min: 100_000, max: 600_000, notes: ['thuốc', 'khám răng', 'gym'] },
  { category: 'Giáo dục', chance: 0.04, min: 150_000, max: 800_000, notes: ['sách', 'khoá học online'] },
]

/** Cac khoan co dinh hang thang: [ngay, danh muc, so tien, ghi chu] */
const MONTHLY_FIXED: [number, string, number, string][] = [
  [3, 'Nhà cửa', 4_500_000, 'Tiền thuê nhà'],
  [8, 'Hoá đơn', 320_000, 'Tiền điện'],
  [8, 'Hoá đơn', 90_000, 'Tiền nước'],
  [10, 'Hoá đơn', 220_000, 'Internet'],
]

const DEMO_DAYS = 92

export interface DemoSummary {
  transactions: number
  dayMarks: number
  gaps: number
}

/**
 * Xoa sach giao dich cu roi nap du lieu mau.
 * Giu nguyen danh muc va vi de nguoi dung khong mat thiet lap rieng.
 */
export async function loadDemoData(): Promise<DemoSummary> {
  const categories = live(await db.categories.toArray())
  const wallets = live(await db.wallets.toArray())
  if (categories.length === 0 || wallets.length === 0) throw new Error('Chưa có danh mục hoặc ví để tạo dữ liệu mẫu.')

  const byName = new Map(categories.map((c) => [c.name, c]))
  const pick = (name: string): Category => byName.get(name) ?? categories.find((c) => c.kind === 'expense')!
  const cash = wallets.find((w) => w.kind === 'cash') ?? wallets[0]
  const bank = wallets.find((w) => w.kind === 'bank') ?? wallets[0]
  const ewallet = wallets.find((w) => w.kind === 'ewallet') ?? cash

  const random = makeRandom(20260928)
  const between = (min: number, max: number) => Math.round((min + random() * (max - min)) / 1000) * 1000

  const transactions: Transaction[] = []
  const dayMarks: DayMark[] = []
  let createdAt = Date.now() - DEMO_DAYS * 86_400_000

  // Hai khoang bo trong co y: ngay 4-6 va ngay 19-21 tinh nguoc tu hom nay
  const intentionalGaps = new Set([4, 5, 6, 19, 20, 21])

  for (let back = DEMO_DAYS; back >= 0; back--) {
    const d = new Date()
    d.setDate(d.getDate() - back)
    const date = toISO(d)
    const dayOfMonth = d.getDate()

    if (intentionalGaps.has(back)) continue

    // Luong vao ngay 5, thuong quy vao thang cuoi quy
    if (dayOfMonth === 5) {
      transactions.push(stamp({
        kind: 'income',
        amount: 18_000_000,
        categoryId: pick('Lương').id,
        walletId: bank.id,
        date,
        note: 'Lương tháng',
        createdAt: (createdAt += 1000),
        source: 'recurring',
      }))
    }

    for (const [day, category, amount, note] of MONTHLY_FIXED) {
      if (dayOfMonth !== day) continue
      transactions.push(stamp({
        kind: 'expense',
        amount,
        categoryId: pick(category).id,
        walletId: bank.id,
        date,
        note,
        createdAt: (createdAt += 1000),
        source: 'recurring',
      }))
    }

    let spentToday = 0
    for (const pattern of EXPENSE_PATTERNS) {
      if (random() > pattern.chance) continue
      const times = pattern.category === 'Ăn uống' ? 1 + Math.floor(random() * 2.4) : 1
      for (let i = 0; i < times; i++) {
        const wallet = random() < 0.55 ? ewallet : cash
        transactions.push(stamp({
          kind: 'expense',
          amount: between(pattern.min, pattern.max),
          categoryId: pick(pattern.category).id,
          walletId: wallet.id,
          date,
          note: pattern.notes[Math.floor(random() * pattern.notes.length)],
          createdAt: (createdAt += 1000),
          source: random() < 0.7 ? 'quick' : 'manual',
        }))
        spentToday++
      }
    }

    // Ngay that su khong chi gi — danh dau de do phu van tron ven
    if (spentToday === 0) dayMarks.push(stamp({ date, markedAt: createdAt }))
  }

  // Mot but toan doi soat de minh hoa co che 'Chi chua ro'
  const reconcileDate = toISO(new Date(Date.now() - 9 * 86_400_000))
  transactions.push(stamp({
    kind: 'expense',
    amount: 240_000,
    categoryId: categories.find((c) => c.slug === 'reconcile-expense')!.id!,
    walletId: cash.id,
    date: reconcileDate,
    note: 'Chênh lệch đối soát số dư',
    createdAt: (createdAt += 1000),
    source: 'reconcile',
    estimated: true,
  }))

  // Vai khoan trong hop cho phan loai
  for (let i = 0; i < 3; i++) {
    const d = new Date()
    d.setDate(d.getDate() - (1 + i * 2))
    transactions.push(stamp({
      kind: 'expense',
      amount: between(40_000, 260_000),
      categoryId: categories.find((c) => c.slug === 'uncategorized-expense')!.id!,
      walletId: ewallet.id,
      date: toISO(d),
      note: ['chuyển khoản', 'quét QR', 'thanh toán thẻ'][i],
      createdAt: (createdAt += 1000),
      source: 'quick',
    }))
  }

  const month = todayISO().slice(0, 7)
  const budgets: Budget[] = ([
    { categoryId: pick('Ăn uống').id, month, limit: 4_000_000 },
    { categoryId: pick('Đi lại').id, month, limit: 1_200_000 },
    { categoryId: pick('Mua sắm').id, month, limit: 1_500_000 },
    { categoryId: pick('Giải trí').id, month, limit: 800_000 },
  ] as Omit<Budget, 'id' | 'updatedAt' | 'deviceId'>[]).map(stamp)

  await db.transaction('rw', [db.transactions, db.dayMarks, db.budgets, db.recurring, db.wallets], async () => {
    await Promise.all([db.transactions.clear(), db.dayMarks.clear(), db.budgets.clear(), db.recurring.clear()])
    await Promise.all([
      db.transactions.bulkAdd(transactions),
      db.dayMarks.bulkAdd(dayMarks),
      db.budgets.bulkAdd(budgets),
      db.recurring.bulkAdd([
        stamp({
          name: 'Tiền thuê nhà',
          kind: 'expense',
          amount: 4_500_000,
          categoryId: pick('Nhà cửa').id,
          walletId: bank.id,
          freq: 'monthly',
          anchor: 3,
          nextDate: firstDueDate('monthly', 3),
          active: true,
        }),
        stamp({
          name: 'Internet',
          kind: 'expense',
          amount: 220_000,
          categoryId: pick('Hoá đơn').id,
          walletId: bank.id,
          freq: 'monthly',
          anchor: 10,
          nextDate: firstDueDate('monthly', 10),
          active: true,
        }),
      ]),
    ])
    await db.wallets.update(cash.id, { ...touch(), lastReconciledAt: reconcileDate })
  })

  return { transactions: transactions.length, dayMarks: dayMarks.length, gaps: intentionalGaps.size }
}

/** So du dau ky hop ly cho du lieu mau, de tong so du khong am */
export async function primeOpeningBalances(wallets: Wallet[]): Promise<void> {
  const presets: Record<string, number> = { cash: 2_000_000, bank: 25_000_000, ewallet: 1_500_000 }
  await Promise.all(
    wallets
      .filter((w) => w.openingBalance === 0 && presets[w.kind] !== undefined)
      .map((w) => db.wallets.update(w.id, { ...touch(), openingBalance: presets[w.kind] })),
  )
}
