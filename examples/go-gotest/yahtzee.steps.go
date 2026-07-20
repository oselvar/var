package example

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/varar-dev/varar/go/varar"
)

func registerYahtzee(s *varar.Steps[Ctx]) {
	// Header-bound row: the row arrives keyed by column, and the computed
	// columns go back the same way for the core to diff cell by cell.
	s.Sensor("Examples of dice, category and score",
		func(ctx Ctx, row map[string]string) (map[string]string, error) {
			var dice []int64
			for _, d := range strings.Split(row["dice"], ",") {
				n, err := strconv.ParseInt(strings.TrimSpace(d), 10, 64)
				if err != nil {
					return nil, fmt.Errorf("not a die: %s", d)
				}
				dice = append(dice, n)
			}
			return map[string]string{
				"score": strconv.FormatInt(Score(dice, row["category"]), 10),
			}, nil
		})
}
