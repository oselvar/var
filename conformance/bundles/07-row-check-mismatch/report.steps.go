// Go sibling of report.steps.ts (bundle 07-row-check-mismatch).
package fixture

import "github.com/varar-dev/varar/go/varar"

func Register(s *varar.Steps[varar.Value]) {
	// Header-bound row step: returns its computed columns; the core diffs them
	// against the row cells (rowChecks). score 99 ≠ 10 → CellMismatch.
	s.Sensor("I report the score and grade", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		return varar.Ptr(varar.MapValue(map[string]varar.Value{
			"score": varar.StrValue("99"),
			"grade": varar.StrValue("A"),
		})), nil
	})
}

func State() varar.Value {
	return varar.NullValue
}
