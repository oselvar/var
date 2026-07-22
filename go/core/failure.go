package core

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
	// SECellMismatch is one or more differing cells — an inline capture, a table
	// cell, a header-bound row's cell, or a doc string (only failing cells).
	SECellMismatch StepErrorKind = iota
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
	Cells          []CellDiff   // SECellMismatch
	ReturnShapeMsg string       // SEReturnShape
	Handler        HandlerError // SEHandler
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
// quote renders s the way JSON.stringify does in the TypeScript port.
//
// Every port quotes doc-string mismatch messages identically because the text is
// matched by substring in an `error` fence — a port that quotes differently fails a
// spec its siblings pass. Escaping only \\, " and \n is not enough: doc strings
// routinely carry tab-indented code. encoding/json is not usable here because it
// also escapes <, > and & by default.
func quote(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 2)
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '\\':
			b.WriteString("\\\\")
		case '"':
			b.WriteString("\\\"")
		case '\n':
			b.WriteString("\\n")
		case '\r':
			b.WriteString("\\r")
		case '\t':
			b.WriteString("\\t")
		case '\b':
			b.WriteString("\\b")
		case '\f':
			b.WriteString("\\f")
		default:
			if r < 0x20 {
				fmt.Fprintf(&b, "\\u%04x", r)
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
	return b.String()
}
