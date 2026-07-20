// Go sibling of replace.steps.ts (bundle 16-stimulus-state-replacement).
//
// The second stimulus returns a map carrying only "b". Under the
// full-replacement contract "a" is therefore gone, and the sensor reads it back
// as 0. A merging executor would carry "a": 1 over and read back 1 — which is
// exactly what this bundle pins.
package fixture

import "github.com/varar-dev/varar/go/varar"

func fieldOf(state varar.Value, name string) int {
	if m, ok := state.AsMap(); ok {
		if v, ok := m[name]; ok {
			if n, ok := v.AsInt(); ok {
				return int(n)
			}
		}
	}
	return 0
}

func Register(s *varar.Steps[varar.Value]) {
	s.Stimulus("I set a to 1 and b to 2", func(state varar.Value) (varar.Value, error) {
		return varar.MapValue(map[string]varar.Value{
			"a": varar.IntValue(1),
			"b": varar.IntValue(2),
		}), nil
	})
	s.Stimulus("I set only b to 3", func(state varar.Value) (varar.Value, error) {
		return varar.MapValue(map[string]varar.Value{"b": varar.IntValue(3)}), nil
	})
	s.Sensor("Then a is {int} and b is {int}",
		func(state varar.Value, a, b int) (int, int, error) {
			return fieldOf(state, "a"), fieldOf(state, "b"), nil
		})
}

func State() varar.Value {
	return varar.MapValue(map[string]varar.Value{
		"a": varar.IntValue(0),
		"b": varar.IntValue(0),
	})
}
