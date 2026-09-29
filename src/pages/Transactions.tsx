import { useMemo, useState } from 'react'
import { TransactionList } from '../components/TransactionList'
import { Segmented } from '../components/ui'
import { currentMonth, monthLabel, monthRange, shiftMonth } from '../lib/date'
import { formatMoney } from '../lib/format'
import { normalize } from '../lib/quickadd'
import { inRange, sumTotals } from '../lib/stats'
import { useApp } from '../store'
import type { Id, Transaction } from '../types'

type Filter = 'all' | 'income' | 'expense' | 'inbox'

export function Transactions({ onEdit }: { onEdit: (tx: Transaction) => void }) {
  const { transactions, categories, wallets, settings } = useApp()
  const [month, setMonth] = useState(currentMonth())
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [walletId, setWalletId] = useState<Id | 'all'>('all')

  const range = monthRange(month, settings.startDayOfMonth)
  const uncategorizedIds = useMemo(
    () =>
      new Set(
        categories
          .filter((c) => c.slug === 'uncategorized-expense' || c.slug === 'uncategorized-income')
          .map((c) => c.id),
      ),
    [categories],
  )
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const filtered = useMemo(() => {
    const q = normalize(query)
    return inRange(transactions, range.start, range.end).filter((t) => {
      if (filter === 'income' && t.kind !== 'income') return false
      if (filter === 'expense' && t.kind !== 'expense') return false
      if (filter === 'inbox' && !uncategorizedIds.has(t.categoryId)) return false
      if (walletId !== 'all' && t.walletId !== walletId) return false
      if (!q) return true
      const haystack = `${t.note ?? ''} ${catById.get(t.categoryId)?.name ?? ''}`
      return normalize(haystack).includes(q)
    })
  }, [transactions, range.start, range.end, filter, query, walletId, uncategorizedIds, catById])

  const totals = sumTotals(filtered)

  return (
    <>
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
              <i className="dot income" /> Thu
            </span>
            <span className="value amount income">{formatMoney(totals.income)}</span>
          </div>
          <div className="stat">
            <span className="label">
              <i className="dot expense" /> Chi
            </span>
            <span className="value amount expense">{formatMoney(totals.expense)}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="filter-row">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Tất cả' },
              { value: 'expense', label: 'Chi', className: 'kind-expense' },
              { value: 'income', label: 'Thu', className: 'kind-income' },
              { value: 'inbox', label: 'Chờ phân loại' },
            ]}
          />
          <select
            className="input sm"
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            aria-label="Lọc theo ví"
          >
            <option value="all">Mọi ví</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.icon} {w.name}
              </option>
            ))}
          </select>
        </div>
        <input
          className="input"
          style={{ marginTop: 10 }}
          placeholder="Tìm theo ghi chú hoặc danh mục…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Tìm giao dịch"
        />
      </div>

      <div className="card">
        <TransactionList
          transactions={filtered}
          onSelect={onEdit}
          emptyHint={filter === 'inbox' ? 'Không còn khoản nào chờ phân loại.' : 'Không có giao dịch nào khớp bộ lọc.'}
        />
      </div>
    </>
  )
}
