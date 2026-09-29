import { useMemo } from 'react'
import { db, touch } from '../db/db'
import { monthRange } from '../lib/date'
import { formatMoney } from '../lib/format'
import { JARS, incomeBase, jarStates, totalPercent } from '../lib/jars'
import { inRange } from '../lib/stats'
import { saveSettings, useApp } from '../store'
import type { Id } from '../types'
import { Icon } from './Icon'

/**
 * Sáu hũ — chia thu nhập theo tỷ lệ.
 *
 * Màn hình này cố ý KHÔNG có nút "áp dụng" hay "lưu": sửa tỷ lệ là lưu ngay,
 * xếp danh mục vào hũ là lưu ngay. Mỗi nút xác nhận thêm vào là một lý do nữa
 * để người dùng bỏ dở giữa chừng.
 */
export function JarsView({ month }: { month: string }) {
  const { transactions, categories, settings, toast } = useApp()

  const base = useMemo(
    () => incomeBase(transactions, month, settings.startDayOfMonth),
    [transactions, month, settings.startDayOfMonth],
  )

  const periodTx = useMemo(() => {
    const r = monthRange(month, settings.startDayOfMonth)
    return inRange(transactions, r.start, r.end)
  }, [transactions, month, settings.startDayOfMonth])

  const states = useMemo(
    () => jarStates(periodTx, categories, settings, base.amount),
    [periodTx, categories, settings, base.amount],
  )

  const tong = totalPercent(settings)
  const expenseCategories = categories.filter((c) => c.kind === 'expense' && !c.slug)

  async function setPercent(slug: string, text: string) {
    const value = Number(text)
    if (!Number.isFinite(value) || value < 0) return
    await saveSettings({ jarPercents: { ...(settings.jarPercents ?? {}), [slug]: Math.round(value) } })
  }

  async function assign(categoryId: Id, jar: string) {
    await db.categories.update(categoryId, { ...touch(), jar: jar || undefined })
    toast(jar ? 'Đã xếp vào hũ' : 'Đã bỏ khỏi hũ')
  }

  return (
    <>
      <div className="card">
        <div className="card-title">Nền thu nhập</div>
        <div className="jar-base">
          {base.estimated && <span className="jar-approx">≈</span>}
          {formatMoney(base.amount)}
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          {base.amount === 0 ? (
            <>Chưa ghi khoản thu nào nên chưa chia hũ được. Ghi một khoản thu là sáu hũ có ngay hạn mức.</>
          ) : base.estimated ? (
            <>
              Kỳ này chưa có khoản thu nào, nên đây là <b>trung vị của {base.from} kỳ gần nhất</b>. Lương về là con số
              thật thay vào.
            </>
          ) : (
            <>Thu nhập đã nhận trong kỳ này. Hạn mức từng hũ là một tỷ lệ của con số đó.</>
          )}
        </div>
        {tong !== 100 && (
          <div className="hint" style={{ marginTop: 8, color: 'var(--warning)' }}>
            Sáu hũ đang cộng lại {tong}%, không phải 100%. Không sao nếu bạn cố ý — chỉ là phần chênh nằm ngoài hệ thống.
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Sáu hũ</div>
        {states.map((jar) => {
          const vuot = jar.limit > 0 && jar.spent > jar.limit
          const conNguyen = jar.saving && jar.spent === 0 && jar.limit > 0
          return (
            <div key={jar.slug} className="jar-row">
              <div className="jar-head">
                <span className="jar-name">
                  <span aria-hidden="true">{jar.icon}</span>
                  <span className="nm">{jar.name}</span>
                </span>
                <span className="jar-percent">
                  <input
                    className="input sm"
                    inputMode="numeric"
                    value={String(jar.percent)}
                    onChange={(e) => setPercent(jar.slug, e.target.value)}
                    aria-label={`Tỷ lệ cho hũ ${jar.name}`}
                  />
                  <span>%</span>
                </span>
              </div>

              <div className="meter" style={{ marginTop: 10 }}>
                <i
                  style={{
                    width: `${Math.min(jar.ratio * 100, 100)}%`,
                    background: vuot ? 'var(--critical)' : jar.saving ? 'var(--warning)' : 'var(--accent-text)',
                  }}
                />
              </div>

              <div className="budget-foot">
                <span>
                  {formatMoney(jar.spent)} / {formatMoney(jar.limit)}
                </span>
                <span style={{ color: vuot ? 'var(--critical)' : conNguyen ? 'var(--good)' : undefined }}>
                  {/* Biểu tượng không tự đặt màu: thẻ cha đã tô cả dòng theo trạng
                      thái, và `currentColor` cho nó đi theo đúng màu đó. */}
                  {jar.limit === 0 ? (
                    '—'
                  ) : vuot ? (
                    <>
                      <Icon name="warning" /> vượt {formatMoney(jar.spent - jar.limit)}
                    </>
                  ) : conNguyen ? (
                    <>
                      <Icon name="check" /> giữ được {formatMoney(jar.limit)}
                    </>
                  ) : (
                    `còn ${formatMoney(jar.remaining)}`
                  )}
                </span>
              </div>

              <div className="hint" style={{ marginTop: 6 }}>
                {jar.categories.length > 0
                  ? jar.categories.map((c) => `${c.icon} ${c.name}`).join(' · ')
                  : jar.saving
                    ? `${jar.hint} — chưa xếp danh mục nào, nên hũ này còn nguyên`
                    : `${jar.hint} — chưa xếp danh mục nào`}
              </div>
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="card-title">Xếp danh mục vào hũ</div>
        <div className="hint" style={{ marginBottom: 12 }}>
          Danh mục chưa xếp vẫn được ghi bình thường, chỉ là không nằm trong hũ nào — nên tổng sáu hũ sẽ nhỏ hơn tổng chi.
        </div>
        {expenseCategories.map((c) => (
          <div key={c.id} className="jar-assign">
            <span className="jar-name">
              <span aria-hidden="true">{c.icon}</span>
              <span className="nm">{c.name}</span>
            </span>
            <select
              className="input sm"
              value={c.jar ?? ''}
              onChange={(e) => assign(c.id, e.target.value)}
              aria-label={`Hũ cho danh mục ${c.name}`}
            >
              <option value="">Chưa xếp</option>
              {JARS.map((j) => (
                <option key={j.slug} value={j.slug}>
                  {j.icon} {j.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </>
  )
}
