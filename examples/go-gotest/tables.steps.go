package example

import (
	"strings"

	"github.com/varar-dev/varar-go/varar"
)

func registerTablesAndDocstrings(s *varar.Steps[Ctx]) {
	// A whole-table slot has no primitive Go spelling, so it stays a Value on
	// both sides — the typed form composes, but buys nothing here.
	s.Sensor("Uppercase each one:", func(ctx Ctx, table varar.Value) (varar.Value, error) {
		out := []varar.Value{}
		for _, row := range table.MustList()[1:] { // skip the header row
			before := row.MustList()[0].MustString()
			out = append(out, varar.MapValue(map[string]varar.Value{
				"before": varar.StrValue(before),
				"after":  varar.StrValue(strings.ToUpper(before)),
			}))
		}
		return varar.ListOf(out), nil
	})

	// Two slots — the {word} capture and the trailing doc string — so two
	// strings in, two strings out, compared positionally.
	s.Sensor("Greet {word}:", func(ctx Ctx, name, doc string) (string, string, error) {
		return name, "Hello, " + name + "!\n", nil
	})
}
