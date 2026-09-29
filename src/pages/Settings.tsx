import { useEffect, useRef, useState } from 'react'
import { RecurringSheet } from '../components/RecurringSheet'
import { StatementSheet } from '../components/StatementSheet'
import { ConfirmButton, Empty, Segmented } from '../components/ui'
import { db, wipeAll } from '../db/db'
import { buildBackup, downloadFile, readTextFile, restoreBackup, toCSV } from '../lib/backup'
import { loadDemoData, primeOpeningBalances } from '../lib/demo'
import { formatDate, todayISO } from '../lib/date'
import { formatMoney, parseAmount } from '../lib/format'
import { formatBytes, readStorageStatus, requestPersistence, type StorageStatus } from '../lib/storage'
import { saveSettings, useApp } from '../store'
import type { Recurring, Settings as SettingsType, TxKind, WalletKind } from '../types'

const FREQ_LABEL: Record<Recurring['freq'], string> = {
  daily: 'Hàng ngày',
  weekly: 'Hàng tuần',
  monthly: 'Hàng tháng',
}

const WALLET_KINDS: { value: WalletKind; label: string; icon: string }[] = [
  { value: 'cash', label: 'Tiền mặt', icon: '👛' },
  { value: 'bank', label: 'Ngân hàng', icon: '🏦' },
  { value: 'ewallet', label: 'Ví điện tử', icon: '📱' },
  { value: 'credit', label: 'Thẻ tín dụng', icon: '💳' },
  { value: 'saving', label: 'Tiết kiệm', icon: '🏆' },
]

const CATEGORY_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']

export function Settings() {
  const { settings, wallets, categories, transactions, recurring, toast } = useApp()
  const [sheet, setSheet] = useState<'statement' | null>(null)
  const [editingRule, setEditingRule] = useState<Recurring | 'new' | null>(null)
  const [armedWipe, setArmedWipe] = useState(false)
  const [armedDemo, setArmedDemo] = useState(false)
  const restoreInput = useRef<HTMLInputElement>(null)

  const [storage, setStorage] = useState<StorageStatus | null>(null)
  const [asking, setAsking] = useState(false)

  const refreshStorage = () => readStorageStatus().then(setStorage)
  useEffect(() => {
    refreshStorage()
  }, [])

  const [newWallet, setNewWallet] = useState({ name: '', kind: 'cash' as WalletKind, opening: '' })
  const [newCategory, setNewCategory] = useState({ name: '', kind: 'expense' as TxKind, icon: '🏷️' })

  async function patch(next: Partial<SettingsType>) {
    await saveSettings(next)
  }

  async function exportJSON() {
    const backup = await buildBackup()
    downloadFile(`xaxi-backup-${todayISO()}.json`, JSON.stringify(backup, null, 2), 'application/json')
    toast('Đã xuất bản sao lưu')
  }

  async function exportCSV() {
    downloadFile(`xaxi-giao-dich-${todayISO()}.csv`, toCSV(transactions, categories, wallets), 'text/csv')
    toast('Đã xuất CSV')
  }

  async function importJSON(file: File | undefined) {
    if (!file) return
    try {
      const text = await readTextFile(file)
      await restoreBackup(JSON.parse(text))
      toast('Đã khôi phục dữ liệu')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Không khôi phục được')
    } finally {
      if (restoreInput.current) restoreInput.current.value = ''
    }
  }

  async function addWallet() {
    const name = newWallet.name.trim()
    if (!name) return
    const preset = WALLET_KINDS.find((k) => k.value === newWallet.kind)!
    const opening = parseAmount(newWallet.opening)
    await db.wallets.add({
      name,
      kind: newWallet.kind,
      icon: preset.icon,
      color: CATEGORY_COLORS[wallets.length % CATEGORY_COLORS.length],
      openingBalance: Number.isFinite(opening) ? Math.round(opening) : 0,
    })
    setNewWallet({ name: '', kind: 'cash', opening: '' })
    toast('Đã thêm ví')
  }

  async function addCategory() {
    const name = newCategory.name.trim()
    if (!name) return
    await db.categories.add({
      name,
      kind: newCategory.kind,
      icon: newCategory.icon || '🏷️',
      color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length],
    })
    setNewCategory({ name: '', kind: newCategory.kind, icon: '🏷️' })
    toast('Đã thêm danh mục')
  }

  async function removeCategory(id: number) {
    const used = transactions.some((t) => t.categoryId === id)
    if (used) return toast('Danh mục đang có giao dịch — không thể xoá')
    await db.categories.delete(id)
    toast('Đã xoá danh mục')
  }

  return (
    <>
      <div className="card">
        <div className="card-title">Giao diện</div>
        <Segmented
          wide
          value={settings.theme}
          onChange={(theme) => patch({ theme })}
          options={[
            { value: 'system', label: 'Theo hệ thống' },
            { value: 'light', label: 'Sáng' },
            { value: 'dark', label: 'Tối' },
          ]}
        />
      </div>

      <div className="card">
        <div className="card-title">Thói quen ghi chép</div>
        <div className="hint" style={{ marginBottom: 12 }}>
          App được thiết kế để vẫn cho số liệu đúng khi bạn bận. Các mốc dưới đây quyết định khi nào app chủ động nhắc.
        </div>

        <div className="field">
          <label htmlFor="set-gap">Cửa sổ lấp khoảng trống</label>
          <select
            id="set-gap"
            className="input"
            value={settings.gapWindowDays}
            onChange={(e) => patch({ gapWindowDays: Number(e.target.value) })}
          >
            {[7, 14, 30, 60].map((d) => (
              <option key={d} value={d}>
                {d} ngày gần nhất
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="set-nudge">Chỉ nhắc khi đã trống liên tiếp</label>
          <select
            id="set-nudge"
            className="input"
            value={settings.nudgeAfterGapDays}
            onChange={(e) => patch({ nudgeAfterGapDays: Number(e.target.value) })}
          >
            <option value={0}>Không nhắc</option>
            {[2, 3, 5, 7].map((d) => (
              <option key={d} value={d}>
                {d} ngày trở lên
              </option>
            ))}
          </select>
          <div className="hint">Nhắc mỗi ngày dễ gây nhờn, nên mặc định chỉ nhắc khi thật sự bỏ bê.</div>
        </div>

        <div className="field">
          <label htmlFor="set-recon">Nhắc đối soát số dư mỗi</label>
          <select
            id="set-recon"
            className="input"
            value={settings.reconcileEveryDays}
            onChange={(e) => patch({ reconcileEveryDays: Number(e.target.value) })}
          >
            <option value={0}>Không nhắc</option>
            {[3, 7, 14, 30].map((d) => (
              <option key={d} value={d}>
                {d} ngày
              </option>
            ))}
          </select>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="set-start">Ngày bắt đầu kỳ trong tháng</label>
          <select
            id="set-start"
            className="input"
            value={settings.startDayOfMonth}
            onChange={(e) => patch({ startDayOfMonth: Number(e.target.value) })}
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                Ngày {d}
              </option>
            ))}
          </select>
          <div className="hint">Đặt trùng ngày nhận lương nếu bạn tính chi tiêu theo kỳ lương.</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          Khoản định kỳ
          <span className="spacer" />
          <button type="button" className="btn sm" onClick={() => setEditingRule('new')}>
            ＋ Thêm
          </button>
        </div>
        <div className="hint" style={{ marginBottom: 10 }}>
          Tiền nhà, internet, lương… app tự ghi khi tới ngày, bạn không phải nhớ.
        </div>
        {recurring.length === 0 ? (
          <Empty icon="🔁" title="Chưa có khoản định kỳ nào" hint="Mỗi khoản thêm vào là một việc bớt phải nhớ." />
        ) : (
          recurring.map((r) => (
            <button key={r.id} type="button" className="row" onClick={() => setEditingRule(r)}>
              <span className="avatar" style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)' }}>
                🔁
              </span>
              <span className="body">
                <span className="name">{r.name}</span>
                <span className="meta">
                  {FREQ_LABEL[r.freq]} · lần tới {formatDate(r.nextDate)}
                  {!r.active && ' · đang tạm dừng'}
                </span>
              </span>
              <span className={`trail amount ${r.kind}`}>
                {r.kind === 'expense' ? '−' : '+'}
                {formatMoney(r.amount)}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="card">
        <div className="card-title">Ví / tài khoản</div>
        {wallets.map((w) => (
          <div key={w.id} className="row" style={{ cursor: 'default' }}>
            <span className="avatar" style={{ background: `color-mix(in srgb, ${w.color} 18%, transparent)` }}>
              {w.icon}
            </span>
            <span className="body">
              <span className="name">{w.name}</span>
              <span className="meta">Số dư ban đầu {formatMoney(w.openingBalance)}</span>
            </span>
            <button
              type="button"
              className="btn ghost sm"
              onClick={async () => {
                await db.wallets.update(w.id!, { archived: !w.archived })
                toast(w.archived ? 'Đã mở lại ví' : 'Đã ẩn ví')
              }}
            >
              {w.archived ? 'Mở lại' : 'Ẩn'}
            </button>
          </div>
        ))}
        <div className="add-row">
          <input
            className="input"
            placeholder="Tên ví mới"
            value={newWallet.name}
            onChange={(e) => setNewWallet((s) => ({ ...s, name: e.target.value }))}
            aria-label="Tên ví mới"
          />
          <select
            className="input"
            value={newWallet.kind}
            onChange={(e) => setNewWallet((s) => ({ ...s, kind: e.target.value as WalletKind }))}
            aria-label="Loại ví"
          >
            {WALLET_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.icon} {k.label}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Số dư đầu"
            inputMode="decimal"
            value={newWallet.opening}
            onChange={(e) => setNewWallet((s) => ({ ...s, opening: e.target.value }))}
            aria-label="Số dư ban đầu"
          />
          <button type="button" className="btn" onClick={addWallet} disabled={!newWallet.name.trim()}>
            Thêm
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Danh mục</div>
        {(['expense', 'income'] as TxKind[]).map((kind) => (
          <div key={kind} style={{ marginBottom: 14 }}>
            <div className="hint" style={{ marginBottom: 6 }}>{kind === 'expense' ? 'Khoản chi' : 'Khoản thu'}</div>
            <div className="chips">
              {categories
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <span key={c.id} className="chip" style={{ cursor: 'default' }}>
                    <span aria-hidden="true">{c.icon}</span>
                    <span>{c.name}</span>
                    {!c.builtin && (
                      <button
                        type="button"
                        className="chip-x"
                        onClick={() => removeCategory(c.id!)}
                        aria-label={`Xoá danh mục ${c.name}`}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
            </div>
          </div>
        ))}
        <div className="add-row">
          <input
            className="input"
            style={{ maxWidth: 70, textAlign: 'center' }}
            value={newCategory.icon}
            onChange={(e) => setNewCategory((s) => ({ ...s, icon: e.target.value.slice(0, 2) }))}
            aria-label="Biểu tượng danh mục"
          />
          <input
            className="input"
            placeholder="Tên danh mục mới"
            value={newCategory.name}
            onChange={(e) => setNewCategory((s) => ({ ...s, name: e.target.value }))}
            aria-label="Tên danh mục mới"
          />
          <select
            className="input"
            value={newCategory.kind}
            onChange={(e) => setNewCategory((s) => ({ ...s, kind: e.target.value as TxKind }))}
            aria-label="Loại danh mục"
          >
            <option value="expense">Chi</option>
            <option value="income">Thu</option>
          </select>
          <button type="button" className="btn" onClick={addCategory} disabled={!newCategory.name.trim()}>
            Thêm
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Lưu trữ trên máy</div>
        {storage === null ? (
          <div className="hint">Đang đọc…</div>
        ) : (
          <>
            {storage.protection === 'app-private' && (
              <div className="store-state ok">
                <b>Dữ liệu nằm trong vùng riêng của ứng dụng</b>
                <div className="hint" style={{ marginTop: 4 }}>
                  Hệ thống dọn dung lượng chỉ xoá bộ nhớ đệm, không đụng tới đây. Dữ liệu chỉ mất khi bạn gỡ app hoặc
                  bấm "Xoá dữ liệu" trong cài đặt máy.
                </div>
              </div>
            )}

            {storage.protection === 'persisted' && (
              <div className="store-state ok">
                <b>Trình duyệt đã cam kết giữ dữ liệu</b>
                <div className="hint" style={{ marginTop: 4 }}>
                  Sẽ không bị xoá khi máy thiếu dung lượng.
                </div>
              </div>
            )}

            {storage.protection === 'best-effort' && (
              <div className="store-state warn">
                <b>Dữ liệu chưa được trình duyệt cam kết giữ</b>
                <div className="hint" style={{ marginTop: 4 }}>
                  Khi máy gần hết dung lượng, trình duyệt được phép xoá dữ liệu của XAXI mà không báo trước. Thêm XAXI
                  vào màn hình chính sẽ giúp được cấp.
                </div>
              </div>
            )}

            {storage.protection === 'unknown' && (
              <div className="hint">Thiết bị này không cho biết tình trạng lưu trữ.</div>
            )}

            {storage.quotaBytes > 0 && (
              <>
                <div className="meter" style={{ marginTop: 14 }}>
                  <i
                    style={{
                      width: `${Math.max(Math.min((storage.usageBytes / storage.quotaBytes) * 100, 100), 0.5)}%`,
                      background: 'var(--accent)',
                    }}
                  />
                </div>
                <div className="hint" style={{ marginTop: 6 }}>
                  Đang dùng <b>{formatBytes(storage.usageBytes)}</b> trên {formatBytes(storage.quotaBytes)} máy cho phép
                </div>
              </>
            )}

            {storage.canRequest && (
              <button
                type="button"
                className="btn sm primary"
                style={{ marginTop: 14 }}
                disabled={asking}
                onClick={async () => {
                  setAsking(true)
                  const granted = await requestPersistence()
                  await refreshStorage()
                  setAsking(false)
                  toast(
                    granted
                      ? 'Đã bật bảo vệ dữ liệu'
                      : 'Trình duyệt chưa cấp. Thêm XAXI vào màn hình chính rồi thử lại.',
                  )
                }}
              >
                {asking ? 'Đang xin…' : 'Xin trình duyệt giữ dữ liệu'}
              </button>
            )}

            <div className="hint" style={{ marginTop: 12 }}>
              Dù ở mức nào, gỡ app vẫn xoá sạch. Hãy xuất bản sao lưu định kỳ.
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">Dữ liệu</div>
        <div className="hint" style={{ marginBottom: 12 }}>
          Dữ liệu nằm trong máy bạn (IndexedDB). Không có tài khoản, không đồng bộ lên máy chủ. Muốn chuyển sang thiết bị
          khác thì xuất bản sao lưu rồi nhập lại.
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={exportJSON}>
            ⬇ Xuất bản sao lưu (JSON)
          </button>
          <button type="button" className="btn" onClick={() => restoreInput.current?.click()}>
            ⬆ Khôi phục từ JSON
          </button>
          <button type="button" className="btn" onClick={exportCSV}>
            📄 Xuất CSV (Excel)
          </button>
          <button type="button" className="btn" onClick={() => setSheet('statement')}>
            🏦 Nhập sao kê CSV
          </button>
        </div>
        <input
          ref={restoreInput}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => importJSON(e.target.files?.[0])}
        />
        <div className="btn-row" style={{ marginTop: 16 }}>
          <ConfirmButton
            label="Nạp dữ liệu mẫu"
            confirmLabel="Ghi đè giao dịch hiện có?"
            className="btn"
            armed={armedDemo}
            setArmed={setArmedDemo}
            onConfirm={async () => {
              await primeOpeningBalances(wallets)
              const summary = await loadDemoData()
              toast(`Đã nạp ${summary.transactions} giao dịch mẫu của 3 tháng`)
            }}
          />
          <ConfirmButton
            label="Xoá toàn bộ dữ liệu"
            confirmLabel="Chắc chắn xoá hết?"
            armed={armedWipe}
            setArmed={setArmedWipe}
            onConfirm={async () => {
              await wipeAll()
              toast('Đã xoá toàn bộ dữ liệu')
            }}
          />
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          Dữ liệu mẫu ghi đè toàn bộ giao dịch, ngân sách và khoản định kỳ hiện có, nhưng giữ nguyên danh mục và ví của bạn.
        </div>
      </div>

      <div className="card">
        <div className="card-title">Quyền riêng tư</div>
        <ul className="privacy-list">
          <li>Không đọc SMS, không nghe thông báo hệ thống, không dùng Accessibility Service.</li>
          <li>Không kết nối tới ngân hàng, không hỏi tài khoản / mật khẩu ngân hàng.</li>
          <li>Biên lai và sao kê chỉ được xử lý ngay trên máy, do bạn chủ động dán hoặc chọn tệp.</li>
          <li>Không tài khoản, không quảng cáo, không thống kê hành vi.</li>
        </ul>
      </div>

      <p className="footnote">XAXI · phiên bản 1.0 · hoạt động offline</p>

      {sheet === 'statement' && <StatementSheet onClose={() => setSheet(null)} />}
      {editingRule && <RecurringSheet editing={editingRule} onClose={() => setEditingRule(null)} />}
    </>
  )
}
