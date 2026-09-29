import { useEffect, useMemo, useRef, useState } from 'react'
import { AnswerView } from '../components/AnswerView'
import { Avatar } from '../components/ui'
import { addTransaction, markNoSpend, suggestShortcuts, systemCategory } from '../lib/actions'
import { detectRecurring, trainClassifier } from '../lib/learn'
import { db } from '../db/db'
import { listenOnce, stopListening, voiceReady } from '../lib/native/voice'
import { saveSettings } from '../store'
import { helpAnswer, interpret, type Answer, type CommandName } from '../lib/ask'
import { computeCoverage, firstActivity } from '../lib/coverage'
import { currentMonth, formatDateLong, monthRange, todayISO } from '../lib/date'
import { formatMoney } from '../lib/format'
import { inRange, sumTotals, walletBalances } from '../lib/stats'
import { useApp, useLookups } from '../store'
import type { Transaction } from '../types'

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

  const intent = useMemo(() => interpret(text, askContext), [text, askContext])

  const balances = useMemo(() => walletBalances(wallets, transactions), [wallets, transactions])
  const netWorth = useMemo(
    () => wallets.filter((w) => !w.archived).reduce((s, w) => s + (balances.get(w.id!) ?? 0), 0),
    [wallets, balances],
  )

  const month = currentMonth()
  const range = monthRange(month, settings.startDayOfMonth)
  const monthTotals = useMemo(
    () => sumTotals(inRange(transactions, range.start, range.end)),
    [transactions, range.start, range.end],
  )

  const coverage = useMemo(
    () => computeCoverage(transactions, dayMarks, settings.gapWindowDays, firstActivity(transactions, dayMarks)),
    [transactions, dayMarks, settings.gapWindowDays],
  )

  const shortcuts = useMemo(() => suggestShortcuts(transactions, categories, 5), [transactions, categories])
  const recent = useMemo(() => [...transactions].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8), [transactions])

  const today = todayISO()
  const todayLogged = transactions.some((t) => t.date === today) || dayMarks.some((m) => m.date === today)
  const defaultWalletId = wallets.find((w) => !w.archived)?.id ?? null

  const nudge = settings.nudgeAfterGapDays > 0 && coverage.currentGapStreak >= settings.nudgeAfterGapDays

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
          <button type="button" className="icon-btn console-gear" onClick={() => onCommand('settings')} aria-label="Cài đặt">
            ⚙️
          </button>
          <div className="hero-figure">{formatMoney(netWorth)}</div>
          <div className="hero-sub">
            {app.settings.currency === 'VND' ? 'tổng số dư' : 'balance'} · tháng {Number(month.slice(5, 7))}{' '}
            <b className={monthTotals.net < 0 ? 'amount expense' : 'amount income'}>
              {monthTotals.net < 0 ? '−' : '+'}
              {formatMoney(Math.abs(monthTotals.net))}
            </b>
          </div>
        </header>

        {answer ? (
          <section className="console-body">
            <button type="button" className="btn ghost sm answer-close" onClick={() => setAnswer(null)}>
              ← quay lại
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
                      await db.recurring.add({
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
                      })
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
                      <button key={t.id} type="button" className="row" onClick={() => onEditTransaction(t)}>
                        <Avatar icon={cat?.icon ?? '❓'} color={cat?.color ?? '#898781'} />
                        <span className="body">
                          <span className="name">{t.note || cat?.name || 'Không rõ'}</span>
                          <span className="meta">
                            {formatDateLong(t.date)} · {cat?.name ?? 'đã xoá'}
                          </span>
                        </span>
                        <span className={`trail amount ${t.kind}`}>
                          {t.kind === 'expense' ? '−' : '+'}
                          {formatMoney(t.amount)}
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
            <span className={`amount ${intent.parse.kind}`}>
              {intent.parse.kind === 'expense' ? '−' : '+'}
              {formatMoney(intent.parse.amount)}
            </span>
            <span className="sep">·</span>
            <span>
              {intent.category?.icon ?? '📦'} {intent.category?.name ?? 'Chưa phân loại'}
            </span>
            {intent.parse.reason === 'history' && <span className="tag">theo thói quen</span>}
            {intent.parse.reason === 'learned' && <span className="tag">app tự đoán</span>}
            {intent.parse.date !== today && <span className="tag">{formatDateLong(intent.parse.date)}</span>}
          </div>
        )}
        {intent.type === 'command' && (
          <div className="composer-preview">
            <span className="tag">↩ mở</span> {intent.label}
          </div>
        )}
        {intent.type === 'query' && text.trim().length > 0 && (
          <div className="composer-preview">
            <span className="tag">↩ hỏi</span> {intent.answer.title}
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
              {listening ? '⏹' : '🎙'}
            </button>
          )}
          <button
            type="button"
            className="composer-send"
            onClick={submit}
            disabled={intent.type === 'empty'}
            aria-label="Thực hiện"
          >
            ↩
          </button>
        </div>

        {!text && (
          <div className="composer-chips">
            {shortcuts.map((s, i) => (
              <button key={s.key} type="button" className="chip" onClick={() => runShortcut(i)}>
                <span style={{ color: `var(--${s.kind})`, fontWeight: 600 }}>
                  {s.kind === 'expense' ? '−' : '+'}
                  {formatMoney(s.amount)}
                </span>
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
