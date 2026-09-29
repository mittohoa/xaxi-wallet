/**
 * Kiểm thử bộ khách IMAP bằng một máy chủ IMAP GIẢ chạy thật trên TLS.
 *
 * Không mô phỏng, không thay thế hàm: bài kiểm dựng một máy chủ TLS thật, nói
 * đúng giao thức IMAP, và bộ khách nối tới nó qua socket thật. Đây là cách duy
 * nhất để biết phần đọc dữ liệu có đúng không — giao thức IMAP trả về gói tin
 * theo từng mảnh tuỳ ý, và lỗi hay nằm đúng ở chỗ ghép các mảnh đó lại.
 *
 * Chứng chỉ tự ký được sinh ngay trong bài kiểm; không có tệp bí mật nào nằm
 * trong repo.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import tls from 'node:tls'

import { ImapError, connect, imapDate } from '../scripts/imap/client.mjs'

/* ================= định dạng ngày ================= */

test('ngày theo đúng định dạng IMAP', () => {
  assert.equal(imapDate('2026-09-29'), '29-Sep-2026')
  assert.equal(imapDate('2026-01-05'), '5-Jan-2026')
})

/* ================= từ chối kết nối không an toàn ================= */

/**
 * Chặn ở tầng mã, không phải chỉ ghi trong tài liệu.
 *
 * Mật khẩu hộp thư không được phép đi qua một kết nối có thể bị đọc lén, và
 * "người dùng tự biết chọn cổng đúng" không phải là một cơ chế bảo vệ.
 */
test('từ chối cổng chưa mã hoá, trước cả khi mở kết nối', async () => {
  for (const port of [25, 110, 143, 587]) {
    await assert.rejects(
      () => connect({ host: 'localhost', port, user: 'a', pass: 'b' }),
      (e: Error) => e instanceof ImapError && /chưa mã hoá/.test(e.message),
      `cổng ${port} phải bị từ chối`,
    )
  }
})

/* ================= nói chuyện thật với máy chủ giả ================= */

function selfSigned() {
  const dir = mkdtempSync(join(tmpdir(), 'xaxi-imap-test-'))
  const cnf = join(dir, 'openssl.cnf')
  writeFileSync(
    cnf,
    '[req]\ndistinguished_name = dn\nx509_extensions = ext\nprompt = no\n[dn]\nCN = localhost\n[ext]\nsubjectAltName = DNS:localhost\n',
  )
  const key = join(dir, 'key.pem')
  const cert = join(dir, 'cert.pem')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', key, '-out', cert, '-days', '1', '-nodes', '-config', cnf], {
    stdio: 'ignore',
  })
  return { key: readFileSync(key), cert: readFileSync(cert) }
}

const THU = [
  'From: no-reply@bidv.com.vn',
  'Subject: Bien dong so du',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'TK 9988 -120,000VND 29/09/2026 ND GRAB CHUYEN DI',
].join('\r\n')

/** Máy chủ IMAP tối giản, đủ để bộ khách chạy hết một vòng */
function fakeServer(opts: { key: Buffer; cert: Buffer }, log: string[]) {
  const server = tls.createServer({ key: opts.key, cert: opts.cert }, (socket) => {
    socket.setEncoding('binary')
    socket.write('* OK [CAPABILITY IMAP4rev1] May chu gia san sang\r\n')

    socket.on('data', (raw) => {
      for (const line of String(raw).split('\r\n').filter(Boolean)) {
        const [tag, cmd] = [line.slice(0, line.indexOf(' ')), line.slice(line.indexOf(' ') + 1)]
        const verb = cmd.split(' ')[0].toUpperCase()
        log.push(verb)

        if (verb === 'LOGIN') socket.write(`${tag} OK dang nhap xong\r\n`)
        else if (verb === 'EXAMINE') {
          // Máy chủ chen dòng không mời mà đến — bộ khách phải đọc tới đúng thẻ
          socket.write('* 2 EXISTS\r\n* OK [READ-ONLY] chi doc\r\n')
          socket.write(`${tag} OK [READ-ONLY] EXAMINE xong\r\n`)
        } else if (verb === 'SEARCH') {
          socket.write('* SEARCH 1 2\r\n')
          socket.write(`${tag} OK SEARCH xong\r\n`)
        } else if (verb === 'FETCH') {
          const bytes = Buffer.byteLength(THU, 'utf8')
          socket.write(`* 1 FETCH (BODY[] {${bytes}}\r\n`)
          socket.write(THU, 'binary')
          socket.write(`)\r\n${tag} OK FETCH xong\r\n`)
        } else if (verb === 'LOGOUT') {
          socket.write(`* BYE tam biet\r\n${tag} OK LOGOUT xong\r\n`)
        } else socket.write(`${tag} BAD khong hieu\r\n`)
      }
    })
    socket.on('error', () => undefined)
  })
  return server
}

test('đi hết một vòng: đăng nhập, mở hộp thư, tìm, lấy thư', async () => {
  const pki = selfSigned()
  const log: string[] = []
  const server = fakeServer(pki, log)

  const port = await new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port))
  })

  try {
    const box = await connectAt(port, pki.cert)

    await box.examine('INBOX')
    const ids = await box.search('ALL')
    assert.deepEqual(ids, [1, 2], 'phải bỏ qua dòng không mời mà đến và đọc đúng kết quả SEARCH')

    const raw = await box.fetchRaw(1)
    assert.ok(raw.includes('GRAB CHUYEN DI'), 'phải lấy đúng số byte mà máy chủ khai báo')
    assert.equal(raw.length, Buffer.byteLength(THU, 'utf8'), 'không được lấy lẫn phần đuôi của phản hồi')

    await box.close()

    assert.deepEqual(log, ['LOGIN', 'EXAMINE', 'SEARCH', 'FETCH', 'LOGOUT'])
    assert.equal(log.includes('SELECT'), false, 'phải mở hộp thư ở chế độ chỉ đọc, không được dùng SELECT')
  } finally {
    server.close()
  }
})

test('đăng nhập sai thì báo lỗi mà KHÔNG in mật khẩu ra', async () => {
  const pki = selfSigned()
  const server = tls.createServer({ key: pki.key, cert: pki.cert }, (socket) => {
    socket.setEncoding('binary')
    socket.write('* OK san sang\r\n')
    socket.on('data', (raw) => {
      const tag = String(raw).slice(0, String(raw).indexOf(' '))
      socket.write(`${tag} NO sai mat khau\r\n`)
    })
    socket.on('error', () => undefined)
  })
  const port = await new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port))
  })

  try {
    await assert.rejects(
      () => connectAt(port, pki.cert, 'mat-khau-rat-bi-mat'),
      (e: Error) => {
        assert.equal(e.message.includes('mat-khau-rat-bi-mat'), false, 'mật khẩu không được lọt vào thông báo lỗi')
        return /LOGIN/.test(e.message)
      },
    )
  } finally {
    server.close()
  }
})

/** Nối tới máy chủ giả trên cổng ngẫu nhiên, tin chứng chỉ tự ký của nó */
async function connectAt(port: number, ca: Buffer, pass = 'mk') {
  return connect({ host: 'localhost', port, user: 'ai@do.vn', pass, ca })
}
