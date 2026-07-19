package varcore

// Doc-string comparison — port of doc-string-diff.ts / doc_string_diff.rs.

// DocStringDiff is a doc-string content difference: the fence body's span plus
// expected/actual.
type DocStringDiff struct {
	Span     Span
	Expected string
	Actual   string
}

// compareDocString compares a doc-string step's return against the fence body
// (exact equality, trailing newline included). returned nil → no check. A
// non-string return → a SEReturnShape StepError.
func compareDocString(returned *Value, content string, span Span) (*DocStringDiff, *StepError) {
	if returned == nil {
		return nil, nil
	}
	if returned.Kind != KindString {
		err := returnShapeError("expected a doc string (string), got " + returned.TypeName())
		return nil, &err
	}
	s := returned.Str
	if s == content {
		return nil, nil
	}
	return &DocStringDiff{Span: span, Expected: content, Actual: s}, nil
}
