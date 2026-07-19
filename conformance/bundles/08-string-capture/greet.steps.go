// Go sibling of greet.steps.ts (bundle 08-string-capture).
package fixture

import "github.com/varar-dev/varar-go/varar"

func Register(s *varar.Steps[varar.Value]) {
	s.Stimulus("I greet {string}", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		return nil, nil
	})
}

func State() varar.Value {
	return varar.NullValue
}
