/**
 * Kiem thu tich hop: dung app that tren jsdom voi IndexedDB gia,
 * de bat loi runtime ma kiem tra kieu khong thay duoc.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import 'fake-indexeddb/auto'

const dom = new JSDOM('<!doctype html><html><head><meta name="theme-color" content="#f9f9f7"></head><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: false,
})

const g = globalThis as Record<string, unknown>
g.window = dom.window
g.document = dom.window.document
// Node 22 dinh nghia `navigator` chi doc — phai ghi de qua defineProperty
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true })
g.HTMLElement = dom.window.HTMLElement
g.Element = dom.window.Element
g.Node = dom.window.Node
g.Event = dom.window.Event
g.MouseEvent = dom.window.MouseEvent
g.KeyboardEvent = dom.window.KeyboardEvent
g.getComputedStyle = dom.window.getComputedStyle
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number
g.cancelAnimationFrame = (id: number) => clearTimeout(id)
g.IS_REACT_ACT_ENVIRONMENT = true

// jsdom chua co ResizeObserver / matchMedia — bieu do va chu de sang toi can chung
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
g.ResizeObserver = ResizeObserverStub
dom.window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
dom.window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

const { createElement } = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = await import('react')
const { default: App } = await import('../src/App')
const { db } = await import('../src/db/db')

async function settle(ms = 60) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

/** Cho toi khi dieu kien dung — IndexedDB gia va live query can vai vong */
async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await settle(50)
  }
  assert.ok(await check(), 'hết thời gian chờ mà điều kiện vẫn chưa đúng')
}

/** Dat gia tri vao input theo dung cach React nhan ra (khong the gan .value truc tiep) */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
}

function pressEnter(input: HTMLInputElement) {
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
}

let container: HTMLElement
let root: ReturnType<typeof createRoot>

test('app khởi động, tạo dữ liệu mặc định và dựng được màn hình một ô nhập', async () => {
  container = dom.window.document.getElementById('root')!
  root = createRoot(container)

  await act(async () => {
    root.render(createElement(App))
  })
  await waitFor(() => Boolean(container.querySelector('.composer-input')))

  assert.ok(container.querySelector('.hero-figure'), 'phải có con số lớn dẫn dắt')
  assert.ok(container.querySelector('.composer-input'), 'phải có ô nhập duy nhất')
  assert.equal(container.querySelectorAll('.nav').length, 0, 'không còn thanh tab')
  assert.equal(container.querySelectorAll('.fab').length, 0, 'không còn nút FAB')

  assert.equal(await db.wallets.count(), 3)
  assert.ok((await db.categories.count()) >= 10)
  assert.equal(await db.settings.count(), 1)

  const slugs = (await db.categories.toArray()).map((c) => c.slug).filter(Boolean)
  for (const slug of ['uncategorized-expense', 'uncategorized-income', 'reconcile-expense', 'reconcile-income']) {
    assert.ok(slugs.includes(slug as never), `thiếu danh mục hệ thống ${slug}`)
  }
})

test('gõ một dòng vào ô nhập thì ghi được giao dịch thật', async () => {
  const input = container.querySelector('.composer-input') as HTMLInputElement
  const before = await db.transactions.count()

  await act(async () => {
    type(input, 'cà phê 35k')
  })
  await waitFor(() => (container.querySelector('.composer-preview')?.textContent ?? '').includes('Ăn uống'))

  await act(async () => {
    pressEnter(input)
  })
  await waitFor(async () => (await db.transactions.count()) === before + 1)

  const saved = (await db.transactions.toArray()).at(-1)!
  assert.equal(saved.amount, 35_000)
  assert.equal(saved.kind, 'expense')
  assert.equal(saved.source, 'quick')
  await waitFor(() => input.value === '')
  assert.equal(input.value, '', 'ô nhập phải được dọn sau khi ghi')
})

test('gõ một câu hỏi thì trả lời ngay tại chỗ, không tạo giao dịch', async () => {
  const input = container.querySelector('.composer-input') as HTMLInputElement
  const before = await db.transactions.count()

  await act(async () => {
    type(input, 'tháng này chi bao nhiêu')
  })
  await waitFor(() => (container.querySelector('.composer-preview')?.textContent ?? '').includes('hỏi'))

  await act(async () => {
    pressEnter(input)
  })
  await waitFor(() => Boolean(container.querySelector('.answer-figure')))

  assert.equal(await db.transactions.count(), before, 'câu hỏi không được tạo giao dịch')
  assert.ok(container.querySelector('.answer-close'), 'phải có lối quay lại')
})

test('gõ một lệnh thì mở màn hình phụ', async () => {
  const input = container.querySelector('.composer-input') as HTMLInputElement

  await act(async () => {
    type(input, 'ngân sách')
  })
  await act(async () => {
    pressEnter(input)
  })
  await waitFor(() => Boolean(dom.window.document.querySelector('.full-sheet')))

  const sheet = dom.window.document.querySelector('.full-sheet')!
  assert.ok((sheet.textContent ?? '').includes('Ngân sách'))

  const close = sheet.querySelector('.icon-btn') as HTMLButtonElement
  await act(async () => {
    close.click()
  })
  await waitFor(() => !dom.window.document.querySelector('.full-sheet'))

  await act(async () => {
    root.unmount()
  })
})

test('ghi nhanh một dòng tạo ra giao dịch thật trong IndexedDB', async () => {
  const { parseQuickEntry } = await import('../src/lib/quickadd')
  const { addTransaction } = await import('../src/lib/actions')

  const categories = await db.categories.toArray()
  const wallets = await db.wallets.toArray()
  const parsed = parseQuickEntry('cà phê 35k', categories, [])
  assert.ok(parsed)

  const before = await db.transactions.count()
  await addTransaction({
    kind: parsed.kind,
    amount: parsed.amount,
    categoryId: parsed.categoryId ?? categories[0].id!,
    walletId: wallets[0].id!,
    date: parsed.date,
    note: parsed.note,
    source: 'quick',
  })

  assert.equal(await db.transactions.count(), before + 1)
  const saved = (await db.transactions.toArray()).at(-1)!
  assert.equal(saved.amount, 35_000)
  assert.equal(saved.kind, 'expense')
  assert.equal(saved.source, 'quick')
})

test('đối soát số dư sinh đúng khoản bù chênh lệch', async () => {
  const { reconcileWallet } = await import('../src/lib/actions')
  const { walletBalances } = await import('../src/lib/stats')

  const wallets = await db.wallets.toArray()
  const categories = await db.categories.toArray()
  const transactions = await db.transactions.toArray()
  const wallet = wallets[0]

  const computed = walletBalances(wallets, transactions).get(wallet.id!)!
  const counted = computed - 200_000

  const result = await reconcileWallet(wallet, computed, counted, categories, '2026-09-20')
  assert.equal(result.difference, -200_000)
  assert.equal(result.createdKind, 'expense')

  const adjustment = (await db.transactions.toArray()).find((t) => t.source === 'reconcile')!
  assert.equal(adjustment.amount, 200_000)
  assert.equal(adjustment.estimated, true)
  const reconcileCat = categories.find((c) => c.id === adjustment.categoryId)!
  assert.equal(reconcileCat.slug, 'reconcile-expense')

  // Sau doi soat, so du app tinh phai khop so dem duoc
  const after = walletBalances(await db.wallets.toArray(), await db.transactions.toArray()).get(wallet.id!)
  assert.equal(after, counted)

  const updated = await db.wallets.get(wallet.id!)
  assert.equal(updated?.lastReconciledAt, '2026-09-20')
})

test('đánh dấu ngày không chi tiêu làm kín khoảng trống dữ liệu', async () => {
  const { markNoSpend } = await import('../src/lib/actions')
  const { computeCoverage } = await import('../src/lib/coverage')
  const { toISO } = await import('../src/lib/date')

  const d = new Date()
  d.setDate(d.getDate() - 1)
  const yesterday = toISO(d)

  await markNoSpend(yesterday)
  await markNoSpend(yesterday) // goi hai lan khong duoc tao ban ghi trung
  assert.equal((await db.dayMarks.where('date').equals(yesterday).toArray()).length, 1)

  const coverage = computeCoverage([], await db.dayMarks.toArray(), 3, yesterday)
  assert.equal(coverage.gaps.includes(yesterday), false)
})

test('dữ liệu mẫu tạo ra đủ các tình huống app cần minh hoạ', async () => {
  const { loadDemoData, primeOpeningBalances } = await import('../src/lib/demo')
  const { computeCoverage, firstActivity } = await import('../src/lib/coverage')
  const { walletBalances, sumTotals } = await import('../src/lib/stats')

  await primeOpeningBalances(await db.wallets.toArray())
  const summary = await loadDemoData()
  assert.ok(summary.transactions > 200, 'phải có đủ giao dịch cho 3 tháng')

  const transactions = await db.transactions.toArray()
  const wallets = await db.wallets.toArray()
  const categories = await db.categories.toArray()
  const dayMarks = await db.dayMarks.toArray()

  // Co ca thu lan chi
  const totals = sumTotals(transactions)
  assert.ok(totals.income > 0 && totals.expense > 0)

  // Tong so du khong am — de man hinh Tong quan doc duoc
  const balances = walletBalances(wallets, transactions)
  const netWorth = wallets.reduce((s, w) => s + (balances.get(w.id!) ?? 0), 0)
  assert.ok(netWorth > 0, `tổng số dư phải dương, đang là ${netWorth}`)

  // Con khoang trong de minh hoa co che lap
  const coverage = computeCoverage(transactions, dayMarks, 30, firstActivity(transactions, dayMarks))
  assert.ok(coverage.gaps.length > 0, 'phải còn ngày trống để minh hoạ')
  assert.ok(coverage.ratio > 0.7, 'nhưng độ phủ vẫn phải cao')

  // Co ngay duoc danh dau khong chi tieu
  assert.ok(dayMarks.length > 0)

  // Co but toan doi soat va khoan cho phan loai
  assert.ok(transactions.some((t) => t.source === 'reconcile' && t.estimated))
  const uncategorized = categories.find((c) => c.slug === 'uncategorized-expense')!
  assert.equal(transactions.filter((t) => t.categoryId === uncategorized.id).length, 3)

  // Ngan sach va khoan dinh ky
  assert.equal((await db.budgets.toArray()).length, 4)
  assert.equal((await db.recurring.toArray()).length, 2)

  // Nap lai lan hai khong nhan doi du lieu
  const again = await loadDemoData()
  assert.equal((await db.transactions.toArray()).length, again.transactions)
})
