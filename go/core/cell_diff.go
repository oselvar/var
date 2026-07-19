package varcore

import (
	"fmt"
	"strconv"
)

// Table row/cell comparison — port of cell-diff.ts / cell_diff.rs.

// CellDiff is the verdict for one checked column: expected vs actual, plus raw
// values and whether a parameter-type format produced actual.
type CellDiff struct {
	Column        string
	Span          Span
	Expected      string
	Actual        string
	Ok            bool
	ExpectedValue *Value
	ActualValue   *Value
	Formatted     bool
}

// newCellDiff is the five-component form (row/table paths): raw values nil, not
// formatted.
func newCellDiff(column string, span Span, expected, actual string, ok bool) CellDiff {
	return CellDiff{Column: column, Span: span, Expected: expected, Actual: actual, Ok: ok}
}

// RowCheck is one checked column of one header-bound row.
type RowCheck struct {
	Column string
	Value  string
	Span   Span
}

// NewRowCheck builds a RowCheck.
func NewRowCheck(column, value string, span Span) RowCheck {
	return RowCheck{Column: column, Value: value, Span: span}
}

// renderCellValue is display rules 2–4 of the mismatch-rendering chain: a string
// as-is, anything else a best-effort stringification.
func renderCellValue(value Value) string {
	switch value.Kind {
	case KindString:
		return value.Str
	case KindInt:
		return strconv.FormatInt(value.Int, 10)
	case KindFloat:
		return formatFloat(value.Float)
	case KindBool:
		if value.Bool {
			return "true"
		}
		return "false"
	case KindNull:
		return "null"
	default:
		// Port-native fallback (deliberately outside conformance): a bundle that
		// pins an object-valued actual must give the parameter type a format.
		return fmt.Sprintf("%v", value)
	}
}

// formatFloat renders a float the way the reference's `format!("{d}")` does — an
// integral value keeps no decimals, else shortest round-trip.
func formatFloat(d float64) string {
	if d == float64(int64(d)) {
		return strconv.FormatInt(int64(d), 10)
	}
	return strconv.FormatFloat(d, 'g', -1, 64)
}

// compareRow compares a row step's returned map against the row's cells. Only
// columns present on returned are checked; a non-map/nil return checks nothing.
func compareRow(returned *Value, checks []RowCheck) []CellDiff {
	if returned == nil || returned.Kind != KindMap {
		return nil
	}
	obj := returned.Map
	var diffs []CellDiff
	for _, check := range checks {
		value, ok := obj[check.Column]
		if !ok {
			continue
		}
		actual := renderCellValue(value)
		diffs = append(diffs, newCellDiff(check.Column, check.Span, check.Value, actual, actual == check.Value))
	}
	return diffs
}

// compareTable compares a whole-table step's returned table against the input
// table. nil checks nothing; type/shape problems return a SEReturnShape error.
func compareTable(returned *Value, input Table) ([]CellDiff, *StepError) {
	if returned == nil {
		return nil, nil
	}
	if returned.Kind != KindList {
		err := returnShapeError(fmt.Sprintf("expected a table (array of rows), got %s", returned.TypeName()))
		return nil, &err
	}
	rows := returned.List
	columns := input.Header.Cells
	dataRows := input.Rows
	if len(rows) != len(dataRows) {
		err := returnShapeError(fmt.Sprintf("expected %d row(s), got %d", len(dataRows), len(rows)))
		return nil, &err
	}
	allArrays := true
	allRecords := true
	for _, r := range rows {
		if r.Kind != KindList {
			allArrays = false
		}
		if r.Kind != KindMap {
			allRecords = false
		}
	}
	if !allArrays && !allRecords {
		err := returnShapeError("table rows must be all arrays or all objects")
		return nil, &err
	}

	var diffs []CellDiff
	for i := range dataRows {
		dataRow := dataRows[i]
		ret := rows[i]
		if allArrays {
			if len(ret.List) != len(columns) {
				err := returnShapeError(fmt.Sprintf("row %d: expected %d column(s), got %d", i, len(columns), len(ret.List)))
				return nil, &err
			}
		}
		for j, column := range columns {
			var actualValue Value
			if allArrays {
				actualValue = ret.List[j]
			} else {
				v, ok := ret.Map[column]
				if !ok {
					err := returnShapeError(fmt.Sprintf("row %d: missing column %q", i, column))
					return nil, &err
				}
				actualValue = v
			}
			expected := ""
			if j < len(dataRow.Cells) {
				expected = dataRow.Cells[j]
			}
			actual := renderCellValue(actualValue)
			span := dataRow.Span
			if j < len(dataRow.CellSpans) {
				span = dataRow.CellSpans[j]
			}
			diffs = append(diffs, newCellDiff(column, span, expected, actual, actual == expected))
		}
	}
	return diffs, nil
}
