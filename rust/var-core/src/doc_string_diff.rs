//! Doc-string comparison — port of `doc-string-diff.ts` / `DocStringDiff.java`.

use crate::error::StepError;
use crate::span::Span;
use crate::value::Value;

/// A doc-string content difference: the fence body's span plus expected/actual.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocStringDiff {
    pub span: Span,
    pub expected: String,
    pub actual: String,
}

impl DocStringDiff {
    pub fn new(
        span: Span,
        expected: impl Into<String>,
        actual: impl Into<String>,
    ) -> DocStringDiff {
        DocStringDiff {
            span,
            expected: expected.into(),
            actual: actual.into(),
        }
    }
}

/// Compares a doc-string step's return against the fence body (exact equality,
/// trailing newline included). `None` → no check. A non-string return →
/// [`StepError::ReturnShape`].
pub fn compare_doc_string(
    returned: Option<&Value>,
    content: &str,
    span: Span,
) -> Result<Option<DocStringDiff>, StepError> {
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
        Ok(Some(DocStringDiff::new(span, content, s.clone())))
    }
}
