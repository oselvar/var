// Go sibling of airports.steps.ts (bundle 13-custom-parameter-type).
package fixture

import (
	"fmt"
	"strings"

	"github.com/varar-dev/varar-go/varar"
)

func Register(s *varar.Steps[varar.Value]) {
	// Custom {airport} parameter type: IATA code, lowercased by parse. The
	// sensor asserts the lowercasing, so an identity parse would fail.
	s.Param("airport", "[A-Z]{3}", func(g []string) varar.Value {
		return varar.StrValue(strings.ToLower(g[0]))
	}, nil)

	s.Stimulus("I fly to {airport}", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		return varar.Ptr(varar.MapValue(map[string]varar.Value{"dest": args[0]})), nil
	})
	s.Sensor("The destination code is {word}", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		expected, _ := args[0].AsString()
		cleaned := strings.TrimRight(expected, ".!?")
		dest := ""
		if m, ok := state.AsMap(); ok {
			if dv, ok := m["dest"]; ok {
				if str, ok := dv.AsString(); ok {
					dest = str
				}
			}
		}
		if cleaned != dest {
			return nil, fmt.Errorf("expected %s but got %s", cleaned, dest)
		}
		return nil, nil
	})
}

func State() varar.Value {
	return varar.NullValue
}
