import { useMemo, useState } from 'react'
import { addTransaction, markNoSpend, systemCategory } from '../lib/actions'
import { computeCoverage, firstActivity } from '../lib/coverage'
import { formatDateLong } from '../lib/date'
import { formatMoney, parseAmount } from '../lib/format'
import { useApp } from '../store'

/**
 * Lap khoang trong du lieu: liet ke nhung ngay chua ghi gi,
 * moi ngay chi can mot cham ('khong chi tieu') hoac mot con so uoc luong.
 *
 * Muc tieu la giu du lieu tron ven khi nguoi dung ban — chu khong phai
 * ep ho nho lai chinh xac tung khoan da chi.
 */
export function GapFiller() {
  const { transactions, dayMarks, categories, wallets, settings, toast } = useApp()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState(false)

  const coverage = useMemo(
    () => computeCoverage(transactions, dayMarks, settings.gapWindowDays, firstActivity(transactions, dayMarks)),
    [transactions, dayMarks, settings.gapWindowDays],
  )

  const walletId = wallets.find((w) => !w.archived)?.id
  const fallbackCategory = systemCategory(categories, 'uncategorized-expense')
  const visible = expanded ? coverage.gaps : coverage.gaps.slice(0, 3)

  if (coverage.gaps.length === 0) {
    return (
      <div className="card">
        <div className="card-title">Độ phủ dữ liệu</div>
        <div className="coverage-line">
          <div className="meter" style={{ flex: 1 }}>
            <i style={{ width: '100%', background: 'var(--good)' }} />
          </div>
          <b>100%</b>
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          Không còn ngày nào bỏ trống trong {coverage.window} ngày qua.
        </div>
      </div>
    )
  }

  async function fill(date: string) {
    const text = drafts[date] ?? ''
    const amount = parseAmount(text)
    if (!Number.isFinite(amount) || amount <= 0 || !fallbackCategory?.id || walletId == null) return
    await addTransaction({
      kind: 'expense',
      amount,
      categoryId: fallbackCategory.id,
      walletId,
      date,
      note: 'Ước tính bù ngày trống',
      source: 'manual',
      estimated: true,
    })
    setDrafts((d) => ({ ...d, [date]: '' }))
    toast(`Đã ghi ước tính ${formatMoney(amount)} cho ${formatDateLong(date)}`)
  }

  const pct = Math.round(coverage.ratio * 100)

  return (
    <div className="card">
      <div className="card-title">
        Lấp khoảng trống
        <span className="spacer" />
        <span className="hint" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {coverage.gaps.length} ngày chưa ghi
        </span>
      </div>

      <div className="coverage-line">
        <div className="meter" style={{ flex: 1 }}>
          <i style={{ width: `${pct}%`, background: pct >= 80 ? 'var(--good)' : pct >= 50 ? 'var(--warning)' : 'var(--warning)' }} />
        </div>
        <b>{pct}%</b>
      </div>
      <div className="hint" style={{ marginTop: 6, marginBottom: 12 }}>
        Độ phủ {coverage.window} ngày qua. Bỏ lỡ vài ngày không sao — lấp lại bất cứ lúc nào.
      </div>

      {visible.map((date) => (
        <div key={date} className="gap-row">
          <span className="gap-date">{formatDateLong(date)}</span>
          <input
            className="input gap-input"
            inputMode="decimal"
            placeholder="ước tính…"
            value={drafts[date] ?? ''}
            onChange={(e) => setDrafts((d) => ({ ...d, [date]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') fill(date)
            }}
            aria-label={`Số tiền ước tính cho ${formatDateLong(date)}`}
          />
          {(drafts[date] ?? '').trim() ? (
            <button type="button" className="btn sm primary" onClick={() => fill(date)}>
              Ghi
            </button>
          ) : (
            <button
              type="button"
              className="btn sm"
              onClick={async () => {
                await markNoSpend(date)
                toast('Đã đánh dấu không chi tiêu')
              }}
            >
              Không chi
            </button>
          )}
        </div>
      ))}

      {coverage.gaps.length > 3 && (
        <button type="button" className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Thu gọn' : `Xem tất cả ${coverage.gaps.length} ngày`}
        </button>
      )}
    </div>
  )
}
