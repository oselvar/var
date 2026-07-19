// Go sibling of cukes.steps.ts (bundle 05-ambiguous-match).
package fixture

import "github.com/varar-dev/varar-go/varar"

func Register(s *varar.Steps[varar.Value]) {
	// Both expressions match "I have 5 cukes" → ambiguous-match diagnostic.
	s.Stimulus("I have {int} cukes", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		return nil, nil
	})
	s.Stimulus("I have 5 cukes", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		return nil, nil
	})
}

func State() varar.Value {
	return varar.NullValue
}
