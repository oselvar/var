package core

// Doc-string comparison — port of doc-string-diff.ts / doc_string_diff.rs.

// DocStringColumn is the column label a doc-string cell carries in a CellDiff,
// so its mismatch message reads `doc string: expected … but was …`.
const DocStringColumn = "doc string"

// compareDocString compares a doc-string step's return against the fence body
// (exact equality, trailing newline included).
//
// A doc string is ONE CELL, compared whole, so a difference is an ordinary
// CellDiff and the executor raises the same SECellMismatch as any other cell.
// Expected/Actual are quoted: a doc string routinely differs only in
// whitespace, and bare text would render a missing trailing newline as no
// difference at all.
//
// returned nil → no check. A non-string return → a SEReturnShape StepError.
func compareDocString(returned *Value, content string, span Span) (*CellDiff, *StepError) {
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
	return &CellDiff{
		Column:   DocStringColumn,
		Span:     span,
		Expected: quote(content),
		Actual:   quote(s),
		Ok:       false,
	}, nil
}
