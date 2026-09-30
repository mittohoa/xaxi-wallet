/**
 * Dung lai bo cuc cua mot to giay tu toa do tung dong chu.
 *
 * Tach rieng khoi lop cau noi native: day la hinh hoc thuan, khong dinh gi toi
 * Capacitor hay ML Kit, nen kiem duoc tren may tinh ma khong can dien thoai.
 */

/** Mot dong chu kem o bao quanh no tren anh */
export interface OcrLine {
  text: string
  x: number
  y: number
  w: number
  h: number
}

/**
 * Dung lai bo cuc thuc te cua to giay tu toa do tung dong.
 *
 * VI SAO CAN: tren mot to hoa don, nhan va so nam hai dau mot dong, cach nhau
 * mot khoang trong rong. ML Kit coi hai cot do la HAI KHOI khac nhau, nen
 * `getText()` tra ve tat ca nhan truoc roi moi den tat ca so:
 *
 *     Tong cong            174.000
 *     THANH TOAN    ==>    13.920
 *     Tien mat             187.920
 *
 * Khong dong nao con chua ca nhan lan so cua no. Da do tren may that: chup mot
 * to hoa don ra chu doc duoc nhung khong ra so tien nao.
 *
 * Ham nay gom cac dong CHONG NHAU THEO CHIEU DOC thanh mot hang, roi xep theo
 * chieu ngang — dung lai dung thu tu mat nguoi doc.
 */
export function rebuildLayout(lines: OcrLine[]): string {
  if (lines.length === 0) return ''

  const conLai = [...lines].sort((a, b) => a.y - b.y)
  const hang: OcrLine[][] = []

  for (const line of conLai) {
    const giua = line.y + line.h / 2
    // Cung mot hang khi tam cua dong nay nam trong chieu cao cua hang do
    const cu = hang.find((h) => {
      const top = Math.min(...h.map((l) => l.y))
      const bot = Math.max(...h.map((l) => l.y + l.h))
      return giua >= top && giua <= bot
    })
    if (cu) cu.push(line)
    else hang.push([line])
  }

  return hang
    .map((h) => [...h].sort((a, b) => a.x - b.x).map((l) => l.text.trim()).join('  '))
    .join('\n')
}
