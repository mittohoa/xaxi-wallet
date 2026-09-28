import { useMemo, useState } from 'react'
import { MonthlyBars } from '../components/charts'
import { Empty, Segmented } from '../components/ui'
import { currentMonth, monthLabel, monthRange, shiftMonth, MONTH_NAMES } from '../lib/date'
import { formatMoney } from '../lib/format'
import { byCategory, inRange, monthlySeries, sumTotals } from '../lib/stats'
import { useApp } from '../store'
import type { TxKind } from '../types'

export function Reports() {
  const { transactions, categories, settings } = useApp()
  const [month, setMonth] = useState(currentMonth())
  const [kind, setKind] = useState<TxKind>('expense')
  const [showTable, setShowTable] = useState(false)

  const series = useMemo(() => monthlySeries(transactions, month, 6), [transactions, month])
  const range = monthRange(month, settings.startDayOfMonth)
  const monthTx = useMemo(() => inRange(transactions, range.start, range.end), [transactions, range.start, range.end])
  const slices = useMemo(() => byCategory(monthTx, categories, kind), [monthTx, categories, kind])
  const totals = sumTotals(monthTx)

  const avg = series.reduce((s, m) => s + m.expense, 0) / Math.max(series.length, 1)
  const estimatedCount = monthTx.filter((t) => t.estimated).length

  return (
    <>
      <div className="card">
        <div className="card-title">6 tháng gần nhất</div>
        <MonthlyBars data={series} />
        <button type="button" className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Ẩn bảng số liệu' : 'Xem dạng bảng'}
        </button>
        {showTable && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tháng</th>
                  <th>Thu</th>
                  <th>Chi</th>
                  <th>Còn lại</th>
                </tr>
              </thead>
              <tbody>
                {series.map((m) => (
                  <tr key={m.month}>
                    <td>
                      {MONTH_NAMES[Number(m.month.slice(5, 7)) - 1]}/{m.month.slice(0, 4)}
                    </td>
                    <td>{formatMoney(m.income)}</td>
                    <td>{formatMoney(m.expense)}</td>
                    <td>{formatMoney(m.income - m.expense)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="hint" style={{ marginTop: 10 }}>
          Chi trung bình {formatMoney(Math.round(avg))}/tháng trong giai đoạn này.
        </div>
      </div>

      <div className="card">
        <div className="month-nav">
          <button type="button" className="icon-btn" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Tháng trước">
            ‹
          </button>
          <b>{monthLabel(month)}</b>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={month >= currentMonth()}
            aria-label="Tháng sau"
          >
            ›
          </button>
        </div>

        <div className="grid-2" style={{ marginTop: 12 }}>
          <div className="stat">
            <span className="label">
              <i className="dot income" /> Tổng thu
            </span>
            <span className="value amount income">{formatMoney(totals.income)}</span>
          </div>
          <div className="stat">
            <span className="label">
              <i className="dot expense" /> Tổng chi
            </span>
            <span className="value amount expense">{formatMoney(totals.expense)}</span>
          </div>
        </div>
        <div className="hint" style={{ marginTop: 10 }}>
          Còn lại <b>{formatMoney(totals.net)}</b>
          {estimatedCount > 0 && ` · ${estimatedCount} khoản là số ước tính`}
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          Phân bổ theo danh mục
          <span className="spacer" />
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: 'expense', label: 'Chi', className: 'kind-expense' },
              { value: 'income', label: 'Thu', className: 'kind-income' },
            ]}
          />
        </div>

        {slices.length === 0 ? (
          <Empty icon="📊" title="Chưa có dữ liệu trong tháng này" />
        ) : (
          <div className="rank">
            {slices.map((slice) => (
              <div key={slice.category.id} className="rank-item">
                <span className="rank-label">
                  <span aria-hidden="true">{slice.category.icon}</span>
                  <span className="nm">{slice.category.name}</span>
                  <span className="rank-pct">
                    {Math.round(slice.share * 100)}% · {slice.count} khoản
                  </span>
                </span>
                <span className="rank-value">{formatMoney(slice.amount)}</span>
                <span className="rank-track">
                  <span
                    className="rank-fill"
                    style={{ width: `${Math.max(slice.share * 100, 2)}%`, background: `var(--${kind})` }}
                  />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
