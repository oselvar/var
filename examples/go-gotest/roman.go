package example

import "strings"

var numerals = []struct {
	letter string
	value  int
}{
	{"M", 1000}, {"CM", 900}, {"D", 500}, {"CD", 400}, {"C", 100},
	{"XC", 90}, {"L", 50}, {"XL", 40}, {"X", 10}, {"IX", 9},
	{"V", 5}, {"IV", 4}, {"I", 1},
}

// ToRoman renders a decimal as a Roman numeral.
func ToRoman(num int) string {
	var b strings.Builder
	for _, n := range numerals {
		for num >= n.value {
			num -= n.value
			b.WriteString(n.letter)
		}
	}
	return b.String()
}
