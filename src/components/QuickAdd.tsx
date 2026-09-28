import { useMemo, useState } from 'react'
import { addTransaction, markNoSpend, suggestShortcuts, systemCategory } from '../lib/actions'
import { formatMoney } from '../lib/format'
import { parseQuickEntry } from '../lib/quickadd'
import { formatDate, todayISO } from '../lib/date'
import { useApp } from '../store'

/**
 * O nhap mot dong — cach nhanh nhat de ghi mot khoan.
 * Kem phim tat tu hoc va nut 'khong chi tieu hom nay'.
 */
export function QuickAdd({ onNeedDetail }: { onNeedDetail: () => void }) {
  const { categories, wallets, transactions, dayMarks, toast } = useApp()
  const [text, setText] = useState('')

  const defaultWalletId = wallets.find((w) => !w.archived)?.id ?? null
  const parsed = useMemo(() => parseQuickEntry(text, categories, transactions), [text, categories, transactions])
  const shortcuts = useMemo(() => suggestShortcuts(transactions, categories), [transactions, categories])

  const today = todayISO()
  const todayHasData = transactions.some((t) => t.date === today) || dayMarks.some((m) => m.date === today)

  const previewCategory = parsed
    ? (categories.find((c) => c.id === parsed.categoryId) ??
      systemCategory(categories, parsed.kind === 'income' ? 'uncategorized-income' : 'uncategorized-expense'))
    : undefined

  async function submit() {
    if (!parsed || !previewCategory?.id || defaultWalletId == null) return
    await addTransaction({
      kind: parsed.kind,
      amount: parsed.amount,
      categoryId: previewCategory.id,
      walletId: defaultWalletId,
      date: parsed.date,
      note: parsed.note,
      source: 'quick',
    })
    setText('')
    toast(`Đã ghi ${formatMoney(parsed.amount)} · ${previewCategory.name}`)
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
    toast(`Đã ghi ${s.label} · ${formatMoney(s.amount)}`)
  }

  return (
    <div className="card">
      <div className="quick-row">
        <input
          className="input"
          placeholder="Ghi nhanh: cà phê 35k"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          aria-label="Ghi nhanh một khoản"
        />
        <button type="button" className="btn primary" onClick={submit} disabled={!parsed}>
          Ghi
        </button>
      </div>

      {parsed ? (
        <div className="quick-preview">
          <span className={`amount ${parsed.kind}`}>
            {parsed.kind === 'expense' ? '−' : '+'}
            {formatMoney(parsed.amount)}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {previewCategory?.icon} {previewCategory?.name}
            {parsed.reason === 'history' && <em className="tag"> theo thói quen</em>}
            {parsed.reason === 'none' && <em className="tag"> chưa phân loại</em>}
          </span>
          {parsed.date !== today && (
            <>
              <span aria-hidden="true">·</span>
              <span>{formatDate(parsed.date)}</span>
            </>
          )}
        </div>
      ) : (
        <div className="hint" style={{ marginTop: 8 }}>
          Gõ tắt được: <code>xăng 100k hôm qua</code> · <code>+15tr lương</code> · <code>ăn trưa 50k</code>
        </div>
      )}

      {shortcuts.length > 0 && (
        <>
          <div className="card-title" style={{ marginTop: 16, marginBottom: 8 }}>
            Phím tắt <span className="hint" style={{ textTransform: 'none', letterSpacing: 0 }}>· app tự học từ thói quen của bạn</span>
          </div>
          <div className="chips">
            {shortcuts.map((s, i) => (
              <button key={s.key} type="button" className="chip" onClick={() => runShortcut(i)}>
                <span style={{ color: `var(--${s.kind})`, fontWeight: 600 }}>
                  {s.kind === 'expense' ? '−' : '+'}
                  {formatMoney(s.amount)}
                </span>
                <span className="nm">{s.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="quick-actions">
        <button type="button" className="btn ghost sm" onClick={onNeedDetail}>
          ＋ Nhập đầy đủ
        </button>
        <span className="spacer" />
        {!todayHasData && (
          <button
            type="button"
            className="btn sm"
            onClick={async () => {
              await markNoSpend(today)
              toast('Đã đánh dấu hôm nay không chi tiêu')
            }}
          >
            Hôm nay không chi tiêu
          </button>
        )}
      </div>
    </div>
  )
}
