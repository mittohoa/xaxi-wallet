/**
 * Mục tiêu tiết kiệm.
 *
 * ĐIỀU KIỆN ĐỂ TÍNH NĂNG NÀY ĐÁNG TỒN TẠI: tiến độ phải TỰ TÍNH.
 *
 * Mục tiêu tiết kiệm là khối xuất hiện dày đặc trong các app tài chính khác, và
 * nó giải đúng vấn đề gốc của XAXI — cho người ta một lý do để tiếp tục ghi
 * chép. Nhưng cách làm thông thường là bắt người dùng tự cập nhật "đã góp được
 * bao nhiêu", tức thêm một việc phải nhớ làm hằng tháng. Người quên ghi chi tiêu
 * thì cũng quên cập nhật tiến độ, và một thanh tiến độ đứng yên ba tháng còn tệ
 * hơn không có: nó nói dối.
 *
 * Ở đây mỗi mục tiêu gắn với MỘT VÍ, và tiến độ chính là số dư ví đó. Người dùng
 * chuyển tiền vào ví — việc họ vốn đã làm — là tiến độ tự chạy. Sau khi đặt
 * xong, mục tiêu không đòi thêm một thao tác nào nữa.
 */
import { monthRange, shiftMonth } from './date'
import { inRange } from './stats'
import type { Goal, Id, Transaction, Wallet } from '../types'

/**
 * Dòng tiền ròng vào một ví trong khoảng thời gian.
 *
 * TÍNH CẢ chuyển tiền giữa ví — khác với mọi phép tính thu/chi khác trong app.
 * Ở đây điều đó là đúng: chuyển 2 triệu từ ví chính sang ví tiết kiệm CHÍNH LÀ
 * hành động tiết kiệm. Loại nó ra thì mọi mục tiêu sẽ mãi mãi đứng ở 0.
 */
export function walletFlow(txs: Transaction[], walletId: Id, start: string, end: string): number {
  return inRange(txs, start, end)
    .filter((t) => t.walletId === walletId)
    .reduce((s, t) => s + (t.kind === 'income' ? t.amount : -t.amount), 0)
}

export interface GoalState {
  goal: Goal
  wallet: Wallet | undefined
  /** đã có, chính là số dư ví */
  saved: number
  remaining: number
  /** 0–1, cắt ngọn ở 1 để thanh không tràn */
  ratio: number
  done: boolean
  /** góp trung bình mỗi tháng, suy từ lịch sử ví */
  monthlyRate: number
  /**
   * Kỳ dự kiến đạt, 'YYYY-MM'. null khi chưa đủ căn cứ để nói.
   *
   * Không đủ căn cứ nghĩa là: chưa có tháng nào hoàn tất để đo, hoặc tốc độ góp
   * đang bằng 0 hoặc âm. Bịa ra một ngày đạt trong trường hợp đó là nói dối về
   * chính tiền của người dùng.
   */
  projected: string | null
  /** cần góp mỗi tháng để kịp hạn; null khi mục tiêu không đặt hạn */
  neededPerMonth: number | null
  /** đang kịp tiến độ không; null khi không đặt hạn hoặc chưa đo được tốc độ */
  onTrack: boolean | null
}

/** Số tháng từ `from` tới `to`, tối thiểu 0 */
function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return Math.max(0, (ty - fy) * 12 + (tm - fm))
}

/**
 * Tốc độ góp trung bình mỗi tháng.
 *
 * Đo trên các kỳ ĐÃ HOÀN TẤT, không tính kỳ đang chạy dở: kỳ mới đi được ba
 * ngày sẽ kéo trung bình xuống và làm ngày dự kiến đạt lùi ra hàng năm.
 *
 * Trả về 0 khi chưa có kỳ nào hoàn tất — bên gọi phải hiểu đó là "chưa đo được",
 * không phải "không tiết kiệm được đồng nào".
 */
export function savingRate(
  txs: Transaction[],
  walletId: Id,
  thisMonth: string,
  startDayOfMonth: number,
  months = 3,
): { rate: number; measured: number } {
  let total = 0
  let measured = 0
  for (let i = 1; i <= months; i++) {
    const m = shiftMonth(thisMonth, -i)
    const r = monthRange(m, startDayOfMonth)
    total += walletFlow(txs, walletId, r.start, r.end)
    measured++
  }
  return { rate: measured > 0 ? total / measured : 0, measured }
}

export function goalStates(
  goals: Goal[],
  wallets: Wallet[],
  balances: Map<Id, number>,
  txs: Transaction[],
  thisMonth: string,
  startDayOfMonth: number,
): GoalState[] {
  const byId = new Map(wallets.map((w) => [w.id, w]))

  return goals
    .filter((g) => !g.archived)
    .map((goal) => {
      const saved = Math.max(0, balances.get(goal.walletId) ?? 0)
      const remaining = Math.max(0, goal.target - saved)
      const done = goal.target > 0 && saved >= goal.target

      const { rate } = savingRate(txs, goal.walletId, thisMonth, startDayOfMonth)
      const monthlyRate = Math.round(rate)

      let projected: string | null = null
      if (!done && monthlyRate > 0 && remaining > 0) {
        projected = shiftMonth(thisMonth, Math.ceil(remaining / monthlyRate))
      }

      let neededPerMonth: number | null = null
      let onTrack: boolean | null = null
      if (goal.dueDate && !done) {
        const left = monthsBetween(thisMonth, goal.dueDate.slice(0, 7))
        // Hạn đã qua hoặc là chính kỳ này: cần góp trọn phần còn thiếu ngay
        neededPerMonth = Math.ceil(remaining / Math.max(left, 1))
        onTrack = monthlyRate > 0 ? monthlyRate >= neededPerMonth : null
      }

      return {
        goal,
        wallet: byId.get(goal.walletId),
        saved,
        remaining,
        ratio: goal.target > 0 ? Math.min(saved / goal.target, 1) : 0,
        done,
        monthlyRate,
        projected,
        neededPerMonth,
        onTrack,
      }
    })
    .sort((a, b) => {
      // Xong thì xuống cuối; còn lại xếp theo mức gần đạt
      if (a.done !== b.done) return a.done ? 1 : -1
      return b.ratio - a.ratio
    })
}

/**
 * Ví đã được mục tiêu khác dùng.
 *
 * Hai mục tiêu cùng trỏ vào một ví thì cả hai cùng hiện một số dư — cả hai đều
 * sai, và không có gì báo. Màn hình phải chặn trước lúc tạo.
 */
export function claimedWallets(goals: Goal[], exceptGoalId?: Id): Set<Id> {
  return new Set(goals.filter((g) => !g.archived && g.id !== exceptGoalId).map((g) => g.walletId))
}
