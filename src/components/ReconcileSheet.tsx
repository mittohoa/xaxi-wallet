import { useMemo, useState } from 'react'
import { reconcileWallet } from '../lib/actions'
import { todayISO } from '../lib/date'
import { formatMoney, parseAmount } from '../lib/format'
import { walletBalances } from '../lib/stats'
import { useApp } from '../store'
import { Sheet } from './ui'

/**
 * Doi soat so du: nguoi dung nhin so du that trong vi / app ngan hang
 * va go dung MOT con so. Phan chenh lech duoc ghi thanh 'Chi chua ro',
 * nho vay tong chi tieu van dung du khong ghi het tung khoan.
 */
export function ReconcileSheet({ onClose }: { onClose: () => void }) {
  const { wallets, transactions, categories, toast } = useApp()
  const active = wallets.filter((w) => !w.archived)
  const [walletId, setWalletId] = useState<number | null>(active[0]?.id ?? null)
  const [text, setText] = useState('')

  const balances = useMemo(() => walletBalances(wallets, transactions), [wallets, transactions])
  const wallet = wallets.find((w) => w.id === walletId)
  const computed = walletId != null ? (balances.get(walletId) ?? 0) : 0

  const counted = parseAmount(text)
  const valid = Number.isFinite(counted) && counted >= 0
  const difference = valid ? Math.round(counted - computed) : 0

  async function run() {
    if (!wallet || !valid) return
    const result = await reconcileWallet(wallet, computed, counted, categories, todayISO())
    if (result.createdKind === null) toast('Số dư đã khớp, không cần điều chỉnh')
    else if (result.createdKind === 'expense') toast(`Đã ghi ${formatMoney(Math.abs(result.difference))} vào "Chi chưa rõ"`)
    else toast(`Đã ghi ${formatMoney(result.difference)} vào "Thu chưa rõ"`)
    onClose()
  }

  return (
    <Sheet title="Đối soát số dư" onClose={onClose}>
      <p className="hint" style={{ marginTop: 0 }}>
        Mở ví hoặc app ngân hàng, nhìn số dư thật rồi gõ vào đây. Phần chênh lệch sẽ được ghi thành khoản
        <b> "Chi chưa rõ"</b> — tổng chi tiêu của bạn vẫn chính xác dù không ghi đủ từng khoản.
      </p>

      <div className="field">
        <label htmlFor="rec-wallet">Ví / tài khoản</label>
        <select id="rec-wallet" className="input" value={walletId ?? ''} onChange={(e) => setWalletId(Number(e.target.value))}>
          {active.map((w) => (
            <option key={w.id} value={w.id}>
              {w.icon} {w.name}
            </option>
          ))}
        </select>
      </div>

      <div className="recon-compare">
        <div>
          <div className="hint">App đang tính</div>
          <div className="recon-value">{formatMoney(computed)}</div>
        </div>
        <div>
          <div className="hint">Số dư thật</div>
          <input
            className="input amount-input"
            inputMode="decimal"
            autoFocus
            placeholder="0"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') run()
            }}
            aria-label="Số dư thật đếm được"
            style={{ fontSize: 22 }}
          />
        </div>
      </div>

      {valid && (
        <div className="recon-diff">
          {difference === 0 ? (
            <span style={{ color: 'var(--good)' }}>Khớp hoàn toàn — không cần điều chỉnh.</span>
          ) : difference < 0 ? (
            <span>
              Thiếu <b className="amount expense">{formatMoney(Math.abs(difference))}</b> → ghi vào "Chi chưa rõ"
            </span>
          ) : (
            <span>
              Dư <b className="amount income">{formatMoney(difference)}</b> → ghi vào "Thu chưa rõ"
            </span>
          )}
        </div>
      )}

      {wallet?.lastReconciledAt && <div className="hint">Lần đối soát gần nhất: {wallet.lastReconciledAt}</div>}

      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onClose}>
          Huỷ
        </button>
        <button type="button" className="btn primary" onClick={run} disabled={!valid}>
          Đối soát
        </button>
      </div>
    </Sheet>
  )
}
