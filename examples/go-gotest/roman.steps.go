package example

import (
	"strconv"

	"github.com/varar-dev/varar-go/varar"
)

func registerRomanNumerals(s *varar.Steps) {
	s.Sensor("a decimal and a roman number", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		row := smap(args[0])
		decimal := asStr(row["decimal"])
		n, err := strconv.Atoi(decimal)
		if err != nil {
			panic("decimal: " + decimal)
		}
		return varar.Returns(varar.MapValue(map[string]varar.Value{
			"decimal": varar.StrValue(decimal),
			"roman":   varar.StrValue(ToRoman(n)),
		}))
	})
}
