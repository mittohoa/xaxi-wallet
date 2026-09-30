import { useEffect, useMemo, useRef, useState } from 'react'
import { AnswerView } from '../components/AnswerView'
import { Avatar, Figure, Money, Tile } from '../components/ui'
import { addTransaction, duplicateTransaction, markNoSpend, suggestShortcuts, systemCategory } from '../lib/actions'
import { checkAmount, detectRecurring, trainClassifier } from '../lib/learn'
import { db, stamp, touch } from '../db/db'
import { listenOnce, stopListening, voiceReady } from '../lib/native/voice'
import { haptic } from '../lib/native/shell'
import { QUICK_EVENT, consumeQuickIntent, publishWidgetSummary } from '../lib/native/widget'
import { saveSettings } from '../store'
import { helpAnswer, interpret, type Answer, type CommandName } from '../lib/ask'
import { computeCoverage, firstActivity } from '../lib/coverage'
import { forecast, upcoming } from '../lib/foresight'
import { currentMonth, formatDateLong, monthLabel, monthRange, shiftMonth, todayISO } from '../lib/date'
import { formatMoney } from '../lib/format'
import { comparableRange, inRange, percentChange, sumTotals, walletBalances } from '../lib/stats'
import { useApp, useLookups } from '../store'
import type { Transaction } from '../types'
import { Icon } from '../components/Icon'
import { syncReminder } from '../lib/sync/reminder'

const PLACEHOLDERS = [
  'cà phê 35k',
  'xăng 100k hôm qua',
  'tháng này ăn uống bao nhiêu',
  '+15tr lương',
  'chi nhiều nhất vào việc gì',
  'còn bao nhiêu tiền',
]

/**
 * Man hinh duy nhat cua XAXI: mot o nhap lam tat ca.
 * Go de ghi, go de hoi, go de mo man hinh — khong tab, khong menu.
 */
export function Console({
  onCommand,
  onEditTransaction,
}: {
  onCommand: (command: CommandName) => void
  onEditTransaction: (tx: Transaction) => void
}) {
  const app = useApp()
  const { catById } = useLookups()
  const { transactions, wallets, categories, budgets, dayMarks, recurring, settings, toast } = app

  const [text, setText] = useState('')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [micAvailable, setMicAvailable] = useState(false)
  const [listening, setListening] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Hoi he thong mot lan xem co bo nhan dang giong noi khong
  useEffect(() => {
    voiceReady().then(setMicAvailable)
    return () => {
      stopListening()
    }
  }, [])

  async function speak() {
    if (listening) {
      await stopListening()
      setListening(false)
      return
    }
    setListening(true)
    try {
      const heard = await listenOnce()
      if (heard.trim()) {
        setText(heard.trim())
        inputRef.current?.focus()
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Không nhận dạng được giọng nói')
    } finally {
      setListening(false)
    }
  }

  // Goi y doi cho moi vai giay de nguoi dung biet o nhap lam duoc nhung gi
  useEffect(() => {
    if (text) return
    const t = window.setInterval(() => setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length), 4000)
    return () => window.clearInterval(t)
  }, [text])

  // Huan luyen lai khi lich su doi — chay tuc thi tren vai tram ban ghi,
  // va quan trong hon: chay tren may, khong goi ra ngoai.
  const guesser = useMemo(() => trainClassifier(transactions, categories), [transactions, categories])

  const askContext = useMemo(
    () => ({ transactions, categories, wallets, budgets, dayMarks, gapWindowDays: settings.gapWindowDays, guesser }),
    [transactions, categories, wallets, budgets, dayMarks, settings.gapWindowDays, guesser],
  )

  const dismissed = settings.dismissedSuggestions ?? []
  const suggestion = useMemo(
    () => detectRecurring(transactions, recurring, categories).filter((s) => !dismissed.includes(s.key))[0],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, recurring, categories, settings.dismissedSuggestions],
  )

  /**
   * Nhấn giữ một dòng để ghi lại y hệt, hôm nay.
   *
   * "Hôm nay lại đúng như hôm qua" là trường hợp rất hay gặp. Ghi ngay chứ
   * không hỏi lại — hỏi lại biến một chạm thành ba chạm, mà ba chạm thì đã
   * không còn là đường tắt nữa. Cái đỡ là nút Hoàn tác trên thông báo.
   *
   * `pressed` chặn lần chạm thường bắn ngay sau khi nhả tay: Android gửi cả
   * `pointerup` lẫn `click`, nếu không chặn thì vừa ghi bản sao vừa mở màn
   * hình sửa của bản gốc.
   */
  const holdTimer = useRef<number | undefined>(undefined)
  const pressed = useRef(false)

  async function duplicate(t: Transaction) {
    try {
      const id = await duplicateTransaction(t)
      haptic('heavy')
      toast(`Đã ghi lại ${formatMoney(t.amount)} · hôm nay`, {
        label: 'Hoàn tác',
        run: () => db.transactions.delete(id),
      })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Không ghi lại được')
    }
  }

  function startHold(t: Transaction) {
    pressed.current = false
    window.clearTimeout(holdTimer.current)
    holdTimer.current = window.setTimeout(() => {
      pressed.current = true
      duplicate(t)
    }, 550)
  }

  function endHold() {
    window.clearTimeout(holdTimer.current)
  }

  useEffect(() => () => window.clearTimeout(holdTimer.current), [])

  /**
   * Vào app từ nút "Ghi nhanh" trên widget thì đưa thẳng con trỏ vào ô nhập.
   *
   * Đây là toàn bộ điều widget làm được: bớt bước tìm app và bước điều hướng.
   * Ghi mà không mở app thì không làm được — ghi nghĩa là viết vào IndexedDB,
   * mà chỉ WebView làm được việc đó.
   */
  useEffect(() => {
    const focusInput = () => inputRef.current?.focus()
    consumeQuickIntent().then((quick) => {
      if (quick) focusInput()
    })
    const onQuick = () => {
      consumeQuickIntent().then((quick) => {
        if (quick) focusInput()
      })
    }
    window.addEventListener(QUICK_EVENT, onQuick)
    return () => window.removeEventListener(QUICK_EVENT, onQuick)
  }, [])

  const intent = useMemo(() => interpret(text, askContext), [text, askContext])

  /**
   * Số tiền vừa gõ có lệch hẳn khỏi thói quen của danh mục đó không.
   *
   * Bắt lỗi thừa số 0 ngay lúc gõ. Sáu tháng sau nhìn lại "cà phê 350.000₫"
   * thì không ai còn nhớ hôm đó có thật hay không — chặn ở đây là rẻ nhất.
   */
  const amountWarning = useMemo(() => {
    if (intent.type !== 'entry' || !intent.parse.categoryId) return null
    return checkAmount(intent.parse.amount, intent.parse.categoryId, intent.parse.kind, transactions)
  }, [intent, transactions])

  const balances = useMemo(() => walletBalances(wallets, transactions), [wallets, transactions])
  const netWorth = useMemo(
    () => wallets.filter((w) => !w.archived).reduce((s, w) => s + (balances.get(w.id) ?? 0), 0),
    [wallets, balances],
  )

  const month = currentMonth()
  const range = monthRange(month, settings.startDayOfMonth)
  const monthTotals = useMemo(
    () => sumTotals(inRange(transactions, range.start, range.end)),
    [transactions, range.start, range.end],
  )

  /**
   * Tổng của kỳ trước, đã cắt cho khớp số ngày kỳ này đã đi được.
   *
   * So tháng này mới đi mười hai ngày với cả tháng trước thì tháng nào cũng
   * ra "giảm mạnh" — xem `comparableRange`.
   */
  const prevTotals = useMemo(() => {
    const prev = monthRange(shiftMonth(month, -1), settings.startDayOfMonth)
    const cut = comparableRange(range, prev, todayISO())
    return sumTotals(inRange(transactions, cut.start, cut.end))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, month, range.start, range.end, settings.startDayOfMonth])

  const coverage = useMemo(
    () => computeCoverage(transactions, dayMarks, settings.gapWindowDays, firstActivity(transactions, dayMarks)),
    [transactions, dayMarks, settings.gapWindowDays],
  )

  /**
   * Dự báo cuối kỳ và các khoản định kỳ sắp tới.
   *
   * Cả hai chỉ đọc dữ liệu đã có, không đòi người dùng nhập thêm gì. Dự báo
   * nhận vào độ phủ dữ liệu và tự im lặng khi độ phủ quá thấp — dự báo từ dữ
   * liệu thủng là bịa số.
   */
  const outlook = useMemo(
    () => forecast(inRange(transactions, range.start, range.end), recurring, todayISO(), range, coverage.ratio),
    [transactions, recurring, range.start, range.end, coverage.ratio],
  )
  const soonest = useMemo(() => upcoming(recurring, todayISO(), range.end), [recurring, range.end])

  const shortcuts = useMemo(() => suggestShortcuts(transactions, categories, 5), [transactions, categories])
  // Moi lan chuyen tien la hai ban ghi — chi hien mot dong de khoi roi mat
  const recent = useMemo(() => {
    const seen = new Set<string>()
    return [...transactions]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((t) => {
        if (!t.transferId) return true
        if (seen.has(t.transferId)) return false
        seen.add(t.transferId)
        return t.kind === 'expense'
      })
      .slice(0, 8)
  }, [transactions])

  // Hop cho phan loai: cac khoan da ghi nhung chua ro danh muc.
  // Tong tien van dung — phan loai luc nao ranh cung duoc.
  const inbox = useMemo(() => {
    const pending = new Set(
      categories.filter((c) => c.slug === 'uncategorized-expense' || c.slug === 'uncategorized-income').map((c) => c.id),
    )
    return transactions
      .filter((t) => pending.has(t.categoryId) && t.source !== 'reconcile' && !t.transferId)
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [transactions, categories])

  const today = todayISO()
  const todayLogged = transactions.some((t) => t.date === today) || dayMarks.some((m) => m.date === today)
  const defaultWalletId = wallets.find((w) => !w.archived)?.id ?? null

  const nudge = settings.nudgeAfterGapDays > 0 && coverage.currentGapStreak >= settings.nudgeAfterGapDays

  /*
   * Nhắc mang dữ liệu sang máy kia.
   *
   * Đồng bộ là BẤM NÚT — không có máy chủ thì không có cách nào khác (xem
   * lib/sync/reminder.ts). Lời nhắc này là nửa còn lại của quyết định đó.
   */
  const syncNhac = useMemo(
    () => syncReminder(settings.lastSyncAt, transactions.map((t) => t.updatedAt)),
    [settings.lastSyncAt, transactions],
  )

  /**
   * Giữ bản tóm tắt của tiện ích màn hình chính khớp với dữ liệu.
   *
   * Chạy lại mỗi khi số liệu đổi. Không cần giảm nhịp gọi: đây chỉ là ghi vài
   * chuỗi vào SharedPreferences rồi vẽ lại widget, và số liệu chỉ đổi khi người
   * dùng ghi một khoản — không phải luồng dữ liệu liên tục.
   */
  const todaySpent = useMemo(() => {
    const t = todayISO()
    return sumTotals(inRange(transactions, t, t)).expense
  }, [transactions])

  useEffect(() => {
    publishWidgetSummary({
      today: formatMoney(todaySpent),
      month: formatMoney(monthTotals.expense),
      monthLabel: monthLabel(month),
      hint: nudge ? `Đã ${coverage.currentGapStreak} ngày chưa ghi gì` : '',
    })
  }, [todaySpent, monthTotals.expense, month, nudge, coverage.currentGapStreak])


  async function submit() {
    if (intent.type === 'empty') return

    if (intent.type === 'command') {
      // Huong dan hien ngay tai cho, khong can mo them man hinh nao
      if (intent.command === 'help') setAnswer(helpAnswer())
      else onCommand(intent.command)
      setText('')
      return
    }

    if (intent.type === 'query') {
      setAnswer(intent.answer)
      setText('')
      return
    }

    const { parse } = intent
    const category =
      intent.category ??
      systemCategory(categories, parse.kind === 'income' ? 'uncategorized-income' : 'uncategorized-expense')
    if (!category?.id || defaultWalletId == null) {
      toast('Chưa có ví hoặc danh mục để ghi vào')
      return
    }

    await addTransaction({
      kind: parse.kind,
      amount: parse.amount,
      categoryId: category.id,
      walletId: defaultWalletId,
      date: parse.date,
      note: parse.note,
      source: 'quick',
    })
    setText('')
    setAnswer(null)
    haptic()
    toast(`${parse.kind === 'expense' ? '−' : '+'}${formatMoney(parse.amount)} · ${category.name}`)
  }

  async function runShortcut(index: number) {
    const s = shortcuts[index]
    if (!s || defaultWalletId == null) return
    await addTransaction({
      kind: s.kind,
      amount: s.amount,
      categoryId: s.categoryId,
      walletId: defaultWalletId,
      note: s.note,
      source: 'quick',
    })
    haptic()
    toast(`${s.kind === 'expense' ? '−' : '+'}${formatMoney(s.amount)} · ${s.label}`)
  }

  function ask(question: string) {
    setText(question)
    inputRef.current?.focus()
  }

  return (
    <div className="console">
      <div className="console-scroll">
        <header className="console-hero">
          {/* Hàng riêng cho bánh răng: đặt tuyệt đối thì thẻ số dư che mất nó */}
          <div className="hero-top">
            <button type="button" className="icon-btn console-gear" onClick={() => onCommand('settings')} aria-label="Cài đặt">
              <Icon name="settings" />
            </button>
          </div>
          {/*
            Số dư nằm TRONG một tấm thẻ, không trôi trần trên nền.

            Đây là khác biệt lớn nhất so với bộ mẫu tham khảo: mẫu nào cũng biến
            số dư thành một *vật thể* có nền, có màu thương hiệu, có thông tin
            phụ nằm bên trong. Con số trần thì màn hình chỉ có trọng tâm chữ chứ
            không có trọng tâm thị giác — nhìn ra một bảng điều khiển, không ra
            một app.

            Thẻ mang màu lime ở CẢ hai chế độ sáng và tối, cùng luật với
            `.panel-ink` (§2 hệ thống thiết kế): màu thương hiệu là cố định, nhờ
            vậy chỉ cần kiểm định một lần.
          */}
          <div className="hero-card">
            <span className="hero-card-label">
              {app.settings.currency === 'VND' ? 'Tổng số dư' : 'Balance'}
            </span>
            <div className="hero-figure"><Figure value={netWorth} /></div>
            <div className="hero-sub">
              tháng {Number(month.slice(5, 7))}{' '}
              <b>
                {monthTotals.net < 0 ? '−' : '+'}
                {formatMoney(Math.abs(monthTotals.net))}
              </b>
            </div>
          </div>

          {/*
            Bốn lối tắt hay dùng nhất.

            Không thay ô nhập — gõ vẫn là đường chính. Nhưng bộ mẫu nào cũng có
            một hàng như thế này ngay dưới thẻ, và nó làm hai việc: cho màn hình
            một cấu trúc, và cho người mới biết app làm được gì mà không phải
            đoán nên gõ chữ nào.
          */}
          <div className="hero-actions">
            <button type="button" onClick={() => onCommand('newEntry')}>
              <span className="ha-ico"><Icon name="plus" /></span>
              Ghi khoản
            </button>
            <button type="button" onClick={() => onCommand('transfer')}>
              <span className="ha-ico"><Icon name="swap" /></span>
              Chuyển ví
            </button>
            <button type="button" onClick={() => onCommand('reconcile')}>
              <span className="ha-ico"><Icon name="check" /></span>
              Đối soát
            </button>
            <button type="button" onClick={() => onCommand('reports')}>
              <span className="ha-ico"><Icon name="chart" /></span>
              Báo cáo
            </button>
          </div>

          <div className="hero-tiles">
            <Tile
              label="Thu tháng này"
              kind="up"
              value={monthTotals.income}
              delta={percentChange(monthTotals.income, prevTotals.income)}
            />
            <Tile
              label="Chi tháng này"
              kind="down"
              value={monthTotals.expense}
              delta={percentChange(monthTotals.expense, prevTotals.expense)}
            />
          </div>
        </header>

        {answer ? (
          <section className="console-body">
            <button type="button" className="btn ghost sm answer-close" onClick={() => setAnswer(null)}>
              <Icon name="back" /> quay lại
            </button>
            <AnswerView answer={answer} onPick={ask} />
          </section>
        ) : (
          <section className="console-body">
            {nudge && (
              <div className="nudge">
                <b>Đã {coverage.currentGapStreak} ngày chưa ghi gì.</b> Không cần nhớ lại từng khoản — gõ{' '}
                <code>đối soát</code> để bù một lần.
                <div className="nudge-actions">
                  <button type="button" className="btn sm primary" onClick={() => onCommand('reconcile')}>
                    Đối soát số dư
                  </button>
                  <button type="button" className="btn sm" onClick={() => onCommand('receipt')}>
                    Dán biên lai
                  </button>
                </div>
              </div>
            )}

            {!nudge && syncNhac && (
              <div className="nudge">
                <b>{syncNhac.pending} khoản chưa mang sang máy kia.</b> Lần đồng bộ gần nhất là {syncNhac.days} ngày
                trước.
                <div className="nudge-actions">
                  <button type="button" className="btn sm primary" onClick={() => onCommand('settings')}>
                    Mở đồng bộ
                  </button>
                </div>
              </div>
            )}

            {suggestion && (
              <div className="suggest">
                <div className="suggest-head">
                  <span className="suggest-badge">tự nhận ra</span>
                  <span className="suggest-count">{suggestion.occurrences} lần {suggestion.freq === 'monthly' ? 'hằng tháng' : 'hằng tuần'}</span>
                </div>
                <div className="suggest-body">
                  Bạn ghi <b>{suggestion.name}</b> {formatMoney(suggestion.amount)}{' '}
                  {suggestion.freq === 'monthly' ? `vào ngày ${suggestion.anchor} mỗi tháng` : 'mỗi tuần'}. Để app tự ghi
                  giúp, khỏi phải nhớ?
                </div>
                <div className="nudge-actions">
                  <button
                    type="button"
                    className="btn sm primary"
                    onClick={async () => {
                      await db.recurring.add(
                        stamp({
                          name: suggestion.name,
                          kind: suggestion.kind,
                          amount: suggestion.amount,
                          categoryId: suggestion.categoryId,
                          walletId: suggestion.walletId,
                          freq: suggestion.freq,
                          anchor: suggestion.anchor,
                          nextDate: suggestion.nextDate,
                          active: true,
                          note: suggestion.name,
                        }),
                      )
                      haptic('heavy')
                      toast(`Đã tự động hoá "${suggestion.name}"`)
                    }}
                  >
                    Tự ghi từ nay
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => saveSettings({ dismissedSuggestions: [...dismissed, suggestion.key] })}
                  >
                    Không cần
                  </button>
                </div>
              </div>
            )}

            {(outlook.confident || soonest.length > 0) && (
              <>
                <div className="console-section">sắp tới</div>
                <div className="card">
                  {outlook.confident && (
                    <div className="forecast">
                      <div className="forecast-figure">
                        <Money value={outlook.projected} />
                      </div>
                      <div className="hint">
                        Dự báo chi cả tháng theo nhịp hiện tại. Đã chi <b>{formatMoney(outlook.spent)}</b>, còn{' '}
                        {outlook.daysLeft} ngày
                        {outlook.committed > 0 && (
                          <> · trong đó {formatMoney(outlook.committed)} là khoản định kỳ chắc chắn phát sinh</>
                        )}
                        .
                      </div>
                    </div>
                  )}

                  {soonest.map((u) => (
                    <div key={u.rule.id} className="row" style={{ cursor: 'default' }}>
                      <span className="avatar" style={{ background: 'var(--surface-2)' }} aria-hidden="true">
                        <Icon name="repeat" />
                      </span>
                      <span className="body">
                        <span className="name">{u.rule.name}</span>
                        <span className="meta">
                          {u.daysAway === 0 ? 'Hôm nay' : u.daysAway === 1 ? 'Ngày mai' : `Còn ${u.daysAway} ngày`} ·{' '}
                          {formatDateLong(u.date)}
                        </span>
                      </span>
                      <span className={`trail amount ${u.rule.kind}`}>
                        {u.rule.kind === 'expense' ? '−' : '+'}
                        {formatMoney(u.rule.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {inbox.length > 0 && (
              <>
                <div className="console-section">
                  chờ phân loại · {inbox.length} khoản
                </div>
                <div className="list">
                  {inbox.slice(0, 3).map((t) => (
                    <div key={t.id} className="row inbox-pending">
                      <span className="body">
                        <span className="name">{t.note || 'Không có ghi chú'}</span>
                        <span className="meta">{formatDateLong(t.date)}</span>
                      </span>
                      <span className="trail">
                        <Money value={t.amount} kind={t.kind} signed />
                      </span>
                      <select
                        className="input sm inbox-pick"
                        value=""
                        aria-label={`Chọn danh mục cho khoản ${formatMoney(t.amount)}`}
                        onChange={async (e) => {
                          if (!e.target.value) return
                          await db.transactions.update(t.id, { ...touch(), categoryId: e.target.value })
                          toast('Đã phân loại')
                        }}
                      >
                        <option value="">Chọn…</option>
                        {categories
                          .filter((c) => c.kind === t.kind && !c.slug)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.icon} {c.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  ))}
                </div>
                {inbox.length > 3 && (
                  <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => onCommand('history')}>
                    Xem tất cả {inbox.length} khoản
                  </button>
                )}
              </>
            )}

            {recent.length === 0 ? (
              <div className="console-onboard">
                <p>
                  Gõ <code>cà phê 35k</code> rồi nhấn Enter là xong một khoản.
                </p>
                <p>
                  Muốn hỏi thì cũng gõ vào đây: <code>tháng này chi bao nhiêu</code>.
                </p>
                <button type="button" className="btn sm" onClick={() => ask('?')}>
                  Xem gõ được những gì
                </button>
              </div>
            ) : (
              <>
                <div className="console-section">gần đây</div>
                <div className="list">
                  {recent.map((t) => {
                    const cat = catById.get(t.categoryId)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className="row"
                        onClick={() => {
                          if (pressed.current) return
                          onEditTransaction(t)
                        }}
                        onPointerDown={() => startHold(t)}
                        onPointerUp={endHold}
                        onPointerLeave={endHold}
                        onPointerCancel={endHold}
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        <Avatar icon={cat?.icon ?? '❓'} color={cat?.color ?? '#898781'} />
                        <span className="body">
                          <span className="name">{t.note || cat?.name || 'Không rõ'}</span>
                          <span className="meta">
                            {formatDateLong(t.date)} · {cat?.name ?? 'đã xoá'}
                          </span>
                        </span>
                        <span className="trail">
                          <Money value={t.amount} kind={t.kind} signed />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </section>
        )}
      </div>

      <div className="composer">
        {intent.type === 'entry' && (
          <div className="composer-preview">
            <Money value={intent.parse.amount} kind={intent.parse.kind} signed />
            <span className="sep">·</span>
            <span>
              {intent.category?.icon ?? '📦'} {intent.category?.name ?? 'Chưa phân loại'}
            </span>
            {intent.parse.reason === 'history' && <span className="tag">theo thói quen</span>}
            {intent.parse.reason === 'learned' && <span className="tag">app tự đoán</span>}
            {intent.parse.date !== today && <span className="tag">{formatDateLong(intent.parse.date)}</span>}
          </div>
        )}

        {/*
          Cảnh báo số tiền lệch hẳn thói quen, hiện TRƯỚC khi nhấn Enter.
          Không chặn — người dùng vẫn ghi được nếu số đó đúng thật. App chỉ hỏi
          lại, không phán xét.
        */}
        {amountWarning && (
          <div className="composer-warn">
            {amountWarning.likelyZeroTypo ? (
              <>
                Nghi thừa một số 0 — danh mục này thường quanh <b>{formatMoney(amountWarning.typical)}</b>. Nhấn Enter
                nếu <b>{formatMoney(intent.type === 'entry' ? intent.parse.amount : 0)}</b> là đúng.
              </>
            ) : (
              <>
                Lớn gấp {Math.round(amountWarning.ratio)} lần mức thường gặp của danh mục này (<b>
                {formatMoney(amountWarning.typical)}</b>). Nhấn Enter nếu đúng vậy.
              </>
            )}
          </div>
        )}
        {intent.type === 'command' && (
          <div className="composer-preview">
            <span className="tag">
              <Icon name="enter" /> mở
            </span> {intent.label}
          </div>
        )}
        {intent.type === 'query' && text.trim().length > 0 && (
          <div className="composer-preview">
            <span className="tag">
              <Icon name="enter" /> hỏi
            </span> {intent.answer.title}
          </div>
        )}

        <div className="composer-row">
          <input
            ref={inputRef}
            className="composer-input"
            value={text}
            placeholder={listening ? 'Đang nghe…' : PLACEHOLDERS[placeholderIndex]}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') setText('')
            }}
            aria-label="Gõ để ghi hoặc để hỏi"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          {micAvailable && !text && (
            <button
              type="button"
              className={listening ? 'composer-mic listening' : 'composer-mic'}
              onClick={speak}
              aria-label={listening ? 'Đang nghe, chạm để dừng' : 'Nói để ghi'}
            >
              <Icon name={listening ? 'stop' : 'mic'} />
            </button>
          )}
          <button
            type="button"
            className="composer-send"
            onClick={submit}
            disabled={intent.type === 'empty'}
            aria-label="Thực hiện"
          >
            <Icon name="enter" />
          </button>
        </div>

        {!text && (
          <div className="composer-chips">
            {/*
              Bỏ chip "Ghi đầy đủ": hàng nút tròn phía trên đã gọi đúng lệnh đó,
              và nút tròn nổi hơn nhiều. Chỗ trống ở đây nhường cho các lối tắt
              app tự học từ thói quen — thứ có giá trị riêng cho từng người.
            */}
            {shortcuts.map((s, i) => (
              <button key={s.key} type="button" className="chip" onClick={() => runShortcut(i)}>
                <Money value={s.amount} kind={s.kind} signed />
                <span className="nm">{s.label}</span>
              </button>
            ))}
            {!todayLogged && (
              <button
                type="button"
                className="chip"
                onClick={async () => {
                  await markNoSpend(today)
                  toast('Hôm nay không chi tiêu')
                }}
              >
                Hôm nay không chi
              </button>
            )}
            <button type="button" className="chip" onClick={() => ask('?')}>
              ?
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
