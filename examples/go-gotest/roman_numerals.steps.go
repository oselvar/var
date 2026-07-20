package example

import (
	"fmt"
	"strconv"

	"github.com/varar-dev/varar/go/varar"
)

func registerRomanNumerals(s *varar.Steps[Ctx]) {
	s.Sensor("a decimal and a roman number",
		func(ctx Ctx, row map[string]string) (map[string]string, error) {
			n, err := strconv.Atoi(row["decimal"])
			if err != nil {
				return nil, fmt.Errorf("not a decimal: %s", row["decimal"])
			}
			return map[string]string{"decimal": row["decimal"], "roman": ToRoman(n)}, nil
		})
}
