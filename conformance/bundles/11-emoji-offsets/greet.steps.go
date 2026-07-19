// Go sibling of greet.steps.ts (bundle 11-emoji-offsets).
package fixture

import "github.com/varar-dev/varar-go/varar"

func Register(s *varar.Steps[varar.Value]) {
	// The list item is followed by a table, appended as a trailing arg, so this
	// sensor's slots are {string} + the table (returns nothing → passes).
	s.Sensor("I greet {string}", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		return nil, nil
	})
}

func State() varar.Value {
	return varar.NullValue
}
