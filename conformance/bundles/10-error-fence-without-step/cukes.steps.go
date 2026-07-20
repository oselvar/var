// Go sibling of cukes.steps.ts (bundle 10-error-fence-without-step).
package fixture

import "github.com/varar-dev/varar/go/varar"

func Register(s *varar.Steps[varar.Value]) {
	// The prose matches no step, so the `error` fence has nothing to run →
	// error-fence-without-step diagnostic, and the example is dropped. This
	// step exists only so the registry matches the other ports'.
	s.Stimulus("I have {int} cukes", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		return nil, nil
	})
}

func State() varar.Value {
	return varar.NullValue
}
