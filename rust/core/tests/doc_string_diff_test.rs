//! Port of `DocStringDiffTest.java` / `doc-string-diff.test.ts`.

use varar_core::cell_diff::CellDiff;
use varar_core::doc_string_diff::{DOC_STRING_COLUMN, compare_doc_string};
use varar_core::error::StepError;
use varar_core::span::Span;
use varar_core::value::Value;

const SPAN: Span = Span {
    start_offset: 0,
    end_offset: 6,
    start_line: 1,
    start_col: 1,
    end_line: 1,
    end_col: 6,
};

#[test]
fn compare_doc_string_equal_content_returns_null() {
    assert_eq!(None, compare_doc_string(Some(&Value::from("hello\n")), "hello\n", SPAN).unwrap());
}

#[test]
fn compare_doc_string_null_return_returns_null_asserted_nothing() {
    assert_eq!(None, compare_doc_string(None, "hello\n", SPAN).unwrap());
}

#[test]
fn compare_doc_string_different_content_returns_a_cell_labelled_doc_string() {
    // A doc string is one cell, compared whole. expected/actual are quoted so a
    // whitespace-only difference stays visible.
    let diff = compare_doc_string(Some(&Value::from("bye\n")), "hello\n", SPAN)
        .unwrap()
        .unwrap();
    assert_eq!(DOC_STRING_COLUMN, diff.column);
    assert_eq!(SPAN, diff.span);
    assert_eq!("\"hello\\n\"", diff.expected);
    assert_eq!("\"bye\\n\"", diff.actual);
    assert!(!diff.ok);
}

#[test]
fn a_doc_string_cell_reads_like_any_other_cell_mismatch() {
    let diff: CellDiff = compare_doc_string(Some(&Value::from("bye\n")), "hello\n", SPAN)
        .unwrap()
        .unwrap();
    assert_eq!(
        "doc string: expected \"hello\\n\" but was \"bye\\n\"",
        StepError::CellMismatch(vec![diff]).message()
    );
}

#[test]
fn compare_doc_string_a_non_string_return_throws_return_shape() {
    assert!(matches!(
        compare_doc_string(Some(&Value::Int(42)), "hello\n", SPAN).unwrap_err(),
        StepError::ReturnShape(_)
    ));
}
