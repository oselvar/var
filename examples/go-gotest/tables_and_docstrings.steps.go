package example

import (
	"strings"

	"github.com/varar-dev/varar/go/varar"
)

func registerTablesAndDocstrings(s *varar.Steps[Ctx]) {
	// A whole-table slot arrives as rows of cells and the computed table goes
	// back as rows keyed by column.
	s.Sensor("Uppercase each one:", func(ctx Ctx, table [][]string) ([]map[string]string, error) {
		out := []map[string]string{}
		for _, row := range table[1:] { // skip the header row
			out = append(out, map[string]string{"before": row[0], "after": strings.ToUpper(row[0])})
		}
		return out, nil
	})

	// Two slots — the {word} capture and the trailing doc string — so two
	// strings in, two strings out, compared positionally.
	s.Sensor("Greet {word}:", func(ctx Ctx, name, doc string) (string, string, error) {
		return name, "Hello, " + name + "!\n", nil
	})
}
