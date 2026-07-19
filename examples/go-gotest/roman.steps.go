package example

import (
	"fmt"
	"strconv"

	"github.com/varar-dev/varar-go/varar"
)

func registerRomanNumerals(s *varar.Steps[Ctx]) {
	s.Sensor("a decimal and a roman number", func(ctx Ctx, args []varar.Value) (any, error) {
		row := args[0].CloneMap()
		decimal := row["decimal"].MustString()
		n, err := strconv.Atoi(decimal)
		if err != nil {
			return nil, fmt.Errorf("not a decimal: %s", decimal)
		}
		return varar.Ptr(varar.MapValue(map[string]varar.Value{
			"decimal": varar.StrValue(decimal),
			"roman":   varar.StrValue(ToRoman(n)),
		})), nil
	})
}
