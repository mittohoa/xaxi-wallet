import type { Answer } from '../lib/ask'
import { formatDate, formatDateLong } from '../lib/date'
import { formatMoney } from '../lib/format'
import { useLookups } from '../store'
import { Avatar, Figure, Money, flowColor } from './ui'

/**
 * Ve mot cau tra loi. Moi dang tra loi co mot cach trinh bay rieng,
 * nhung deu tuan thu: mot con so lon dan dat, phan con lai la chi tiet ngan gon.
 */
export function AnswerView({ answer, onPick }: { answer: Answer; onPick?: (text: string) => void }) {
  const { catById, walletById } = useLookups()

  switch (answer.kind) {
    case 'total': {
      const { totals, focus } = answer
      const headline = focus === 'income' ? totals.income : focus === 'expense' ? totals.expense : totals.expense
      return (
        <div className="answer">
          <div className="answer-label">{answer.title}</div>
          <div className={`answer-figure ${focus === 'income' ? 'income' : 'expense'}`}><Figure value={headline} /></div>
          <div className="answer-meta">
            {answer.count} giao dịch
            {focus === 'both' && totals.income > 0 && (
              <>
                {' · thu '}
                <b className="amount income">{formatMoney(totals.income)}</b>
              </>
            )}
            {answer.estimated > 0 && ` · ${answer.estimated} khoản là ước tính`}
          </div>
          {answer.count === 0 && <div className="answer-empty">Chưa ghi khoản nào trong khoảng này.</div>}
        </div>
      )
    }

    case 'breakdown':
      return (
        <div className="answer">
          <div className="answer-label">{answer.title}</div>
          <div className={`answer-figure ${answer.focus === 'income' ? 'income' : 'expense'}`}><Figure value={answer.total} /></div>
          <div className="rank" style={{ marginTop: 14 }}>
            {answer.slices.slice(0, 8).map((s) => (
              <div key={s.category.id} className="rank-item">
                <span className="rank-label">
                  <span aria-hidden="true">{s.category.icon}</span>
                  <span className="nm">{s.category.name}</span>
                  <span className="rank-pct">{Math.round(s.share * 100)}%</span>
                </span>
                <span className="rank-value">{formatMoney(s.amount)}</span>
                <span className="rank-track">
                  <span
                    className="rank-fill"
                    style={{ width: `${Math.max(s.share * 100, 2)}%`, background: flowColor(answer.focus) }}
                  />
                </span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'list':
      return (
        <div className="answer">
          <div className="answer-label">{answer.title}</div>
          <div className="answer-figure expense"><Figure value={Math.abs(answer.total)} /></div>
          <div className="answer-meta">{answer.transactions.length} giao dịch</div>
          <div className="list" style={{ marginTop: 10 }}>
            {answer.transactions.slice(0, 40).map((t) => {
              const cat = catById.get(t.categoryId)
              return (
                <div key={t.id} className="row" style={{ cursor: 'default' }}>
                  <Avatar icon={cat?.icon ?? '❓'} color={cat?.color ?? '#898781'} />
                  <span className="body">
                    <span className="name">{t.note || cat?.name || 'Không rõ'}</span>
                    <span className="meta">
                      {formatDate(t.date)} · {walletById.get(t.walletId)?.name ?? 'Ví đã xoá'}
                    </span>
                  </span>
                  <span className="trail">
                    <Money value={t.amount} kind={t.kind} signed />
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )

    case 'balance':
      return (
        <div className="answer">
          <div className="answer-label">{answer.title}</div>
          <div className="answer-figure"><Figure value={answer.total} /></div>
          <div className="list" style={{ marginTop: 10 }}>
            {answer.wallets.map(({ wallet, balance }) => (
              <div key={wallet.id} className="row" style={{ cursor: 'default' }}>
                <Avatar icon={wallet.icon} color={wallet.color} />
                <span className="body">
                  <span className="name">{wallet.name}</span>
                  <span className="meta">
                    {wallet.lastReconciledAt ? `đối soát ${formatDate(wallet.lastReconciledAt)}` : 'chưa đối soát lần nào'}
                  </span>
                </span>
                <span className="trail">{formatMoney(balance)}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'budget': {
      const totalLimit = answer.items.reduce((s, i) => s + i.limit, 0)
      const totalSpent = answer.items.reduce((s, i) => s + i.spent, 0)
      return (
        <div className="answer">
          <div className="answer-label">{answer.title}</div>
          <div className="answer-figure"><Figure value={Math.max(totalLimit - totalSpent, 0)} /></div>
          <div className="answer-meta">
            còn lại trên tổng {formatMoney(totalLimit)}
          </div>
          <div className="rank" style={{ marginTop: 14 }}>
            {answer.items.map(({ category, limit, spent }) => {
              const ratio = spent / limit
              const color = ratio > 1 ? 'var(--critical)' : ratio > 0.85 ? 'var(--warning)' : 'var(--good)'
              return (
                <div key={category.id} className="rank-item">
                  <span className="rank-label">
                    <span aria-hidden="true">{category.icon}</span>
                    <span className="nm">{category.name}</span>
                    <span className="rank-pct">{Math.round(ratio * 100)}%</span>
                  </span>
                  <span className="rank-value">{formatMoney(Math.max(limit - spent, 0))}</span>
                  <span className="rank-track">
                    <span className="rank-fill" style={{ width: `${Math.min(ratio * 100, 100)}%`, background: color }} />
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    case 'compare': {
      const cur = answer.focus === 'income' ? answer.current.income : answer.current.expense
      const prev = answer.focus === 'income' ? answer.previous.income : answer.previous.expense
      const diff = cur - prev
      const pct = prev > 0 ? Math.round((diff / prev) * 100) : null
      // Voi khoan chi, tang la dau hieu xau; voi khoan thu thi nguoc lai
      const worse = answer.focus === 'income' ? diff < 0 : diff > 0
      return (
        <div className="answer">
          <div className="answer-label">{answer.title}</div>
          <div className={`answer-figure ${answer.focus === 'income' ? 'income' : 'expense'}`}><Figure value={cur} /></div>
          <div className="answer-meta">
            {answer.currentLabel} · {answer.previousLabel} là {formatMoney(prev)}
          </div>
          <div className="compare-delta" style={{ color: worse ? 'var(--critical)' : 'var(--good)' }}>
            {diff === 0 ? 'Không đổi' : `${diff > 0 ? '▲' : '▼'} ${formatMoney(Math.abs(diff))}${pct === null ? '' : ` · ${Math.abs(pct)}%`}`}
          </div>
        </div>
      )
    }

    case 'coverage': {
      const pct = Math.round(answer.ratio * 100)
      return (
        <div className="answer">
          <div className="answer-label">{answer.title}</div>
          <div className="answer-figure">{pct}%</div>
          <div className="answer-meta">
            {answer.gaps.length === 0
              ? `Không bỏ sót ngày nào trong ${answer.window} ngày qua.`
              : `${answer.gaps.length}/${answer.window} ngày chưa ghi gì.`}
          </div>
          {answer.gaps.length > 0 && (
            <button type="button" className="btn sm primary" style={{ marginTop: 12 }} onClick={() => onPick?.('lấp khoảng trống')}>
              Lấp ngay
            </button>
          )}
          {answer.gaps.length > 0 && (
            <div className="chips" style={{ marginTop: 12 }}>
              {answer.gaps.slice(0, 8).map((d) => (
                <span key={d} className="chip" style={{ cursor: 'default' }}>
                  {formatDateLong(d)}
                </span>
              ))}
            </div>
          )}
        </div>
      )
    }

    case 'help':
      return (
        <div className="answer">
          <div className="answer-label">{answer.title}</div>
          <div className="help-grid">
            <div className="help-row">
              <code>cà phê 35k</code>
              <span>ghi một khoản chi</span>
            </div>
            <div className="help-row">
              <code>xăng 100k hôm qua</code>
              <span>ghi vào ngày khác</span>
            </div>
            <div className="help-row">
              <code>+15tr lương</code>
              <span>ghi khoản thu</span>
            </div>
            <div className="help-row">
              <code>tháng này ăn uống bao nhiêu</code>
              <span>hỏi tổng một danh mục</span>
            </div>
            <div className="help-row">
              <code>chi nhiều nhất vào việc gì</code>
              <span>xem phân bổ</span>
            </div>
            <div className="help-row">
              <code>tuần này so với tuần trước</code>
              <span>so sánh hai kỳ</span>
            </div>
            <div className="help-row">
              <code>còn bao nhiêu tiền</code>
              <span>số dư từng ví</span>
            </div>
            <div className="help-row">
              <code>grab</code>
              <span>tìm theo ghi chú</span>
            </div>
          </div>
          <div className="answer-label" style={{ marginTop: 18 }}>
            Mở màn hình
          </div>
          <div className="chips">
            {answer.commands
              .filter((c) => c.name !== 'help')
              .map((c) => (
                <button key={c.name} type="button" className="chip" onClick={() => onPick?.(c.triggers[0])}>
                  {c.label}
                </button>
              ))}
          </div>
        </div>
      )

    case 'none':
      return (
        <div className="answer">
          <div className="answer-label">{answer.title}</div>
          <div className="answer-empty">{answer.message}</div>
        </div>
      )
  }
}
