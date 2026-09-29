import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { formatCompact, formatMoney } from '../lib/format'
import { MONTH_NAMES } from '../lib/date'
import type { DayPoint, MonthPoint } from '../lib/stats'

/* ---------------- do be ngang container ---------------- */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

/* ---------------- tooltip dung chung ---------------- */

interface TipState {
  x: number
  y: number
  content: ReactNode
}

function useTooltip() {
  const [tip, setTip] = useState<TipState | null>(null)
  const show = useCallback((e: { clientX: number; clientY: number }, content: ReactNode) => {
    setTip({ x: e.clientX, y: e.clientY, content })
  }, [])
  const hide = useCallback(() => setTip(null), [])
  useEffect(() => {
    if (!tip) return
    const onScroll = () => setTip(null)
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [tip])
  const node = tip ? (
    <div className="tooltip" style={{ left: tip.x, top: tip.y }} role="presentation">
      {tip.content}
    </div>
  ) : null
  return { show, hide, node }
}

/* ---------------- hinh hoc ---------------- */

/** Chu nhat bo tron 4px o dau du lieu, chan phang tren duong co so */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, Math.max(h, 0))
  if (h <= 0.5) return `M${x} ${y + h} h${w}`
  return `M${x} ${y + h} V${y + r} a${r} ${r} 0 0 1 ${r} ${-r} h${w - 2 * r} a${r} ${r} 0 0 1 ${r} ${r} V${y + h} Z`
}

/**
 * Thang chia "đẹp": 1/2/2.5/5 x 10^n.
 *
 * VẠCH TRÊN CÙNG PHẢI LỚN HƠN HOẶC BẰNG GIÁ TRỊ LỚN NHẤT. Bản cũ dừng vòng lặp
 * ở `v <= max`, nên với max = 18tr và bước 5tr thì vạch cuối là 15tr — cột cao
 * 120% vùng vẽ, phần ngọn bị mép SVG cắt mất.
 *
 * Đó không phải lỗi thẩm mỹ mà là biểu đồ nói sai: 16tr và 18tr đều tràn ra
 * ngoài nên vẽ ra CAO BẰNG NHAU, và người đọc không có cách nào biết. Gần như
 * mọi giá trị đều rơi vào trường hợp này — chỉ những số đúng bằng một vạch mới
 * thoát.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0]
  const rough = max / count
  const mag = Math.pow(10, Math.floor(Math.log10(rough)))
  const norm = rough / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag

  /*
   * Làm tròn LÊN tới bội của bước, nên vạch trên cùng luôn chứa được cột cao
   * nhất.
   *
   * Sai số phải đúng nghĩa nhiễu dấu phẩy động chứ không phải một con số cho
   * dễ nhìn. Bản đầu của chính bản sửa này dùng `- 0.001` trên tỉ lệ, tức là
   * bỏ qua tới 0,1% của một bước — với bước 2,5 triệu thì nuốt mất 2.500 đ, và
   * 10.001.697 lại tràn ra ngoài y như cũ. Bài kiểm quét rộng bắt được.
   */
  const ratio = max / step
  const lamTron = Math.round(ratio)
  const top = (Math.abs(ratio - lamTron) < 1e-9 ? lamTron : Math.ceil(ratio)) * step

  const ticks: number[] = []
  for (let v = 0; v <= top + step * 1e-9; v += step) ticks.push(v)
  return ticks
}

/* ---------------- Bieu do cot kep: thu vs chi theo thang ---------------- */

export function MonthlyBars({ data }: { data: MonthPoint[] }) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const { show, hide, node } = useTooltip()

  const H = 200
  const M = { top: 12, right: 6, bottom: 24, left: 52 }
  const W = Math.max(width, 280)
  const plotW = W - M.left - M.right
  const plotH = H - M.top - M.bottom

  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const y = (v: number) => M.top + plotH - (v / top) * plotH

  const band = plotW / Math.max(data.length, 1)
  const groupW = Math.min(band * 0.68, 56)
  const barW = Math.max((groupW - 2) / 2, 3) // 2px khe giua hai cot ke nhau

  return (
    <div ref={ref}>
      {width > 0 && (
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label="Thu và chi theo tháng">
          {ticks.map((t) => (
            <g key={t}>
              <line className="gridline" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
              <text className="tick" x={M.left - 8} y={y(t) + 3.5} textAnchor="end">
                {formatCompact(t)}
              </text>
            </g>
          ))}
          <line className="baseline" x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} />

          {data.map((d, i) => {
            const cx = M.left + band * i + band / 2
            const x0 = cx - groupW / 2
            const label = `T${Number(d.month.slice(5, 7))}`
            return (
              <g
                key={d.month}
                className="col"
                tabIndex={0}
                role="button"
                aria-label={`${MONTH_NAMES[Number(d.month.slice(5, 7)) - 1]} ${d.month.slice(0, 4)}: thu ${formatMoney(d.income)}, chi ${formatMoney(d.expense)}`}
                onMouseMove={(e) =>
                  show(e, (
                    <>
                      <div style={{ fontWeight: 650, marginBottom: 2 }}>
                        {MONTH_NAMES[Number(d.month.slice(5, 7)) - 1]}/{d.month.slice(0, 4)}
                      </div>
                      <div>
                        <span className="dot income" /> Thu <b>{formatMoney(d.income)}</b>
                      </div>
                      <div>
                        <span className="dot expense" /> Chi <b>{formatMoney(d.expense)}</b>
                      </div>
                    </>
                  ))
                }
                onMouseLeave={hide}
                onFocus={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  show({ clientX: r.left + r.width / 2, clientY: r.top }, `${label}: thu ${formatMoney(d.income)} · chi ${formatMoney(d.expense)}`)
                }}
                onBlur={hide}
              >
                <rect className="hit" x={M.left + band * i} y={M.top} width={band} height={plotH} />
                <g className="marks">
                  <path className="bar-income" d={barPath(x0, y(d.income), barW, y(0) - y(d.income))} />
                  <path className="bar-expense" d={barPath(x0 + barW + 2, y(d.expense), barW, y(0) - y(d.expense))} />
                </g>
                <rect className="focus-ring" x={M.left + band * i + 1} y={M.top} width={band - 2} height={plotH} rx={6} />
                <text className="tick" x={cx} y={H - 7} textAnchor="middle">
                  {label}
                </text>
              </g>
            )
          })}
        </svg>
      )}
      <div className="legend">
        <span>
          <i className="dot income" /> Thu
        </span>
        <span>
          <i className="dot expense" /> Chi
        </span>
      </div>
      {node}
    </div>
  )
}

/* ---------------- Bieu do chi theo tung ngay trong thang ---------------- */

/**
 * Chỉ vẽ khoản CHI, không có tuỳ chọn vẽ khoản thu.
 *
 * Bản cũ nhận tham số `kind` để vẽ được cả hai, nhưng thu trong app này gần như
 * luôn là một hai lần lương: biểu đồ sẽ ra một cột cao và hai mươi chín ô
 * trống, không nói lên điều gì. Giữ một nhánh mã không ai gọi tới thì đến lúc
 * đổi phong cách vẫn phải sửa nó, mà không ai từng nhìn thấy kết quả.
 */
export function DailySpend({ data }: { data: DayPoint[] }) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const { show, hide, node } = useTooltip()

  const H = 140
  const M = { top: 10, right: 6, bottom: 20, left: 52 }
  const W = Math.max(width, 280)
  const plotW = W - M.left - M.right
  const plotH = H - M.top - M.bottom

  const values = data.map((d) => d.expense)
  const max = Math.max(1, ...values)
  const ticks = niceTicks(max, 2)
  const top = ticks[ticks.length - 1]
  const y = (v: number) => M.top + plotH - (v / top) * plotH

  const band = plotW / Math.max(data.length, 1)
  const barW = Math.max(band - 2, 2)

  return (
    <div ref={ref}>
      {width > 0 && (
        <svg
          className="chart"
          viewBox={`0 0 ${W} ${H}`}
          height={H}
          role="img"
          aria-label="Chi theo từng ngày"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="gridline" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
              <text className="tick" x={M.left - 8} y={y(t) + 3.5} textAnchor="end">
                {formatCompact(t)}
              </text>
            </g>
          ))}
          <line className="baseline" x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} />

          {data.map((d, i) => {
            const v = values[i]
            const x0 = M.left + band * i + 1
            return (
              <g
                key={d.date}
                className="col"
                onMouseMove={(e) => show(e, `Ngày ${d.day}: ${formatMoney(v)}`)}
                onMouseLeave={hide}
              >
                <rect className="hit" x={M.left + band * i} y={M.top} width={band} height={plotH} />
                <g className="marks">
                  <path className="bar-expense" d={barPath(x0, y(v), barW, y(0) - y(v))} />
                </g>
              </g>
            )
          })}

          {[1, 8, 15, 22, data.length].map((day) =>
            day <= data.length ? (
              <text key={day} className="tick" x={M.left + band * (day - 0.5)} y={H - 5} textAnchor="middle">
                {day}
              </text>
            ) : null,
          )}
        </svg>
      )}
      {node}
    </div>
  )
}
