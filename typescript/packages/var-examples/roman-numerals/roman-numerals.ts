const NUMERALS: ReadonlyArray<readonly [string, number]> = [
  ['M', 1000],
  ['CM', 900],
  ['D', 500],
  ['CD', 400],
  ['C', 100],
  ['XC', 90],
  ['L', 50],
  ['XL', 40],
  ['X', 10],
  ['IX', 9],
  ['V', 5],
  ['IV', 4],
  ['I', 1],
]

export function toRoman(num: number): string {
  let result = ''
  for (const [letter, value] of NUMERALS) {
    while (num >= value) {
      num -= value
      result += letter
    }
  }
  return result
}
