package core

import "fmt"

// Parameter comparison — port of param-diff.ts / param_diff.rs. Compares a
// sensor's returned inline actuals against the values captured from the document.

// compareParamsWithFormats compares returned against expected (the captured
// args), one CellDiff per parameter. sourceTexts supplies each diff's expected
// display; formats (aligned 1:1, nil entries where a type has none) renders
// display strings only, never the verdict (which is structural Value equality).
func compareParamsWithFormats(returned, expected []Value, paramSpans []Span, sourceTexts []string, formats []FormatFn) []CellDiff {
	diffs := make([]CellDiff, 0, len(expected))
	for i := 0; i < len(expected); i++ {
		// Structural equality is the verdict.
		ok := ValueEqual(returned[i], expected[i])
		var format FormatFn
		if formats != nil && i < len(formats) {
			format = formats[i]
		}
		var expectedText string
		if i < len(sourceTexts) {
			expectedText = sourceTexts[i]
		} else {
			expectedText, _ = renderParamValue(expected[i], format)
		}
		actualText, viaFormat := renderParamValue(returned[i], format)
		exp := expected[i]
		act := returned[i]
		diffs = append(diffs, CellDiff{
			Column:        fmt.Sprintf("cell %d", i+1),
			Span:          paramSpans[i],
			Expected:      expectedText,
			Actual:        actualText,
			Ok:            ok,
			ExpectedValue: &exp,
			ActualValue:   &act,
			Formatted:     viaFormat,
		})
	}
	return diffs
}

// renderParamValue renders one side of a parameter diff: the type's format when
// it has one (and it produces a value), else the shared string/primitive chain.
func renderParamValue(value Value, format FormatFn) (string, bool) {
	if format != nil {
		if rendered, ok := format(value); ok {
			return rendered, true
		}
	}
	return renderCellValue(value), false
}
