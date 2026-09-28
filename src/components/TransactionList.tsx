import { useMemo } from 'react'
import { formatDateLong } from '../lib/date'
import { formatMoney } from '../lib/format'
import { useLookups } from '../store'
import type { Transaction } from '../types'
import { Avatar, Empty, Money } from './ui'

/** Nhom giao dich theo ngay, moi nhat truoc */
function groupByDay(txs: Transaction[]) {
  const map = new Map<string, Transaction[]>()
  for (const t of txs) {
    const list = map.get(t.date)
    if (list) list.push(t)
    else map.set(t.date, [t])
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => b.createdAt - a.createdAt),
      net: items.reduce((s, t) => s + (t.kind === 'income' ? t.amount : -t.amount), 0),
    }))
}

export function TransactionList({
  transactions,
  onSelect,
  emptyHint,
  showDayTotals = true,
}: {
  transactions: Transaction[]
  onSelect: (tx: Transaction) => void
  emptyHint?: string
  showDayTotals?: boolean
}) {
  const { catById, walletById } = useLookups()
  const days = useMemo(() => groupByDay(transactions), [transactions])

  if (transactions.length === 0) {
    return <Empty icon="🧾" title="Chưa có giao dịch nào" hint={emptyHint ?? 'Nhấn nút + để ghi khoản đầu tiên.'} />
  }

  return (
    <div className="list">
      {days.map((day) => (
        <div key={day.date}>
          <div className="day-head">
            <span>{formatDateLong(day.date)}</span>
            {showDayTotals && (
              <span style={{ color: day.net < 0 ? 'var(--expense)' : 'var(--income)', fontVariantNumeric: 'tabular-nums' }}>
                {day.net < 0 ? '−' : '+'}
                {formatMoney(Math.abs(day.net))}
              </span>
            )}
          </div>
          {day.items.map((t) => {
            const cat = catById.get(t.categoryId)
            const wallet = walletById.get(t.walletId)
            return (
              <button key={t.id} type="button" className="row" onClick={() => onSelect(t)}>
                <Avatar icon={cat?.icon ?? '❓'} color={cat?.color ?? '#898781'} />
                <span className="body">
                  <span className="name">{t.note || cat?.name || 'Không rõ'}</span>
                  <span className="meta">
                    {cat?.name ?? 'Danh mục đã xoá'} · {wallet?.name ?? 'Ví đã xoá'}
                  </span>
                </span>
                <span className="trail">
                  <Money value={t.amount} kind={t.kind} signed />
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
