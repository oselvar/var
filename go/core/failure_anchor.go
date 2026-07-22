package core

// Where a failure points in the .md — port of failure-anchor.ts /
// failure_anchor.rs. A mismatch anchors at its first failing span; anything else
// at the fallback (the step's match start).

func anchor(error StepError, fallback Span) Span {
	switch error.Kind {
	case SECellMismatch:
		for _, c := range error.Cells {
			if !c.Ok {
				return c.Span
			}
		}
		return fallback
	default:
		return fallback
	}
}
