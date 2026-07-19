package example

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/varar-dev/varar-go/varar"
)

func registerYahtzee(s *varar.Steps[Ctx]) {
	// Header-bound row: the row arrives as a map and the return is compared by
	// COLUMN, not positionally by slot — so the typed form composes but its
	// (Value) -> (Value) signature says less than the explicit form does.
	s.Sensor("Examples of dice, category and score",
		func(ctx Ctx, row varar.Value) (varar.Value, error) {
			m := row.CloneMap()
			var dice []int64
			for _, d := range strings.Split(m["dice"].MustString(), ",") {
				n, err := strconv.ParseInt(strings.TrimSpace(d), 10, 64)
				if err != nil {
					return varar.NullValue, fmt.Errorf("not a die: %s", d)
				}
				dice = append(dice, n)
			}
			return varar.MapValue(map[string]varar.Value{
				"score": varar.IntValue(Score(dice, m["category"].MustString())),
			}), nil
		})
}
