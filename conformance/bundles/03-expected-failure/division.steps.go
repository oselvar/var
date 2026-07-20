// Go sibling of division.steps.ts (bundle 03-expected-failure).
package fixture

import (
	"errors"

	"github.com/varar-dev/varar/go/varar"
)

func Register(s *varar.Steps[varar.Value]) {
	s.Stimulus("I divide {int} by {int}", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		b, _ := args[1].AsInt()
		if b == 0 {
			return nil, errors.New("division by zero")
		}
		return varar.Ptr(state), nil
	})
}

func State() varar.Value {
	return varar.NullValue
}
