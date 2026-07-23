// Go sibling of basket.steps.ts (bundle 18-multi-table-example).
//
// The two Given/And paragraphs each carry a table and are separated from each
// other by a blank line (valid GFM). They must merge into ONE example that
// shares state, so the sensor reads back 1 user and 1 asset. The second example
// — separated by the prose paragraph — starts from a fresh, empty basket and
// reads back 0 and 0, proving the prose paragraph is a delimiter. See ADR 0012.
package fixture

import "github.com/varar-dev/varar/go/varar"

// listOf returns the current list stored under key, or an empty list.
func listOf(state varar.Value, key string) []varar.Value {
	if m, ok := state.AsMap(); ok {
		if v, ok := m[key]; ok {
			if l, ok := v.AsList(); ok {
				return l
			}
		}
	}
	return []varar.Value{}
}

// firstColumn returns the first cell of each data row (the header row skipped).
func firstColumn(table [][]string) []varar.Value {
	out := []varar.Value{}
	for _, row := range table[1:] {
		if len(row) > 0 {
			out = append(out, varar.StrValue(row[0]))
		}
	}
	return out
}

// Register wires the two importing stimuli and the counting sensor. State is a
// schemaless map with "users" and "assets" lists; each stimulus returns the
// whole next state (full replacement), carrying the other list over.
func Register(s *varar.Steps[varar.Value]) {
	s.Stimulus("the following users have been imported",
		func(state varar.Value, table [][]string) (varar.Value, error) {
			return varar.MapValue(map[string]varar.Value{
				"users":  varar.ListOf(firstColumn(table)),
				"assets": varar.ListOf(listOf(state, "assets")),
			}), nil
		})
	s.Stimulus("the following assets have been imported",
		func(state varar.Value, table [][]string) (varar.Value, error) {
			return varar.MapValue(map[string]varar.Value{
				"users":  varar.ListOf(listOf(state, "users")),
				"assets": varar.ListOf(firstColumn(table)),
			}), nil
		})
	s.Sensor("the basket contains {int} user(s) and {int} asset(s)",
		func(state varar.Value, users, assets int) (int, int, error) {
			return len(listOf(state, "users")), len(listOf(state, "assets")), nil
		})
}

// State is the fresh, empty basket each example starts from.
func State() varar.Value {
	return varar.MapValue(map[string]varar.Value{
		"users":  varar.ListOf([]varar.Value{}),
		"assets": varar.ListOf([]varar.Value{}),
	})
}
