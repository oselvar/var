export function score(dice: ReadonlyArray<number>, category: string): number {
  const counts = new Map<number, number>()
  for (const d of dice) counts.set(d, (counts.get(d) ?? 0) + 1)
  const sum = dice.reduce((a, b) => a + b, 0)
  const sumOf = (face: number) => (counts.get(face) ?? 0) * face
  // n-of-a-kind: the highest face appearing at least n times, scored n*face.
  const ofAKind = (n: number) => {
    const faces = [...counts].filter(([, c]) => c >= n).map(([face]) => face)
    return faces.length > 0 ? n * Math.max(...faces) : 0
  }
  const sorted = [...dice].sort((a, b) => a - b).join('')
  switch (category) {
    case 'ones':
      return sumOf(1)
    case 'twos':
      return sumOf(2)
    case 'threes':
      return sumOf(3)
    case 'fours':
      return sumOf(4)
    case 'fives':
      return sumOf(5)
    case 'sixes':
      return sumOf(6)
    case 'pair':
      return ofAKind(2)
    case 'two pairs': {
      const pairs = [...counts].filter(([, c]) => c >= 2).map(([face]) => face)
      return pairs.length >= 2 ? pairs.reduce((a, face) => a + 2 * face, 0) : 0
    }
    case 'three of a kind':
      return ofAKind(3)
    case 'four of a kind':
      return ofAKind(4)
    case 'small straight':
      return sorted === '12345' ? 15 : 0
    case 'large straight':
      return sorted === '23456' ? 20 : 0
    case 'full house': {
      const cs = [...counts.values()].sort((a, b) => a - b)
      return counts.size === 2 && cs[0] === 2 && cs[1] === 3 ? sum : 0
    }
    case 'Yahtzee':
      return counts.size === 1 ? 50 : 0
    case 'chance':
      return sum
    default:
      throw new Error(`Unknown category: ${category}`)
  }
}
