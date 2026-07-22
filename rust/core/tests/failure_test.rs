//! Port of `FailureTest.java` / `failure.test.ts`. Java's synthetic
//! `StackTraceElement` frame becomes a structural [`FailureLocation`]; the
//! regex-escape case becomes an exact path-match check. The "message/stack is a
//! String" type assertions are dropped (type-level in Rust).

use varar_core::cell_diff::CellDiff;
use varar_core::doc_string_diff::compare_doc_string;
use varar_core::error::{FailureLocation, HandlerError, StepError, StepFailure};
use varar_core::failure::to_failure;
use varar_core::result::CellFailure;
use varar_core::span::Span;

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
}

#[test]
fn to_failure_extracts_a_doc_string_mismatch_as_a_cell() {
    let source = "Hello!\n";
    let diff = compare_doc_string(
        Some(&varar_core::value::Value::from("Goodbye!\n")),
        "Hello!\n",
        Span::from_offsets(source, 0, 7),
    )
    .unwrap()
    .unwrap();
    let sf = StepFailure::bare(StepError::CellMismatch(vec![diff]));
    let f = to_failure(&sf, "spec.md", 3);
    assert_eq!(Some(vec![CellFailure::new(0, 7, "\"Goodbye!\\n\"")]), f.cells);
}

#[test]
fn to_failure_leaves_cells_null_for_a_plain_exception_or_return_shape() {
    let plain = StepFailure::bare(StepError::Handler(HandlerError::new("nope")));
    assert_eq!(None, to_failure(&plain, "spec.md", 3).cells);
    let shape = StepFailure::bare(StepError::ReturnShape("bad".to_string()));
    assert_eq!(None, to_failure(&shape, "spec.md", 3).cells);
}

#[test]
fn to_failure_reads_the_failing_line_from_an_injected_location_else_falls_back() {
    let with_frame = located(StepError::Handler(HandlerError::new("boom")), "docs/a.md", 12);
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
