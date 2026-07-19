// Go sibling of echo.steps.ts (bundle 04-tables-and-docstrings).
package fixture

import "github.com/varar-dev/varar-go/varar"

func Register(s *varar.Steps[varar.Value]) {
	// The doc string is this sensor's only slot, so it arrives as a string and
	// the returned string is compared against it; echoing it back passes.
	s.Sensor("I echo the following:", func(state varar.Value, doc string) (string, error) {
		return doc, nil
	})
}

func State() varar.Value {
	return varar.NullValue
}
