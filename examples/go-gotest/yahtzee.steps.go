package example

import (
	"strconv"
	"strings"

	"github.com/varar-dev/varar-go/varar"
)

func registerYahtzee(s *varar.Steps) {
	s.Sensor("Examples of dice, category and score", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		row := smap(args[0])
		var dice []int64
		for _, d := range strings.Split(asStr(row["dice"]), ",") {
			n, err := strconv.ParseInt(strings.TrimSpace(d), 10, 64)
			if err != nil {
				panic("die: " + d)
			}
			dice = append(dice, n)
		}
		category := asStr(row["category"])
		return varar.Returns(varar.MapValue(map[string]varar.Value{
			"score": varar.IntValue(Score(dice, category)),
		}))
	})
}
