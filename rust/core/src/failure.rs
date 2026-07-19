//! Converts a caught step failure into the structured [`ExampleFailure`] payload
//! — port of `failure.ts` / `Failure.java`. The Java stack-trace-scraping
//! machinery becomes a structural [`FailureLocation`] lookup by exact path match.

use crate::error::{StepError, StepFailure};
use crate::result::{CellFailure, ExampleFailure};

/// A caught step failure → the `ExampleResult.failure` payload. `fallback_line`
/// is used when `failure` carries no location matching `spec_path`.
pub fn to_failure(failure: &StepFailure, spec_path: &str, fallback_line: i64) -> ExampleFailure {
    let message = failure.error.message();

    let cells = match &failure.error {
        StepError::CellMismatch(cells) => {
            let failing: Vec<CellFailure> = cells
                .iter()
                .filter(|c| !c.ok)
                .map(|c| CellFailure::new(c.span.start_offset, c.span.end_offset, c.actual.clone()))
                .collect();
            (!failing.is_empty()).then_some(failing)
        }
        _ => None,
    };

    let doc = match &failure.error {
        StepError::DocStringMismatch(diff) => Some(CellFailure::new(
            diff.span.start_offset,
            diff.span.end_offset,
            diff.actual.clone(),
        )),
        _ => None,
    };

    // Structural path match replaces Java's regex-escaped stack-trace scrape.
    let line = failure
        .location
        .as_ref()
        .filter(|l| l.path == spec_path)
        .map_or(fallback_line, |l| l.line as i64);

    let stack = render_stack(failure);
    ExampleFailure {
        line,
        message,
        stack,
        cells,
        doc,
    }
}

/// Display-only rendering of the failure's location (the Java `stack` field is
/// rendered from structural data, not scraped from it).
fn render_stack(failure: &StepFailure) -> String {
    match &failure.location {
        Some(l) => {
            format!("{}\n    at {} ({}:{})", failure.error.message(), l.label, l.path, l.line)
        }
        None => failure.error.message(),
    }
}
