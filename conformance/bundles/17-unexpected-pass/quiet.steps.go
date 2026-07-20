// Go sibling of quiet.steps.ts (bundle 17-unexpected-pass).
//
// The example carries an `error` fence, so it asserts a failure. This stimulus
// returns no error, so the fence inverts into an UnexpectedPassError — the kind
// no bundle exercised before this one.
package fixture

import "github.com/varar-dev/varar/go/varar"

func Register(s *varar.Steps[varar.Value]) {
	s.Stimulus("I do nothing at all", func(state varar.Value) (varar.Value, error) {
		return state, nil
	})
}

func State() varar.Value {
	return varar.NullValue
}
