/**
 * Rà từng luồng của app trên MÁY THẬT, qua đúng giao diện.
 *
 * VÌ SAO CẦN, khi đã có hơn 150 bài kiểm thử: mọi lỗi đáng kể tìm được trong
 * quá trình làm app này đều nằm ở ranh giới giữa lớp web và lớp Android, và
 * không bài kiểm thử nào bắt được — vì chúng gọi thẳng vào hàm, còn lỗi thì
 * nằm ở chỗ hai lớp gặp nhau. Danh sách đã gặp:
 *
 *   · nội dung chia sẻ vào app bị vứt đi, mà app vẫn mở lên bình thường
 *   · nút Back đóng luôn app ở mọi màn hình
 *   · xuất sao lưu không tạo ra tệp nào nhưng vẫn báo "đã xuất"
 *   · cột biểu đồ chi tô đen kịt vì một biến CSS đổi tên
 *
 * Cả bốn đều IM LẶNG. Thứ bắt được chúng là chạy app thật rồi nhìn. Tệp này
 * biến việc đó thành một lệnh.
 *
 *   npm run device:check
 *
 * Cần bản DEBUG đang cài trên máy: bản phát hành cố ý không mở cổng gỡ lỗi.
 *
 * DỮ LIỆU: vài phép kiểm nạp dữ liệu mẫu, tức ghi đè giao dịch. Script sao lưu
 * toàn bộ CSDL trước khi chạy và trả lại sau, kể cả khi có phép kiểm hỏng.
 */
import { adb, connectedDevice } from './android-tools.mjs'

const PKG = 'com.mittohoa.xaxi_wallet'
const PORT = 9333

/* ============================================================
   Cầu nối tới WebView
   ============================================================ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function openPage() {
  const pid = adb(['shell', 'pidof', PKG]).split(/\s+/)[0]
  if (!pid) throw new Error(`${PKG} không chạy.`)

  adb(['forward', '--remove-all'])
  adb(['forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`])

  let target
  for (let i = 0; i < 25 && !target; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
    } catch {
      /* WebView chưa sẵn sàng */
    }
    if (!target) await sleep(400)
  }
  if (!target) {
    throw new Error(
      'Không nối được vào WebView.\n' +
        '  Bản phát hành cố ý không mở cổng gỡ lỗi — hãy cài bản debug:\n' +
        '    npm run android:apk && adb install -r android/app/build/outputs/apk/debug/app-debug.apk',
    )
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = () => reject(new Error('Không mở được kênh gỡ lỗi.'))
  })

  let seq = 0
  const waiting = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && waiting.has(m.id)) {
      waiting.get(m.id)(m)
      waiting.delete(m.id)
    }
  }

  return {
    close: () => ws.close(),
    async eval(body, { timeout = 90_000 } = {}) {
      const id = ++seq
      ws.send(
        JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression: `(async () => { ${HELPERS}\n${body} })()`, awaitPromise: true, returnByValue: true },
        }),
      )
      const res = await Promise.race([
        new Promise((r) => waiting.set(id, r)),
        sleep(timeout).then(() => ({ timedOut: true })),
      ])
      if (res.timedOut) throw new Error('quá hạn chờ trả lời từ WebView')
      const detail = res.result?.exceptionDetails
      if (detail) throw new Error(String(detail.exception?.description ?? detail.text).split('\n')[0])
      return res.result?.result?.value
    },
  }
}

/** Hàm dùng chung, nhét vào mọi đoạn mã chạy trong trang */
const HELPERS = `
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const setValue = (el, v) => {
    const P = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(P.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const wait = (fn, ms = 12000) => new Promise((res, rej) => {
    const t0 = Date.now();
    const tick = () => { let v; try { v = fn() } catch { v = null }
      if (v) return res(v);
      if (Date.now() - t0 > ms) return rej(new Error('quá hạn chờ giao diện'));
      setTimeout(tick, 120) };
    tick();
  });
  const esc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const dong = async () => { for (let i = 0; i < 3 && $('[role="dialog"]'); i++) { esc(); await sleep(600) } };
  const lenh = async (text) => {
    await dong();
    const i = await wait(() => $('.composer-input'));
    setValue(i, text); await sleep(350);
    i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(900); i.blur();
  };
  const moCSDL = () => new Promise((res, rej) => {
    const q = indexedDB.open('xaxi-v2');
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
  const docBang = (db, ten) => new Promise((res, rej) => {
    const r = db.transaction(ten).objectStore(ten).getAll();
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const soLieu = async () => {
    const db = await moCSDL(); const out = {};
    for (const t of ['transactions','budgets','recurring','dayMarks','wallets','categories'])
      out[t] = await docBang(db, t);
    db.close(); return out;
  };
  const tepGia = (ten, noiDung, kieu) => {
    const dt = new DataTransfer(); dt.items.add(new File([noiDung], ten, { type: kieu })); return dt.files;
  };
`

/* ============================================================
   Giữ nguyên dữ liệu của người chạy
   ============================================================ */

/**
 * Bảng cần sao lưu.
 *
 * Cố ý KHÔNG có `attachments`: ảnh biên lai là Blob, không đi qua được cầu nối
 * gỡ lỗi dưới dạng JSON, và không phép kiểm nào đụng tới chúng.
 */
const TABLES = ['categories', 'wallets', 'transactions', 'budgets', 'dayMarks', 'templates', 'recurring', 'settings']

async function snapshot(page) {
  return page.eval(`
    const db = await moCSDL(); const out = {};
    for (const t of ${JSON.stringify(TABLES)}) out[t] = await docBang(db, t);
    db.close();
    return JSON.stringify(out);
  `)
}

async function restore(page, json) {
  return page.eval(`
    const data = ${JSON.stringify(json)};
    const db = await moCSDL();
    const names = Object.keys(JSON.parse(data));
    await new Promise((res, rej) => {
      const t = db.transaction(names, 'readwrite');
      for (const n of names) t.objectStore(n).clear();
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
    await new Promise((res, rej) => {
      const parsed = JSON.parse(data);
      const t = db.transaction(names, 'readwrite');
      for (const n of names) for (const row of parsed[n]) t.objectStore(n).put(row);
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
    db.close();
    location.reload();
    return 'đã trả lại dữ liệu';
  `)
}

/* ============================================================
   Danh sách phép kiểm
   ============================================================ */

/**
 * Mỗi phép kiểm trả về một chuỗi bắt đầu bằng '✓' hoặc '✗'.
 *
 * Chúng chạy TUẦN TỰ và dùng chung một CSDL, nên thứ tự có ý nghĩa: nạp dữ
 * liệu mẫu trước, rồi các phép kiểm sau mới có gì để đọc.
 */
const CHECKS = [
  {
    name: 'app dựng xong',
    run: (page) => page.eval(`await wait(() => $('.composer-input'), 25000); return '✓'`),
  },
  {
    name: 'nạp dữ liệu mẫu',
    run: (page) =>
      page.eval(`
        await lenh('cài đặt');
        const d = await wait(() => $('[role="dialog"]'));
        const nut = [...d.querySelectorAll('button')].find((b) => /dữ liệu mẫu/i.test(b.textContent || ''));
        if (!nut) return '✗ không thấy nút nạp dữ liệu mẫu';
        click(nut); await sleep(600);
        const xn = [...d.querySelectorAll('button')].find((b) => /ghi đè|chắc chắn/i.test(b.textContent || ''));
        if (xn) { click(xn); await sleep(6000) }
        const s = await soLieu(); await dong();
        return s.transactions.length > 100
          ? '✓ ' + s.transactions.length + ' giao dịch · ' + s.budgets.length + ' ngân sách · ' + s.recurring.length + ' định kỳ'
          : '✗ chỉ có ' + s.transactions.length + ' giao dịch';
      `),
  },
  {
    name: 'ngân sách ghi được hạn mức',
    run: (page) =>
      page.eval(`
        await lenh('ngân sách');
        const d = await wait(() => $('[role="dialog"]'));
        const o = [...d.querySelectorAll('input')].find((i) => /hạn mức cho/i.test(i.getAttribute('aria-label') || ''));
        if (!o) return '✗ không thấy ô nhập hạn mức';
        const truoc = (await soLieu()).budgets.length;
        setValue(o, '1234000'); await sleep(400);
        // React ánh xạ onBlur sang focusout; bắn 'blur' thì nó không nghe thấy
        o.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        await sleep(1500);
        const sau = (await soLieu()).budgets;
        await dong();
        return sau.some((b) => b.limit === 1234000) ? '✓ ' + truoc + ' → ' + sau.length + ' hạn mức' : '✗ không ghi được';
      `),
  },
  {
    name: 'ngân sách loại danh mục hệ thống',
    run: (page) =>
      page.eval(`
        await lenh('ngân sách');
        const d = await wait(() => $('[role="dialog"]'));
        const nhan = [...d.querySelectorAll('input')].map((i) => i.getAttribute('aria-label') || '').join(' | ');
        await dong();
        // Chuyển tiền bị loại khỏi mọi phép tính thu/chi nên ô "đã chi" của nó
        // mãi mãi bằng 0 — một ô nhập không bao giờ làm được việc gì
        return /chuyển đi|chuyển đến|chưa rõ/i.test(nhan) ? '✗ có danh mục hệ thống: ' + nhan : '✓ chỉ danh mục thật';
      `),
  },
  {
    name: 'báo cáo vẽ được biểu đồ',
    run: (page) =>
      page.eval(`
        await lenh('báo cáo');
        const d = await wait(() => $('[role="dialog"]'));
        const tren = d.querySelector('.panel-ink .chart');
        const cot = d.querySelectorAll('.chart .bar-income, .chart .bar-expense').length;
        // Cột phải có màu thật: thiếu 'fill' thì SVG đổ về đen và che hết dữ liệu
        const mau = [...d.querySelectorAll('.chart .bar-expense')].map((n) => getComputedStyle(n).fill);
        const den = mau.filter((m) => m === 'rgb(0, 0, 0)').length;
        await dong();
        if (!tren) return '✗ biểu đồ không nằm trên thẻ mực';
        if (!cot) return '✗ không có cột nào';
        return den ? '✗ ' + den + ' cột tô đen' : '✓ ' + cot + ' cột trên thẻ mực';
      `),
  },
  {
    name: 'dự báo và khoản sắp tới',
    run: (page) =>
      page.eval(`
        await dong();
        const s = await soLieu();
        const co = !!$('.forecast-figure');
        const sap = $$('.console-section').some((x) => /sắp tới/i.test(x.textContent || ''));
        // Dự báo tự im lặng khi còn dưới ba ngày là hết kỳ — đúng thì cũng vô dụng
        const cuoiKy = new Date().getDate() >= 27;
        if (!co && !sap) return cuoiKy ? '✓ im lặng (cuối kỳ, đúng thiết kế)' : '✓ chưa đủ căn cứ nên im lặng';
        return '✓' + (co ? ' có dự báo' : '') + (sap ? ' có khoản sắp tới' : '');
      `),
  },
  {
    name: 'cảnh báo số tiền bất thường',
    run: (page) =>
      page.eval(`
        await dong();
        const i = await wait(() => $('.composer-input'));
        const doc = async (x) => { setValue(i, x); await sleep(800); return $('.composer-warn')?.textContent?.trim() ?? '' };
        const thuong = await doc('cà phê 73k');
        const bat = await doc('cà phê 730k');
        setValue(i, ''); i.blur();
        if (thuong) return '✗ báo nhầm với số tiền bình thường: ' + thuong;
        return bat ? '✓ bắt được: ' + bat.slice(0, 60) : '✗ không bắt được khoản gấp mười lần';
      `),
  },
  {
    name: 'nhân bản bằng nhấn giữ',
    run: (page) =>
      page.eval(`
        await dong();
        const gd = $$('.console-section').find((x) => /gần đây/i.test(x.textContent || ''));
        if (!gd) return '✗ không thấy mục gần đây';
        const row = gd.nextElementSibling.querySelector('.row');
        const truoc = (await soLieu()).transactions.length;
        row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        await sleep(800);
        row.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        click(row);
        await sleep(1200);
        const sau = (await soLieu()).transactions.length;
        const moMan = !!$('[role="dialog"]');
        await dong();
        if (sau !== truoc + 1) return '✗ không ghi thêm khoản nào (' + truoc + ' → ' + sau + ')';
        if (moMan) return '✗ vừa nhân bản vừa mở màn hình sửa';
        return $('.toast-action') ? '✓ ghi thêm 1 khoản, có nút Hoàn tác' : '✓ ghi thêm 1 khoản (thiếu nút Hoàn tác)';
      `),
  },
  {
    name: 'đối soát sinh bút toán bù',
    run: (page) =>
      page.eval(`
        await lenh('đối soát');
        const d = await wait(() => $('[role="dialog"]'));
        const o = [...d.querySelectorAll('input')].find((i) => i.inputMode === 'decimal');
        if (!o) return '✗ không thấy ô nhập số dư đếm được';
        setValue(o, '999000'); await sleep(600);
        const nut = [...d.querySelectorAll('button')].find((b) => /đối soát|xác nhận|lưu/i.test(b.textContent || ''));
        click(nut); await sleep(1500);
        const bu = (await soLieu()).transactions.find((t) => t.source === 'reconcile');
        await dong();
        return bu ? '✓ bù ' + bu.amount + '₫, đánh dấu ước tính=' + bu.estimated : '✗ không sinh bút toán bù';
      `),
  },
  {
    name: 'chuyển tiền không đổi tổng chi',
    run: (page) =>
      page.eval(`
        await dong();
        const tong = (s) => s.transactions.filter((t) => t.kind === 'expense' && !t.transferId).reduce((a, t) => a + t.amount, 0);
        const truoc = tong(await soLieu());
        await lenh('chuyển tiền');
        const d = await wait(() => $('[role="dialog"]'));
        setValue(d.querySelector('#tf-amount'), '500000'); await sleep(500);
        click([...d.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Chuyển'));
        await sleep(1500);
        const s = await soLieu(); await dong();
        const cap = s.transactions.filter((t) => t.transferId);
        if (cap.length !== 2) return '✗ phải sinh đúng 2 bản ghi, đang có ' + cap.length;
        return tong(s) === truoc ? '✓ cặp liên kết, tổng chi giữ nguyên ' + truoc + '₫' : '✗ tổng chi đổi ' + truoc + ' → ' + tong(s);
      `),
  },
  {
    name: 'nhập sao kê CSV',
    run: (page) =>
      page.eval(`
        await lenh('sao kê');
        const d = await wait(() => $('[role="dialog"]'));
        const inp = d.querySelector('input[type=file]');
        if (!inp) return '✗ không thấy ô chọn tệp';
        const truoc = (await soLieu()).transactions.length;
        inp.files = tepGia('saoke.csv', 'Ngay,Mo ta,So tien\\n25/09/2026,MUA SAM SHOPEE,-250000\\n', 'text/csv');
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(2200);
        const nut = [...d.querySelectorAll('button')].find((b) => /nhập|thêm|lưu/i.test(b.textContent || '') && !b.disabled);
        if (nut) { click(nut); await sleep(1800) }
        const sau = (await soLieu()).transactions.length;
        await dong();
        return sau > truoc ? '✓ nhập thêm ' + (sau - truoc) + ' giao dịch' : '✗ không nhập được';
      `),
  },
  {
    name: 'khoản định kỳ ghi được quy tắc',
    run: (page) =>
      page.eval(`
        await lenh('cài đặt');
        const d = await wait(() => $('[role="dialog"]'));
        const them = [...d.querySelectorAll('button')].find((b) => /Thêm/.test(b.textContent || ''));
        if (!them) return '✗ không thấy nút thêm';
        click(them); await sleep(900);
        const sheet = $$('[role="dialog"]').at(-1);
        const ten = sheet.querySelector('input[type=text], input:not([type])');
        const so = [...sheet.querySelectorAll('input')].find((i) => i.inputMode === 'decimal');
        if (!ten || !so) return '✗ biểu mẫu thiếu ô';
        setValue(ten, 'Kiểm thử định kỳ'); setValue(so, '4500000'); await sleep(500);
        click([...sheet.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Lưu'));
        await sleep(1500);
        const r = (await soLieu()).recurring.find((x) => x.name === 'Kiểm thử định kỳ');
        await dong();
        return r ? '✓ ' + r.amount + '₫ ' + r.freq + ', lần tới ' + r.nextDate : '✗ không ghi được quy tắc';
      `),
  },
  {
    name: 'khôi phục từ bản sao lưu',
    run: (page) =>
      page.eval(`
        await lenh('cài đặt');
        const d = await wait(() => $('[role="dialog"]'));
        const s = await soLieu();
        const sao = { app: 'xaxi', version: 1, exportedAt: new Date().toISOString(), data: {
          categories: s.categories, wallets: s.wallets, budgets: [], dayMarks: [], templates: [], recurring: [], settings: [],
          transactions: [{ id: 'kiem-khoi-phuc', kind: 'expense', amount: 777000, categoryId: s.categories[0].id,
            walletId: s.wallets[0].id, date: '2026-09-20', note: 'kiểm khôi phục', createdAt: Date.now(), updatedAt: Date.now() }],
        } };
        const inp = [...d.querySelectorAll('input[type=file]')].find((i) => /json/i.test(i.accept || ''));
        if (!inp) return '✗ không thấy ô chọn tệp JSON';
        inp.files = tepGia('sao-luu.json', JSON.stringify(sao), 'application/json');
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(2500);
        const co = (await soLieu()).transactions.some((t) => t.note === 'kiểm khôi phục');
        await dong();
        return co ? '✓ khôi phục xong' : '✗ không khôi phục được';
      `),
  },
  {
    name: 'ô nhập trả lời câu hỏi',
    run: (page) =>
      page.eval(`
        await lenh('tháng này chi bao nhiêu');
        await wait(() => $('.answer-figure'), 9000);
        const so = $('.answer-figure')?.textContent?.trim() ?? '';
        const dong2 = $('.answer-close'); if (dong2) click(dong2);
        await sleep(500);
        return so ? '✓ trả lời: ' + so : '✗ không có câu trả lời';
      `),
  },
]

/* ============================================================
   Phép kiểm cần tới lớp Android, không chạy được trong trang
   ============================================================ */

function launch() {
  adb(['shell', 'am', 'force-stop', PKG])
  adb(['shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1'])
}

const topPackage = () => (adb(['shell', 'dumpsys', 'activity', 'activities']).match(/topResumedActivity=\S+ u0 ([^/\s]+)/) ?? [])[1] ?? '?'

const SHELL_CHECKS = [
  {
    name: 'chia sẻ tin nhắn vào app',
    async run() {
      launch()
      await sleep(6000)
      adb([
        'shell', 'am', 'start', '-a', 'android.intent.action.SEND', '-t', 'text/plain',
        '--es', 'android.intent.extra.TEXT',
        "'BIDV: TK 9988 -120,000VND 29/09/2026 ND GRAB CHUYEN DI'", PKG,
      ])
      await sleep(7000)
      const page = await openPage()
      try {
        return await page.eval(`
          const d = $('[role="dialog"]');
          if (!d) return '✗ nội dung chia sẻ bị vứt đi — app mở lên nhưng không có gì';
          const t = d.querySelector('textarea')?.value ?? '';
          const co = /GRAB CHUYEN DI/.test(t);
          const dm = d.querySelector('select')?.selectedOptions?.[0]?.textContent ?? '';
          esc(); await sleep(600);
          return co ? '✓ mở đúng nội dung · danh mục đoán ra: ' + dm.trim() : '✗ nội dung sai: ' + t.slice(0, 40);
        `)
      } finally {
        page.close()
      }
    },
  },
  {
    name: 'nút Back đóng màn hình phụ, không đóng app',
    async run() {
      launch()
      await sleep(6000)
      const page = await openPage()
      try {
        await page.eval(`await wait(() => $('.console-gear'), 20000); click($('.console-gear')); await wait(() => $('[role="dialog"]')); return 'ok'`)
      } finally {
        page.close()
      }
      adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK'])
      await sleep(2500)
      const sauMot = topPackage()
      adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK'])
      await sleep(2500)
      const sauHai = topPackage()

      if (sauMot !== PKG) return '✗ lần Back đầu đã đóng app'
      if (sauHai === PKG) return '✗ Back ở màn hình chính không thoát được app'
      return '✓ đóng màn hình phụ trước, lần hai mới thoát'
    },
  },
]

/* ============================================================
   Chạy
   ============================================================ */

const results = []
const show = (name, text) => {
  results.push({ name, text })
  console.log(`  ${text.startsWith('✓') ? '' : ''}${name.padEnd(38)} ${text}`)
}

const device = connectedDevice()
if (!device) {
  console.error('Cần đúng MỘT thiết bị Android đang nối. `adb devices` để kiểm tra.')
  process.exit(1)
}
if (!adb(['shell', 'pm', 'list', 'packages', PKG]).includes(PKG)) {
  console.error(`Chưa cài ${PKG}. Chạy: npm run android:install`)
  process.exit(1)
}

console.log(`\n═══ RÀ TRÊN MÁY THẬT · ${device} ═══\n`)

launch()
await sleep(6000)

let page = await openPage()
let saved = null

try {
  saved = await snapshot(page)
  const rows = Object.entries(JSON.parse(saved)).map(([k, v]) => `${k} ${v.length}`)
  console.log(`  đã sao lưu dữ liệu: ${rows.join(' · ')}\n`)

  for (const check of CHECKS) {
    try {
      show(check.name, await check.run(page))
    } catch (e) {
      show(check.name, `✗ ${e.message}`)
    }
  }
} finally {
  if (saved) {
    try {
      await restore(page, saved)
      console.log('\n  đã trả lại dữ liệu ban đầu')
    } catch (e) {
      console.error(`\n  ⚠ KHÔNG trả lại được dữ liệu: ${e.message}`)
      console.error('  Dữ liệu trên máy đang là dữ liệu mẫu. Khôi phục từ bản sao lưu của bạn.')
    }
  }
  page.close()
}

console.log('')
for (const check of SHELL_CHECKS) {
  try {
    show(check.name, await check.run())
  } catch (e) {
    show(check.name, `✗ ${e.message}`)
  }
}

adb(['forward', '--remove-all'])

const failed = results.filter((r) => !r.text.startsWith('✓'))
console.log(`\n═══ ${results.length - failed.length}/${results.length} đạt ═══`)
if (failed.length) {
  console.log('\nKhông đạt:')
  for (const f of failed) console.log(`  · ${f.name}: ${f.text}`)
}
process.exit(failed.length ? 1 : 0)
