import { useMemo, useState } from 'react'
import { Empty } from '../components/ui'
import { db, stamp, touch } from '../db/db'
import { currentMonth, daysInMonth, monthLabel, monthRange, shiftMonth, todayISO } from '../lib/date'
import { formatMoney, parseAmount } from '../lib/format'
import { byCategory, inRange } from '../lib/stats'
import { useApp } from '../store'
import type { Id } from '../types'

/** Mau canh bao theo muc do dung ngan sach — luon di kem nhan chu, khong chi dua vao mau */
function statusOf(ratio: number, paceRatio: number): { color: string; label: string } {
  if (ratio > 1) return { color: 'var(--critical)', label: 'Vượt ngân sách' }
  if (ratio > paceRatio + 0.15) return { color: 'var(--warning)', label: 'Đang tiêu nhanh hơn dự kiến' }
  if (ratio > 0.85) return { color: 'var(--warning)', label: 'Sắp chạm hạn mức' }
  return { color: 'var(--good)', label: 'Trong tầm kiểm soát' }
}

export function Budgets() {
  const { budgets, categories, transactions, settings, toast } = useApp()
  const [month, setMonth] = useState(currentMonth())
  const [drafts, setDrafts] = useState<Record<Id, string>>({})

  const range = monthRange(month, settings.startDayOfMonth)
  const monthTx = useMemo(() => inRange(transactions, range.start, range.end), [transactions, range.start, range.end])
  const spendByCategory = useMemo(() => {
    const map = new Map<Id, number>()
    for (const s of byCategory(monthTx, categories, 'expense')) map.set(s.category.id, s.amount)
    return map
  }, [monthTx, categories])

  /**
   * Danh muc dat duoc han muc.
   *
   * Bo 'reconcile-expense' vi do la phan chenh lech do doi soat sinh ra, khong
   * phai khoan nguoi dung chu dong tieu. Bo 'transfer-out' vi chuyen tien giua
   * hai vi bi loai khoi MOI phep tinh thu/chi — dat han muc cho no thi o "da
   * chi" mai mai hien 0, tuc mot o nhap khong bao gio lam duoc viec gi.
   */
  const expenseCategories = categories.filter(
    (c) => c.kind === 'expense' && c.slug !== 'reconcile-expense' && c.slug !== 'transfer-out',
  )
  const monthBudgets = useMemo(() => budgets.filter((b) => b.month === month), [budgets, month])

  // Ty le thoi gian da troi qua trong thang, de biet dang tieu nhanh hay cham
  const isCurrent = month === currentMonth()
  const paceRatio = isCurrent ? Number(todayISO().slice(8, 10)) / daysInMonth(month) : 1

  const totalLimit = monthBudgets.reduce((s, b) => s + b.limit, 0)
  const totalSpent = monthBudgets.reduce((s, b) => s + (spendByCategory.get(b.categoryId) ?? 0), 0)

  async function setLimit(categoryId: Id, text: string) {
    const value = parseAmount(text)
    const existing = monthBudgets.find((b) => b.categoryId === categoryId)
    if (!Number.isFinite(value) || value <= 0) {
      if (existing) {
        await db.budgets.delete(existing.id)
        toast('Đã bỏ hạn mức')
      }
    } else if (existing) {
      await db.budgets.update(existing.id, { ...touch(), limit: Math.round(value) })
      toast('Đã cập nhật hạn mức')
    } else {
      await db.budgets.add(stamp({ categoryId, month, limit: Math.round(value) }))
      toast('Đã đặt hạn mức')
    }
    setDrafts((d) => ({ ...d, [categoryId]: '' }))
  }

  async function copyPreviousMonth() {
    const prev = shiftMonth(month, -1)
    const source = budgets.filter((b) => b.month === prev)
    if (source.length === 0) return toast('Tháng trước chưa đặt hạn mức nào')
    await db.budgets.bulkAdd(
      source
        .filter((b) => !monthBudgets.some((m) => m.categoryId === b.categoryId))
        .map((b) => stamp({ categoryId: b.categoryId, month, limit: b.limit })),
    )
    toast('Đã sao chép hạn mức tháng trước')
  }

  return (
    <>
      <div className="card">
        <div className="month-nav">
          <button type="button" className="icon-btn" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Tháng trước">
            ‹
          </button>
          <b>{monthLabel(month)}</b>
          <button type="button" className="icon-btn" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Tháng sau">
            ›
          </button>
        </div>

        {totalLimit > 0 && (
          <>
            <div className="coverage-line" style={{ marginTop: 14 }}>
              <div className="meter" style={{ flex: 1 }}>
                <i
                  style={{
                    width: `${Math.min((totalSpent / totalLimit) * 100, 100)}%`,
                    background: statusOf(totalSpent / totalLimit, paceRatio).color,
                  }}
                />
              </div>
              <b>{Math.round((totalSpent / totalLimit) * 100)}%</b>
            </div>
            <div className="hint" style={{ marginTop: 6 }}>
              Đã chi {formatMoney(totalSpent)} / {formatMoney(totalLimit)} · còn{' '}
              <b>{formatMoney(Math.max(totalLimit - totalSpent, 0))}</b>
            </div>
          </>
        )}

        <button type="button" className="btn sm" style={{ marginTop: 12 }} onClick={copyPreviousMonth}>
          Sao chép hạn mức tháng trước
        </button>
      </div>

      <div className="card">
        <div className="card-title">Hạn mức theo danh mục</div>
        {expenseCategories.length === 0 && <Empty icon="🎯" title="Chưa có danh mục chi nào" />}
        {expenseCategories.map((c) => {
          const budget = monthBudgets.find((b) => b.categoryId === c.id)
          const spent = spendByCategory.get(c.id) ?? 0
          const ratio = budget ? spent / budget.limit : 0
          const status = statusOf(ratio, paceRatio)
          return (
            <div key={c.id} className="budget-row">
              <div className="budget-head">
                <span className="rank-label">
                  <span aria-hidden="true">{c.icon}</span>
                  <span className="nm">{c.name}</span>
                </span>
                <input
                  className="input sm budget-input"
                  inputMode="decimal"
                  placeholder="hạn mức"
                  value={drafts[c.id] ?? (budget ? String(budget.limit) : '')}
                  onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                  onBlur={(e) => {
                    if (drafts[c.id] !== undefined) setLimit(c.id, e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                  aria-label={`Hạn mức cho ${c.name}`}
                />
              </div>
              {budget && (
                <>
                  <div className="meter" style={{ marginTop: 8 }}>
                    <i style={{ width: `${Math.min(ratio * 100, 100)}%`, background: status.color }} />
                  </div>
                  <div className="budget-foot">
                    <span>
                      {formatMoney(spent)} / {formatMoney(budget.limit)}
                    </span>
                    <span style={{ color: status.color }}>
                      {ratio > 1 ? '⚠ ' : ''}
                      {status.label}
                    </span>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
