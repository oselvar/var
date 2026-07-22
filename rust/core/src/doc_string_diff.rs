//! Doc-string comparison — port of `doc-string-diff.ts` / `DocStringDiff.java`.

use crate::cell_diff::CellDiff;
use crate::error::{StepError, quote};
use crate::span::Span;
use crate::value::Value;

/// The column label a doc-string cell carries in a [`CellDiff`], so its mismatch
/// message reads `doc string: expected … but was …`.
pub const DOC_STRING_COLUMN: &str = "doc string";

/// Compares a doc-string step's return against the fence body (exact equality,
/// trailing newline included).
///
/// A doc string is ONE CELL, compared whole, so a difference is an ordinary
/// [`CellDiff`] and the executor raises the same [`StepError::CellMismatch`] as
/// any other cell. `expected`/`actual` are quoted: a doc string routinely
/// differs only in whitespace, and bare text would render a missing trailing
/// newline as no difference at all.
///
/// `None` → no check. A non-string return → [`StepError::ReturnShape`].
pub fn compare_doc_string(
    returned: Option<&Value>,
    content: &str,
    span: Span,
) -> Result<Option<CellDiff>, StepError> {
    let s = match returned {
        None => return Ok(None),
        Some(Value::String(s)) => s,
        Some(other) => {
            return Err(StepError::ReturnShape(format!(
                "expected a doc string (string), got {}",
                other.type_name()
            )));
        }
    };
    if s == content {
        Ok(None)
    } else {
        Ok(Some(CellDiff {
            column: DOC_STRING_COLUMN.to_string(),
            span,
            expected: quote(content),
            actual: quote(s),
            ok: false,
            expected_value: None,
            actual_value: None,
            formatted: false,
        }))
    }
}
