// Go sibling of counter.steps.ts (bundle 02-context-isolation).
package fixture

import "github.com/varar-dev/varar/go/varar"

func countOf(state varar.Value) int {
	if m, ok := state.AsMap(); ok {
		if c, ok := m["count"]; ok {
			if n, ok := c.AsInt(); ok {
				return int(n)
			}
		}
	}
	return 0
}

func Register(s *varar.Steps[varar.Value]) {
	s.Stimulus("I increment", func(state varar.Value) (varar.Value, error) {
		return varar.MapValue(map[string]varar.Value{"count": varar.IntValue(int64(countOf(state) + 1))}), nil
	})
	// One slot ({int}): return the observed count and let the core compare it
	// against the number in the document, rather than asserting by hand.
	s.Sensor("The count is {int}", func(state varar.Value, expected int) (int, error) {
		return countOf(state), nil
	})
}

func State() varar.Value {
	return varar.MapValue(map[string]varar.Value{"count": varar.IntValue(0)})
}
