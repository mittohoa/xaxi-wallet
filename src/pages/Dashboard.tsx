import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GapFiller } from '../components/GapFiller'
import { QuickAdd } from '../components/QuickAdd'
import { ReceiptSheet } from '../components/ReceiptSheet'
import { ReconcileSheet } from '../components/ReconcileSheet'
import { DailyBars } from '../components/charts'
import { TransactionList } from '../components/TransactionList'
import { Money } from '../components/ui'
import { db } from '../db/db'
import { computeCoverage, firstActivity } from '../lib/coverage'
import { currentMonth, monthLabel, monthRange, todayISO } from '../lib/date'
import { formatMoney } from '../lib/format'
import { byCategory, dailySeries, inRange, sumTotals, walletBalances } from '../lib/stats'
import { useApp } from '../store'
import type { Transaction } from '../types'

function daysSince(iso: string | undefined): number | null {
  if (!iso) return null
  const then = new Date(`${iso}T00:00:00`)
  return Math.floor((Date.now() - then.getTime()) / 86_400_000)
}

export function Dashboard({ onEdit, onNew }: { onEdit: (tx: Transaction) => void; onNew: () => void }) {
  const { transactions, wallets, categories, dayMarks, settings, toast } = useApp()
  const [sheet, setSheet] = useState<'receipt' | 'reconcile' | null>(null)

  const month = currentMonth()
  const range = monthRange(month, settings.startDayOfMonth)
  const monthTx = useMemo(() => inRange(transactions, range.start, range.end), [transactions, range.start, range.end])
  const totals = useMemo(() => sumTotals(monthTx), [monthTx])

  const balances = useMemo(() => walletBalances(wallets, transactions), [wallets, transactions])
  const netWorth = useMemo(
    () => wallets.filter((w) => !w.archived).reduce((s, w) => s + (balances.get(w.id!) ?? 0), 0),
    [wallets, balances],
  )

  const series = useMemo(() => dailySeries(monthTx, month), [monthTx, month])
  const topCategories = useMemo(() => byCategory(monthTx, categories, 'expense').slice(0, 5), [monthTx, categories])
  const recent = useMemo(() => [...transactions].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6), [transactions])

  const coverage = useMemo(
    () => computeCoverage(transactions, dayMarks, settings.gapWindowDays, firstActivity(transactions, dayMarks)),
    [transactions, dayMarks, settings.gapWindowDays],
  )

  // Hop cho phan loai: cac khoan ghi nhanh chua chon danh muc cu the
  const uncategorizedIds = new Set(
    categories.filter((c) => c.slug === 'uncategorized-expense' || c.slug === 'uncategorized-income').map((c) => c.id),
  )
  const inbox = useMemo(
    () =>
      transactions
        .filter((t) => uncategorizedIds.has(t.categoryId) && t.source !== 'reconcile')
        .sort((a, b) => b.createdAt - a.createdAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, categories],
  )

  const staleWallet = wallets
    .filter((w) => !w.archived)
    .map((w) => ({ wallet: w, days: daysSince(w.lastReconciledAt) }))
    .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999))[0]
  const reconcileDue =
    settings.reconcileEveryDays > 0 &&
    staleWallet &&
    (staleWallet.days === null || staleWallet.days >= settings.reconcileEveryDays)

  const nudge = settings.nudgeAfterGapDays > 0 && coverage.currentGapStreak >= settings.nudgeAfterGapDays

  return (
    <>
      <div className="card hero">
        <div className="label">Tổng số dư</div>
        <div className="value">{formatMoney(netWorth)}</div>
        <div className="sub">
          {monthLabel(month)} · thu <Money value={totals.income} kind="income" /> · chi{' '}
          <Money value={totals.expense} kind="expense" />
        </div>
      </div>

      {(nudge || reconcileDue) && (
        <div className="card nudge">
          {nudge ? (
            <>
              <b>Đã {coverage.currentGapStreak} ngày chưa ghi gì.</b> Không cần nhớ lại từng khoản — lấp nhanh bên dưới
              hoặc đối soát số dư một lần là xong.
            </>
          ) : (
            <>
              <b>Đến hẹn đối soát số dư.</b> Nhìn số dư thật trong ví/app ngân hàng rồi gõ đúng một con số — app tự tính
              phần đã chi mà bạn chưa kịp ghi.
            </>
          )}
          <div className="nudge-actions">
            <button type="button" className="btn sm primary" onClick={() => setSheet('reconcile')}>
              Đối soát số dư
            </button>
            <button type="button" className="btn sm" onClick={() => setSheet('receipt')}>
              Dán biên lai
            </button>
          </div>
        </div>
      )}

      <QuickAdd onNeedDetail={onNew} />

      <div className="entry-row">
        <button type="button" className="btn" onClick={() => setSheet('receipt')}>
          📋 Dán biên lai
        </button>
        <button type="button" className="btn" onClick={() => setSheet('reconcile')}>
          ⚖️ Đối soát số dư
        </button>
      </div>

      {inbox.length > 0 && (
        <div className="card">
          <div className="card-title">
            Hộp chờ phân loại
            <span className="spacer" />
            <span className="hint" style={{ textTransform: 'none', letterSpacing: 0 }}>
              {inbox.length} khoản
            </span>
          </div>
          <div className="hint" style={{ marginBottom: 10 }}>
            Các khoản đã ghi nhưng chưa rõ danh mục. Tổng tiền vẫn đúng — phân loại lúc nào rảnh cũng được.
          </div>
          {inbox.slice(0, 4).map((t) => (
            <div key={t.id} className="inbox-row">
              <span className="inbox-note">{t.note || 'Không có ghi chú'}</span>
              <span className={`amount ${t.kind}`}>
                {t.kind === 'expense' ? '−' : '+'}
                {formatMoney(t.amount)}
              </span>
              <select
                className="input sm"
                value=""
                onChange={async (e) => {
                  const id = Number(e.target.value)
                  if (!id || !t.id) return
                  await db.transactions.update(t.id, { categoryId: id })
                  toast('Đã phân loại')
                }}
                aria-label={`Chọn danh mục cho khoản ${formatMoney(t.amount)}`}
              >
                <option value="">Chọn danh mục…</option>
                {categories
                  .filter((c) => c.kind === t.kind && !uncategorizedIds.has(c.id) && !c.slug)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
              </select>
            </div>
          ))}
          {inbox.length > 4 && (
            <Link to="/transactions" className="btn ghost sm" style={{ marginTop: 8 }}>
              Xem tất cả {inbox.length} khoản
            </Link>
          )}
        </div>
      )}

      <GapFiller />

      <div className="card">
        <div className="card-title">Chi theo ngày · {monthLabel(month)}</div>
        <DailyBars data={series} kind="expense" />
      </div>

      {topCategories.length > 0 && (
        <div className="card">
          <div className="card-title">
            Chi nhiều nhất tháng này
            <span className="spacer" />
            <Link to="/reports" className="hint" style={{ textTransform: 'none', letterSpacing: 0 }}>
              Báo cáo →
            </Link>
          </div>
          <div className="rank">
            {topCategories.map((slice) => (
              <div key={slice.category.id} className="rank-item">
                <span className="rank-label">
                  <span aria-hidden="true">{slice.category.icon}</span>
                  <span className="nm">{slice.category.name}</span>
                  <span className="rank-pct">{Math.round(slice.share * 100)}%</span>
                </span>
                <span className="rank-value">{formatMoney(slice.amount)}</span>
                <span className="rank-track">
                  <span
                    className="rank-fill"
                    style={{ width: `${Math.max(slice.share * 100, 2)}%`, background: 'var(--expense)' }}
                  />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">
          Gần đây
          <span className="spacer" />
          <Link to="/transactions" className="hint" style={{ textTransform: 'none', letterSpacing: 0 }}>
            Tất cả →
          </Link>
        </div>
        <TransactionList transactions={recent} onSelect={onEdit} showDayTotals={false} />
      </div>

      <div className="card">
        <div className="card-title">Ví của bạn</div>
        {wallets
          .filter((w) => !w.archived)
          .map((w) => {
            const days = daysSince(w.lastReconciledAt)
            return (
              <div key={w.id} className="row" style={{ cursor: 'default' }}>
                <span className="avatar" style={{ background: `color-mix(in srgb, ${w.color} 18%, transparent)` }}>
                  {w.icon}
                </span>
                <span className="body">
                  <span className="name">{w.name}</span>
                  <span className="meta">
                    {w.lastReconciledAt ? `Đối soát ${days === 0 ? 'hôm nay' : `${days} ngày trước`}` : 'Chưa đối soát lần nào'}
                  </span>
                </span>
                <span className="trail">{formatMoney(balances.get(w.id!) ?? 0)}</span>
              </div>
            )
          })}
      </div>

      <p className="footnote">
        Hôm nay {todayISO()} · toàn bộ dữ liệu nằm trên thiết bị này, không gửi đi đâu.
      </p>

      {sheet === 'receipt' && <ReceiptSheet onClose={() => setSheet(null)} />}
      {sheet === 'reconcile' && <ReconcileSheet onClose={() => setSheet(null)} />}
    </>
  )
}
