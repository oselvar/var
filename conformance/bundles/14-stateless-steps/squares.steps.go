// Go sibling of squares.steps.ts (bundle 14-stateless-steps).
//
// Pure steps — nothing to arrange or evolve — so State() is the bare null every
// handler ignores. Written in the typed form: each {int} arrives as an int, and
// the two returned ints are compared positionally against the two slots, the
// same contract as the .ts sibling's `[n, n * n]` tuple.
package fixture

import "github.com/varar-dev/varar-go/varar"

func Register(s *varar.Steps[varar.Value]) {
	s.Stimulus("I warm up my mental math", func(state varar.Value) (varar.Value, error) {
		return state, nil
	})
	s.Sensor("The square of {int} is {int}.",
		func(state varar.Value, n, square int) (int, int, error) {
			return n, n * n, nil
		})
}

func State() varar.Value {
	return varar.NullValue
}
