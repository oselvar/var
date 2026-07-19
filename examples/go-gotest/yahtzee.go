package example

import "sort"

// Score computes a Yahtzee category score for dice.
func Score(dice []int64, category string) int64 {
	counts := map[int64]int64{}
	var total int64
	for _, d := range dice {
		counts[d]++
		total += d
	}
	sumOf := func(face int64) int64 { return counts[face] * face }
	ofAKind := func(n int64) int64 {
		best := int64(-1)
		for face, c := range counts {
			if c >= n && face > best {
				best = face
			}
		}
		if best < 0 {
			return 0
		}
		return n * best
	}

	sorted := append([]int64{}, dice...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	var sortedDice string
	for _, d := range sorted {
		sortedDice += string(rune('0' + d))
	}

	switch category {
	case "ones":
		return sumOf(1)
	case "twos":
		return sumOf(2)
	case "threes":
		return sumOf(3)
	case "fours":
		return sumOf(4)
	case "fives":
		return sumOf(5)
	case "sixes":
		return sumOf(6)
	case "pair":
		return ofAKind(2)
	case "two pairs":
		var pairs []int64
		for face, c := range counts {
			if c >= 2 {
				pairs = append(pairs, face)
			}
		}
		if len(pairs) >= 2 {
			var s int64
			for _, face := range pairs {
				s += 2 * face
			}
			return s
		}
		return 0
	case "three of a kind":
		return ofAKind(3)
	case "four of a kind":
		return ofAKind(4)
	case "small straight":
		if sortedDice == "12345" {
			return 15
		}
		return 0
	case "large straight":
		if sortedDice == "23456" {
			return 20
		}
		return 0
	case "full house":
		var cs []int64
		for _, c := range counts {
			cs = append(cs, c)
		}
		sort.Slice(cs, func(i, j int) bool { return cs[i] < cs[j] })
		if len(counts) == 2 && len(cs) == 2 && cs[0] == 2 && cs[1] == 3 {
			return total
		}
		return 0
	case "Yahtzee":
		if len(counts) == 1 {
			return 50
		}
		return 0
	case "chance":
		return total
	}
	panic("Unknown category: " + category)
}
