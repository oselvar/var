//! Parameter comparison — port of `param-diff.ts` / `ParamDiff.java`. Compares a
//! sensor's returned inline actuals against the values captured from the document.

use crate::cell_diff::CellDiff;
use crate::registry::FormatFn;
use crate::span::Span;
use crate::value::Value;

/// Compares `returned` against `expected` with no display formatters.
pub fn compare_params(
    returned: &[Value],
    expected: &[Value],
    param_spans: &[Span],
    source_texts: &[String],
) -> Vec<CellDiff> {
    compare_params_with_formats(returned, expected, param_spans, source_texts, None)
}

/// Compares `returned` against `expected` (the captured args), one [`CellDiff`]
/// per parameter. `source_texts` supplies each diff's `expected` display;
/// `formats` (aligned 1:1, `None` entries where a type has none) renders display
/// strings only, never the verdict (which is structural [`Value`] equality).
pub fn compare_params_with_formats(
    returned: &[Value],
    expected: &[Value],
    param_spans: &[Span],
    source_texts: &[String],
    formats: Option<&[Option<FormatFn>]>,
) -> Vec<CellDiff> {
    let mut diffs = Vec::with_capacity(expected.len());
    for i in 0..expected.len() {
        // Structural equality is the verdict (`Objects.equals` parity).
        let ok = returned[i] == expected[i];
        let format = formats.and_then(|f| f.get(i)).and_then(|opt| opt.as_ref());
        let expected_text = if i < source_texts.len() {
            source_texts[i].clone()
        } else {
            render_param_value(&expected[i], format).0
        };
        let (actual_text, via_format) = render_param_value(&returned[i], format);
        diffs.push(CellDiff {
            column: format!("arg {}", i + 1),
            span: param_spans[i],
            expected: expected_text,
            actual: actual_text,
            ok,
            expected_value: Some(expected[i].clone()),
            actual_value: Some(returned[i].clone()),
            formatted: via_format,
        });
    }
    diffs
}

/// Renders one side of a parameter diff: the type's `format` when it has one
/// (and it produces a value), else the shared string/primitive chain.
fn render_param_value(value: &Value, format: Option<&FormatFn>) -> (String, bool) {
    if let Some(f) = format {
        if let Some(rendered) = f(value) {
            return (rendered, true);
        }
    }
    (crate::cell_diff::render_cell_value(value), false)
}
