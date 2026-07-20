// Go sibling of money.steps.ts (bundle 15-custom-parameter-format).
//
// Money is encoded as a bare Float (pounds); format renders it back in document
// notation, so the pinned mismatch reads £2.60 / £2.55.
package fixture

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/varar-dev/varar/go/varar"
)

func Register(s *varar.Steps[varar.Value]) {
	parse := func(g []string) varar.Value {
		raw := strings.TrimPrefix(g[0], "£")
		value, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			value = 0
		}
		return varar.FloatValue(value)
	}
	format := func(v varar.Value) (string, bool) {
		if x, ok := v.AsFloat(); ok {
			return fmt.Sprintf("£%.2f", x), true
		}
		return "", false
	}
	s.Param("money", `£\d+\.\d{2}`, parse, format)

	// Returns the WRONG money on purpose; the golden pins the formatted actual
	// "£2.60", proving mismatches render through format.
	s.Sensor("The late fee is {money}", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		return varar.Ptr(varar.FloatValue(2.6)), nil
	})
}

func State() varar.Value {
	return varar.NullValue
}
