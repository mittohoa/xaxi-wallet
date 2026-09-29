import { useMemo, useState } from 'react'
import { db, stamp } from '../db/db'
import { systemCategory } from '../lib/actions'
import { formatDate } from '../lib/date'
import { formatMoney } from '../lib/format'
import { parseStatementFile, type StatementParse } from '../lib/statement'
import { useApp } from '../store'
import { Sheet } from './ui'
import type { Id } from '../types'

/**
 * Nhap sao ke CSV nguoi dung tu xuat tu app ngan hang.
 * Khong ket noi toi ngan hang, khong hoi thong tin dang nhap.
 * Mot lan nhap phu ca thang — cach hieu qua nhat de bat kip khi da bo be.
 */
export function StatementSheet({ onClose }: { onClose: () => void }) {
  const { transactions, categories, wallets, toast } = useApp()
  const [result, setResult] = useState<StatementParse | null>(null)
  const [rows, setRows] = useState<StatementParse['rows']>([])
  const [walletId, setWalletId] = useState<Id | null>(wallets.find((w) => !w.archived)?.id ?? null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const selectedCount = rows.filter((r) => r.selected).length
  const duplicates = rows.filter((r) => r.duplicate).length

  const totals = useMemo(() => {
    let income = 0
    let expense = 0
    for (const r of rows) {
      if (!r.selected) continue
      if (r.kind === 'income') income += r.amount
      else expense += r.amount
    }
    return { income, expense }
  }, [rows])

  async function pick(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      const parsed = await parseStatementFile(file, transactions)
      if (!parsed) {
        setError('Không đọc được tệp này. Cần bảng có cột ngày và cột số tiền (hoặc ghi nợ / ghi có).')
        setResult(null)
        setRows([])
        return
      }
      setResult(parsed)
      setRows(parsed.rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đọc được tệp.')
    }
  }

  async function importRows() {
    if (walletId == null) return
    const expenseCat = systemCategory(categories, 'uncategorized-expense')
    const incomeCat = systemCategory(categories, 'uncategorized-income')
    if (!expenseCat?.id || !incomeCat?.id) return

    setBusy(true)
    const now = Date.now()
    const payload = rows
      .filter((r) => r.selected)
      .map((r, i) =>
        stamp({
          kind: r.kind,
          amount: r.amount,
          categoryId: r.kind === 'income' ? incomeCat.id : expenseCat.id,
          walletId,
          date: r.date,
          note: r.note || undefined,
          createdAt: now + i,
          source: 'quick' as const,
        }),
      )
    await db.transactions.bulkAdd(payload)
    setBusy(false)
    toast(`Đã nhập ${payload.length} giao dịch vào hộp chờ phân loại`)
    onClose()
  }

  return (
    <Sheet title="Nhập sao kê" onClose={onClose}>
      {!result && (
        <>
          <p className="hint" style={{ marginTop: 0 }}>
            Xuất sao kê dạng <b>CSV</b> hoặc <b>Excel (.xlsx)</b> từ app ngân hàng hoặc ví điện tử của bạn rồi chọn tệp ở
            đây. Ứng dụng không kết nối tới ngân hàng và không hỏi thông tin đăng nhập — tệp được đọc ngay trên máy, không
            gửi đi đâu.
          </p>
          <div className="field">
            <label htmlFor="stmt-file">Chọn tệp CSV hoặc Excel</label>
            <input
              id="stmt-file"
              className="input"
              type="file"
              accept=".csv,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </div>
        </>
      )}

      {error && <div className="error">{error}</div>}

      {result && (
        <>
          <div className="hint" style={{ marginBottom: 12 }}>
            Đọc từ {result.source === 'xlsx' ? `Excel · sheet "${result.sheetName}"` : 'CSV'} — ngày:{' '}
            <b>{result.mapping.date}</b> · số tiền: <b>{result.mapping.amount}</b> · nội dung: <b>{result.mapping.note}</b>
            {result.skipped > 0 && ` · bỏ qua ${result.skipped} dòng không đọc được`}
            {duplicates > 0 && ` · ${duplicates} dòng đã có sẵn (bỏ chọn tự động)`}
          </div>

          <div className="field">
            <label htmlFor="stmt-wallet">Nhập vào ví</label>
            <select id="stmt-wallet" className="input" value={walletId ?? ''} onChange={(e) => setWalletId(e.target.value)}>
              {wallets
                .filter((w) => !w.archived)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.icon} {w.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="stmt-list">
            {rows.map((r, i) => (
              <label key={`${r.date}-${r.amount}-${i}`} className={r.duplicate ? 'stmt-row dup' : 'stmt-row'}>
                <input
                  type="checkbox"
                  checked={r.selected}
                  onChange={(e) =>
                    setRows((prev) => prev.map((row, j) => (j === i ? { ...row, selected: e.target.checked } : row)))
                  }
                />
                <span className="stmt-date">{formatDate(r.date)}</span>
                <span className="stmt-note">{r.note || '(không có nội dung)'}</span>
                <span className={`amount ${r.kind}`}>
                  {r.kind === 'expense' ? '−' : '+'}
                  {formatMoney(r.amount)}
                </span>
              </label>
            ))}
          </div>

          <div className="stmt-summary">
            Chọn {selectedCount}/{rows.length} dòng · thu <b className="amount income">{formatMoney(totals.income)}</b> · chi{' '}
            <b className="amount expense">{formatMoney(totals.expense)}</b>
          </div>

          <div className="sheet-actions">
            <button type="button" className="btn" onClick={onClose}>
              Huỷ
            </button>
            <button type="button" className="btn primary" onClick={importRows} disabled={selectedCount === 0 || busy}>
              Nhập {selectedCount} giao dịch
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}
