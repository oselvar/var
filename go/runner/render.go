package runner

import (
	"fmt"
	"strings"

	"github.com/varar-dev/varar/go/core"
)

// RenderFailure is a pure human-readable rendering of a step failure, anchored
// to the .md; it reuses the core diff payloads.
func RenderFailure(failure core.StepFailure, _source, path string) string {
	switch failure.Error.Kind {
	case core.SECellMismatch:
		lines := []string{fmt.Sprintf("Cell mismatch in %s:", path)}
		var failing []core.CellDiff
		for _, c := range failure.Error.Cells {
			if !c.Ok {
				failing = append(failing, c)
			}
		}
		if len(failing) == 0 {
			lines = append(lines, "  (no failing cells)")
		}
		for _, cell := range failing {
			lines = append(lines, fmt.Sprintf(
				"  line %d | column '%s' — expected: %q, actual: %q",
				cell.Span.StartLine, cell.Column, cell.Expected, cell.Actual,
			))
		}
		return strings.Join(lines, "\n")
	default:
		return failure.Error.Message()
	}
}
