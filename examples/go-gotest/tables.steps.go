package example

import (
	"strings"

	"github.com/varar-dev/varar-go/varar"
)

func registerTablesAndDocstrings(s *varar.Steps) {
	s.Sensor("Uppercase each one:", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		rows, ok := args[0].AsList()
		if !ok {
			panic("expected a table")
		}
		out := []varar.Value{}
		for _, row := range rows[1:] { // skip the header row
			cells, ok := row.AsList()
			if !ok {
				panic("expected a row")
			}
			before := asStr(cells[0])
			out = append(out, varar.MapValue(map[string]varar.Value{
				"before": varar.StrValue(before),
				"after":  varar.StrValue(strings.ToUpper(before)),
			}))
		}
		return varar.Returns(varar.ListOf(out))
	})

	s.Sensor("Greet {word}:", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		name := asStr(args[0])
		return varar.Returns(varar.ListValue(
			varar.StrValue(name),
			varar.StrValue("Hello, "+name+"!\n"),
		))
	})
}
