// Go sibling of numerals.steps.ts (bundle 01-roman-numerals).
//
// Full-replacement state: the {result} map is the whole state.
package fixture

import (
	"fmt"
	"strings"

	"github.com/varar-dev/varar-go/varar"
)

func roman(n int64) (string, bool) {
	switch n {
	case 1:
		return "I", true
	case 4:
		return "IV", true
	case 9:
		return "IX", true
	case 40:
		return "XL", true
	}
	return "", false
}

func Register(s *varar.Steps[varar.Value]) {
	s.Stimulus("I convert {int} to roman numerals", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		n, _ := args[0].AsInt()
		m := map[string]varar.Value{}
		if r, ok := roman(n); ok {
			m["result"] = varar.StrValue(r)
		}
		return varar.Ptr(varar.MapValue(m)), nil
	})
	s.Sensor("The result is {word}", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		// {word} greedily captures trailing punctuation ("I." not "I"); strip
		// it, then fail on mismatch rather than returning (which would make the
		// core compare the RAW captured "I." and wrongly fail). Returning
		// nothing opts out, matching the .ts/.rs sensors.
		expected, _ := args[0].AsString()
		cleaned := strings.TrimRight(expected, ".!?")
		result := ""
		if m, ok := state.AsMap(); ok {
			if rv, ok := m["result"]; ok {
				if str, ok := rv.AsString(); ok {
					result = str
				}
			}
		}
		if cleaned != result {
			return nil, fmt.Errorf("expected %s but got %s", cleaned, result)
		}
		return nil, nil
	})
}

func State() varar.Value {
	return varar.MapValue(map[string]varar.Value{})
}
