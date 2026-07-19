package varcore

import (
	"fmt"
	"strings"
)

// The step-failure model — Go's replacement for the reference's typed exception
// hierarchy (CellMismatch, DocStringMismatch, ReturnShape, UnexpectedPass,
// author failure). A tagged StepError replaces instanceof dispatch.

// StepErrorKind classifies a StepError.
type StepErrorKind int

const (
	// SECellMismatch is a table / header-bound row mismatch (only failing cells).
	SECellMismatch StepErrorKind = iota
	// SEDocStringMismatch is a doc-string body mismatch.
	SEDocStringMismatch
	// SEReturnShape is a wrong return type/shape — an author mistake.
	SEReturnShape
	// SEUnexpectedPass is an error-fenced example that ran without failing.
	SEUnexpectedPass
	// SEHandler is an author-signalled failure or a recovered panic.
	SEHandler
)

// StepError is a step failure verdict — the closed union replacing the
// exception hierarchy.
type StepError struct {
	Kind           StepErrorKind
	Cells          []CellDiff    // SECellMismatch
	DocDiff        DocStringDiff // SEDocStringMismatch
	ReturnShapeMsg string        // SEReturnShape
	Handler        HandlerError  // SEHandler
}

// Message is the human-readable message (getMessage parity).
func (e StepError) Message() string {
	switch e.Kind {
	case SECellMismatch:
		parts := make([]string, len(e.Cells))
		for i, c := range e.Cells {
			parts[i] = fmt.Sprintf("%s: expected %s but was %s", c.Column, c.Expected, c.Actual)
		}
		return strings.Join(parts, "; ")
	case SEDocStringMismatch:
		return fmt.Sprintf("doc string: expected %s but was %s", quote(e.DocDiff.Expected), quote(e.DocDiff.Actual))
	case SEReturnShape:
		return e.ReturnShapeMsg
	case SEUnexpectedPass:
		return "expected the example to fail, but it passed"
	case SEHandler:
		return e.Handler.Message
	}
	return ""
}

// cellMismatchError builds a SECellMismatch StepError.
func cellMismatchError(cells []CellDiff) StepError {
	return StepError{Kind: SECellMismatch, Cells: cells}
}

func docStringMismatchError(diff DocStringDiff) StepError {
	return StepError{Kind: SEDocStringMismatch, DocDiff: diff}
}

func returnShapeError(msg string) StepError {
	return StepError{Kind: SEReturnShape, ReturnShapeMsg: msg}
}

func handlerStepError(he HandlerError) StepError {
	return StepError{Kind: SEHandler, Handler: he}
}

// FailureLocation is where a failure points in the .md.
type FailureLocation struct {
	Label string
	Path  string
	Line  int
}

// StepFailure is a caught step failure plus its (optional) source location.
type StepFailure struct {
	Error    StepError
	Location *FailureLocation
}

// bareFailure is a failure with no attached location (fallback-line path).
func bareFailure(error StepError) StepFailure {
	return StepFailure{Error: error}
}

// quote mirrors JSON.stringify's quoting of the doc-string error message closely
// enough for a human-readable message (never parsed back).
func quote(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "\"", "\\\"")
	s = strings.ReplaceAll(s, "\n", "\\n")
	return "\"" + s + "\""
}
