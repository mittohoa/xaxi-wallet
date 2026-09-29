import { useMemo, useState } from 'react'
import { db, newId, softDelete, stamp, touch } from '../db/db'
import { currentMonth, monthLabel, todayISO } from '../lib/date'
import { formatMoney, parseAmount } from '../lib/format'
import { claimedWallets, goalStates } from '../lib/goals'
import { nextCategoryColor } from '../lib/palette'
import { walletBalances } from '../lib/stats'
import { useApp } from '../store'
import type { Id } from '../types'
import { ConfirmButton, Empty } from './ui'
import { DateField } from './DateField'
import { Icon } from './Icon'

/**
 * Mục tiêu tiết kiệm.
 *
 * Mỗi mục tiêu gắn với một ví, và tiến độ CHÍNH LÀ số dư ví đó. Sau khi đặt
 * xong, mục tiêu không đòi thêm một thao tác nào nữa — người dùng chuyển tiền
 * vào ví như họ vốn vẫn làm, tiến độ tự chạy.
 */
export function GoalsView() {
  const { goals, wallets, transactions, settings, toast } = useApp()
  const [adding, setAdding] = useState(false)
  const [armed, setArmed] = useState<Id | null>(null)

  const balances = useMemo(() => walletBalances(wallets, transactions), [wallets, transactions])
  const states = useMemo(
    () => goalStates(goals, wallets, balances, transactions, currentMonth(), settings.startDayOfMonth),
    [goals, wallets, balances, transactions, settings.startDayOfMonth],
  )

  return (
    <>
      {states.length === 0 && !adding && (
        <div className="card">
          <Empty
            icon="target"
            title="Chưa có mục tiêu nào"
            hint="Gắn một mục tiêu với một ví, rồi tiến độ tự chạy theo số dư ví đó — không phải cập nhật tay."
          />
        </div>
      )}

      {states.map((s) => (
        <div key={s.goal.id} className={`card goal-card${s.done ? ' done' : ''}`}>
          <div className="goal-head">
            <span className="goal-name">
              <span aria-hidden="true">{s.goal.icon}</span>
              <span className="nm">{s.goal.name}</span>
            </span>
            <span className="goal-figure">
              {formatMoney(s.saved)}
              <span className="goal-target"> / {formatMoney(s.goal.target)}</span>
            </span>
          </div>

          <div className="meter" style={{ marginTop: 10 }}>
            <i
              style={{
                width: `${Math.max(s.ratio * 100, s.saved > 0 ? 2 : 0)}%`,
                background: s.done ? 'var(--good)' : 'var(--accent-text)',
              }}
            />
          </div>

          <div className="budget-foot">
            <span>{Math.round(s.ratio * 100)}%</span>
            <span>
              {s.done ? (
                <>
                  <Icon name="check" className="ok" /> đã đạt
                </>
              ) : (
                `còn ${formatMoney(s.remaining)}`
              )}
            </span>
          </div>

          <div className="hint" style={{ marginTop: 8 }}>
            Ví <b>{s.wallet?.name ?? '(đã xoá)'}</b>
            {!s.done && s.monthlyRate > 0 && (
              <> · đang góp {formatMoney(s.monthlyRate)}/tháng</>
            )}
            {!s.done && s.projected && <> · dự kiến đạt {monthLabel(s.projected).toLowerCase()}</>}
            {!s.done && s.monthlyRate <= 0 && (
              <> · chưa đo được nhịp góp, nên chưa đoán được ngày đạt</>
            )}
          </div>

          {!s.done && s.neededPerMonth !== null && (
            <div className="hint" style={{ marginTop: 6, color: s.onTrack === false ? 'var(--warning)' : undefined }}>
              Hạn {monthLabel(s.goal.dueDate!.slice(0, 7)).toLowerCase()} — cần{' '}
              <b>{formatMoney(s.neededPerMonth)}/tháng</b>
              {s.onTrack === false && ' · đang thiếu nhịp'}
              {s.onTrack === true && ' · đang kịp'}
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 14 }}>
            <ConfirmButton
              label={s.done ? 'Cất đi' : 'Xoá mục tiêu'}
              confirmLabel="Chắc chắn?"
              className="btn sm"
              armed={armed === s.goal.id}
              setArmed={(v) => setArmed(v ? s.goal.id : null)}
              onConfirm={async () => {
                // Cất đi chứ không xoá khi đã đạt: đó là một cột mốc, giữ lại có
                // ý nghĩa với người dùng và không tốn gì
                if (s.done) await db.goals.update(s.goal.id, { ...touch(), archived: true })
                else await softDelete('goals', s.goal.id)
                toast(s.done ? 'Đã cất mục tiêu' : 'Đã xoá mục tiêu')
              }}
            />
          </div>
        </div>
      ))}

      {adding ? (
        <GoalForm onDone={() => setAdding(false)} />
      ) : (
        <button type="button" className="btn primary" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>
          <Icon name="plus" /> Mục tiêu mới
        </button>
      )}
    </>
  )
}

/**
 * Biểu mẫu tạo mục tiêu.
 *
 * Có tuỳ chọn tạo ví mới ngay tại chỗ. Không có nó thì người dùng gặp ngõ cụt:
 * muốn đặt mục tiêu nhưng chưa có ví riêng để theo dõi, phải thoát ra Cài đặt
 * tạo ví rồi quay lại — đủ để bỏ dở.
 */
function GoalForm({ onDone }: { onDone: () => void }) {
  const { goals, wallets, toast } = useApp()

  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🎯')
  const [target, setTarget] = useState('')
  const [newWallet, setNewWallet] = useState(true)
  const [walletId, setWalletId] = useState<Id | ''>('')
  const [hasDue, setHasDue] = useState(false)
  const [due, setDue] = useState(todayISO())
  const [error, setError] = useState<string | null>(null)

  const claimed = useMemo(() => claimedWallets(goals), [goals])
  const free = wallets.filter((w) => !w.archived && !claimed.has(w.id))

  const amount = parseAmount(target)
  const valid = name.trim().length > 0 && Number.isFinite(amount) && amount > 0 && (newWallet || walletId !== '')

  async function save() {
    if (!valid) return setError('Cần tên mục tiêu, số tiền lớn hơn 0 và một ví để theo dõi.')
    try {
      let vi = walletId as Id
      if (newWallet) {
        vi = newId()
        await db.wallets.add(
          stamp({
            id: vi,
            name: name.trim(),
            kind: 'saving' as const,
            icon,
            color: nextCategoryColor(wallets.length),
            openingBalance: 0,
          }),
        )
      }
      await db.goals.add(
        stamp({
          name: name.trim(),
          icon,
          target: Math.round(amount),
          walletId: vi,
          dueDate: hasDue ? due : undefined,
          createdAt: Date.now(),
        }),
      )
      toast(newWallet ? 'Đã tạo mục tiêu và ví đi kèm' : 'Đã tạo mục tiêu')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được mục tiêu.')
    }
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="card-title">Mục tiêu mới</div>

      <div className="add-row" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
        <input
          className="input"
          style={{ maxWidth: 70, textAlign: 'center' }}
          value={icon}
          onChange={(e) => setIcon(e.target.value.slice(0, 2))}
          aria-label="Biểu tượng mục tiêu"
        />
        <input
          className="input"
          placeholder="Tên mục tiêu — ví dụ: Mua xe"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          aria-label="Tên mục tiêu"
        />
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="goal-target">Cần bao nhiêu</label>
        <input
          id="goal-target"
          className="input amount-input"
          inputMode="decimal"
          placeholder="0"
          value={target}
          onChange={(e) => {
            setTarget(e.target.value)
            setError(null)
          }}
        />
        <div className="hint" style={{ textAlign: 'right' }}>
          {Number.isFinite(amount) && amount > 0 ? formatMoney(Math.round(amount)) : 'Gõ tắt được: 30tr · 500k'}
        </div>
      </div>

      <label className="check-row">
        <input type="checkbox" checked={newWallet} onChange={(e) => setNewWallet(e.target.checked)} />
        <span>
          Tạo ví mới cho mục tiêu này
          <span className="hint"> — tiến độ chạy theo số dư ví đó, không phải nhập tay</span>
        </span>
      </label>

      {!newWallet && (
        <div className="field">
          <label htmlFor="goal-wallet">Theo dõi ví</label>
          <select
            id="goal-wallet"
            className="input"
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
          >
            <option value="">Chọn ví…</option>
            {free.map((w) => (
              <option key={w.id} value={w.id}>
                {w.icon} {w.name}
              </option>
            ))}
          </select>
          {free.length === 0 && (
            <div className="hint">
              Mọi ví đều đã có mục tiêu theo dõi. Hai mục tiêu cùng một ví sẽ hiện cùng một số dư — cả hai đều sai.
            </div>
          )}
        </div>
      )}

      <label className="check-row">
        <input type="checkbox" checked={hasDue} onChange={(e) => setHasDue(e.target.checked)} />
        <span>Đặt hạn</span>
      </label>
      {hasDue && <DateField id="goal-due" label="Muốn đạt trước" value={due} onChange={setDue} />}

      {error && <div className="error">{error}</div>}

      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onDone}>
          Huỷ
        </button>
        <button type="button" className="btn primary" onClick={save} disabled={!valid}>
          Tạo mục tiêu
        </button>
      </div>
    </div>
  )
}
