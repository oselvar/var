//! Port of `FailureTest.java` / `failure.test.ts`. Java's synthetic
//! `StackTraceElement` frame becomes a structural [`FailureLocation`]; the
//! regex-escape case becomes an exact path-match check. The "message/stack is a
//! String" type assertions are dropped (type-level in Rust).

use var_core::cell_diff::CellDiff;
use var_core::doc_string_diff::DocStringDiff;
use var_core::error::{FailureLocation, HandlerError, StepError, StepFailure};
use var_core::failure::to_failure;
use var_core::result::CellFailure;
use var_core::span::Span;

fn located(error: StepError, path: &str, line: usize) -> StepFailure {
    StepFailure {
        error,
        location: Some(FailureLocation {
            label: String::new(),
            path: path.to_string(),
            line,
        }),
    }
}

#[test]
fn to_failure_extracts_cells_from_a_cell_mismatch() {
    let source = "a | 5 |";
    let sf = StepFailure::bare(StepError::CellMismatch(vec![CellDiff::new(
        "n",
        Span::from_offsets(source, 4, 5),
        "5",
        "4",
        false,
    )]));
    let f = to_failure(&sf, "spec.md", 3);
    assert_eq!(Some(vec![CellFailure::new(4, 5, "4")]), f.cells);
    assert_eq!(None, f.doc);
}

#[test]
fn to_failure_extracts_doc_from_a_doc_string_mismatch() {
    let source = "Hello!\n";
    let sf = StepFailure::bare(StepError::DocStringMismatch(DocStringDiff::new(
        Span::from_offsets(source, 0, 7),
        "Hello!\n",
        "Goodbye!\n",
    )));
    let f = to_failure(&sf, "spec.md", 3);
    assert_eq!(Some(CellFailure::new(0, 7, "Goodbye!\n")), f.doc);
    assert_eq!(None, f.cells);
}

#[test]
fn to_failure_leaves_cells_doc_null_for_a_plain_exception_or_return_shape() {
    let plain = StepFailure::bare(StepError::Handler(HandlerError::new("nope")));
    assert_eq!(None, to_failure(&plain, "spec.md", 3).cells);
    assert_eq!(None, to_failure(&plain, "spec.md", 3).doc);
    let shape = StepFailure::bare(StepError::ReturnShape("bad".to_string()));
    assert_eq!(None, to_failure(&shape, "spec.md", 3).cells);
}

#[test]
fn to_failure_reads_the_failing_line_from_an_injected_location_else_falls_back() {
    let with_frame = located(
        StepError::Handler(HandlerError::new("boom")),
        "docs/a.md",
        12,
    );
    assert_eq!(12, to_failure(&with_frame, "docs/a.md", 99).line);

    let no_frame = StepFailure::bare(StepError::Handler(HandlerError::new("boom")));
    assert_eq!(99, to_failure(&no_frame, "docs/a.md", 99).line);
}

#[test]
fn to_failure_uses_an_exact_spec_path_match() {
    // 'aXmd' must not be treated as matching spec path 'a.md' (Java escapes the
    // regex dot; Rust compares paths by `==`).
    let sf = located(StepError::Handler(HandlerError::new("boom")), "aXmd", 7);
    assert_eq!(42, to_failure(&sf, "a.md", 42).line);
}
