/**
 * Nối bộ hợp nhất và lớp mã hoá vào cơ sở dữ liệu thật.
 *
 * Hai hàm, một chiều đi và một chiều về:
 *
 *   buildSyncFile  — đọc hết dữ liệu, mã hoá, trả ra tệp để mang sang máy khác
 *   applySyncFile  — mở tệp, hợp nhất với dữ liệu đang có, ghi lại
 *
 * KHÔNG CÓ MÁY CHỦ. Người dùng tự mang tệp đi: Drive, USB, tự gửi cho mình. Ai
 * cầm được tệp cũng chỉ thấy một khối byte — khoá không bao giờ rời khỏi máy.
 *
 * Cụm mật khẩu KHÔNG được lưu ở đâu cả, phải gõ lại mỗi lần. Lưu nó đi thì có
 * thêm một bí mật nằm trên đĩa, mà lợi ích chỉ là đỡ gõ vài giây cho một việc
 * mỗi tuần làm một lần.
 */
import { SYNC_TABLES, db } from '../../db/db'
import { buildBackup } from '../backup'
import { todayISO } from '../date'
import type { BackupFile } from '../../types'
import { type Envelope, decryptSync, encryptSync } from './crypto'
import { type MergeReport, mergeData } from './merge'

/** Bản của định dạng tệp đồng bộ, ghi vào phần đã mã hoá để đọc lại kiểm được */
const PAYLOAD_VERSION = 1

interface Payload {
  app: 'xaxi'
  version: number
  exportedAt: string
  data: BackupFile['data']
}

export async function buildSyncFile(passphrase: string): Promise<Envelope> {
  const backup = await buildBackup()
  const payload: Payload = {
    app: 'xaxi',
    version: PAYLOAD_VERSION,
    exportedAt: new Date().toISOString(),
    data: backup.data,
  }
  return encryptSync(payload, passphrase)
}

export interface ApplyResult extends MergeReport {
  /** mốc tệp kia được tạo, để nói cho người dùng biết mình vừa gộp cái gì */
  exportedAt: string | null
}

/**
 * Mở tệp, hợp nhất, ghi lại.
 *
 * Ghi bằng `bulkPut` chứ không xoá sạch rồi thêm như khôi phục sao lưu: hợp
 * nhất là cộng thêm vào dữ liệu đang có, không phải thay nó. Xoá sạch trước khi
 * ghi còn có nghĩa là có một khoảnh khắc cơ sở dữ liệu trống — mất điện đúng
 * lúc đó là mất hết.
 */
export async function applySyncFile(envelope: unknown, passphrase: string): Promise<ApplyResult> {
  const payload = (await decryptSync(envelope, passphrase)) as Partial<Payload>
  if (payload?.app !== 'xaxi' || !payload.data) {
    throw new Error('Tệp mở được nhưng bên trong không phải dữ liệu XAXI.')
  }

  const mine = (await buildBackup()).data
  const { data, report } = mergeData(mine, payload.data)

  await db.transaction(
    'rw',
    SYNC_TABLES.map((name) => db.table(name)),
    async () => {
      for (const name of SYNC_TABLES) {
        const rows = data[name as keyof typeof data] ?? []
        if (rows.length > 0) await db.table(name).bulkPut(rows)
      }
    },
  )

  return { ...report, exportedAt: payload.exportedAt ?? null }
}

/**
 * Tên tệp mang theo ngày, để nhiều lần xuất không đè lên nhau.
 *
 * Dùng `todayISO()` chứ không `toISOString()`: cái sau trả về ngày theo giờ
 * UTC. Ở Việt Nam (UTC+7) thì từ 0h tới 7h sáng nó lùi lại một ngày — xuất bản
 * sao lưu và tệp đồng bộ cách nhau vài giây lúc 1h sáng mà ra hai ngày khác
 * nhau, và người dùng không biết tệp nào mới hơn.
 */
export function syncFileName(iso = todayISO()): string {
  return `xaxi-dong-bo-${iso}.xaxi`
}
