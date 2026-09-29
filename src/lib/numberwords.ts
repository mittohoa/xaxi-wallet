/**
 * Doc so tien viet bang chu tieng Viet: 'ba muoi lam nghin' -> 35000.
 *
 * Can thiet vi bo nhan dang giong noi tra ve chu chu khong phai chu so — noi
 * 'ca phe ba muoi lam nghin' thi nhan duoc dung cum do, khong co con so nao.
 *
 * Dau vao la chuoi da bo dau (qua normalize), de khong phai xu ly ca 'nghìn'
 * lan 'nghin'.
 */

const DIGITS: Record<string, number> = {
  khong: 0,
  mot: 1,
  hai: 2,
  ba: 3,
  bon: 4,
  tu: 4,
  nam: 5,
  lam: 5,
  nham: 5,
  sau: 6,
  bay: 7,
  tam: 8,
  chin: 9,
  // 'mot' o vi tri hang don vi sau 'muoi' doc la 'mot'
  mote: 1,
}

/** 'muoi mot' -> 11, nhung 'hai muoi mot' doc la 'hai muoi mot' */
const TENS = new Set(['muoi', 'chuc'])
const HUNDRED = new Set(['tram'])
const SKIP = new Set(['linh', 'le', 've', 'va'])

const SCALES: Record<string, number> = {
  nghin: 1_000,
  ngan: 1_000,
  k: 1_000,
  trieu: 1_000_000,
  tr: 1_000_000,
  ty: 1_000_000_000,
  ti: 1_000_000_000,
}

const HALF = new Set(['ruoi', 'ruoi'])

/** Mot tu co tham gia vao cum so hay khong */
function isNumberWord(word: string): boolean {
  return (
    word in DIGITS ||
    TENS.has(word) ||
    HUNDRED.has(word) ||
    word in SCALES ||
    HALF.has(word) ||
    SKIP.has(word) ||
    /^\d+$/.test(word)
  )
}

/** Doc mot day tu da biet chac la cum so */
function evaluate(words: string[]): number | null {
  let total = 0
  let group = 0
  let unit: number | null = null
  let lastScale = 1
  let sawAnything = false

  for (const word of words) {
    if (SKIP.has(word)) continue

    if (/^\d+$/.test(word)) {
      unit = Number(word)
      sawAnything = true
      continue
    }

    if (word in DIGITS) {
      unit = DIGITS[word]
      sawAnything = true
      continue
    }

    if (TENS.has(word)) {
      group += (unit ?? 1) * 10
      unit = null
      sawAnything = true
      continue
    }

    if (HUNDRED.has(word)) {
      group += (unit ?? 1) * 100
      unit = null
      sawAnything = true
      continue
    }

    if (word in SCALES) {
      const scale = SCALES[word]
      group += unit ?? 0
      total += (group || 1) * scale
      lastScale = scale
      group = 0
      unit = null
      sawAnything = true
      continue
    }

    if (HALF.has(word)) {
      // 'hai trieu ruoi' = 2.5 trieu — mot nua cua bac vua dung
      total += lastScale / 2
      sawAnything = true
      continue
    }
  }

  if (!sawAnything) return null
  const value = total + group + (unit ?? 0)
  return value > 0 ? Math.round(value) : null
}

export interface NumberWordHit {
  value: number
  /** vi tri cum so trong chuoi da chuan hoa */
  start: number
  end: number
}

/**
 * Tim cum so bang chu DAI NHAT trong cau.
 * Tra ve null neu khong tim thay cum nao ra duoc so duong.
 */
export function findNumberWords(folded: string): NumberWordHit | null {
  const words: { text: string; start: number; end: number }[] = []
  const re = /[a-z0-9]+/g
  for (let m = re.exec(folded); m; m = re.exec(folded)) {
    words.push({ text: m[0], start: m.index, end: m.index + m[0].length })
  }

  let best: NumberWordHit | null = null
  let i = 0
  while (i < words.length) {
    if (!isNumberWord(words[i].text)) {
      i++
      continue
    }
    let j = i
    while (j < words.length && isNumberWord(words[j].text)) j++

    // Bo cac tu bo tro o hai dau cum ('va', 'le') de khong nuot chu khong can
    let from = i
    let to = j - 1
    while (from <= to && SKIP.has(words[from].text)) from++
    while (to >= from && SKIP.has(words[to].text)) to--

    if (from <= to) {
      const slice = words.slice(from, to + 1)
      const value = evaluate(slice.map((w) => w.text))
      // Cum chi gom mot chu so tron ('ba') khong du de coi la so tien noi mieng
      const meaningful = slice.length > 1 || /^\d+$/.test(slice[0].text)
      if (value !== null && meaningful && (!best || value > best.value)) {
        best = { value, start: slice[0].start, end: slice[slice.length - 1].end }
      }
    }
    i = j
  }

  return best
}
