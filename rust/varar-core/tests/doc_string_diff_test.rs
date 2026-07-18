//! Port of `DocStringDiffTest.java` / `doc-string-diff.test.ts`.

use varar_core::doc_string_diff::{DocStringDiff, compare_doc_string};
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
    assert_eq!(
        None,
        compare_doc_string(Some(&Value::from("hello\n")), "hello\n", SPAN).unwrap()
    );
}

#[test]
fn compare_doc_string_null_return_returns_null_asserted_nothing() {
    assert_eq!(None, compare_doc_string(None, "hello\n", SPAN).unwrap());
}

#[test]
fn compare_doc_string_different_content_returns_diff_with_span_expected_actual() {
    assert_eq!(
        Some(DocStringDiff::new(SPAN, "hello\n", "bye\n")),
        compare_doc_string(Some(&Value::from("bye\n")), "hello\n", SPAN).unwrap()
    );
}

#[test]
fn compare_doc_string_a_non_string_return_throws_return_shape() {
    assert!(matches!(
        compare_doc_string(Some(&Value::Int(42)), "hello\n", SPAN).unwrap_err(),
        StepError::ReturnShape(_)
    ));
}

#[test]
fn doc_string_mismatch_carries_the_diff_and_is_detectable() {
    let err = StepError::DocStringMismatch(DocStringDiff::new(SPAN, "hello\n", "bye\n"));
    assert!(err.as_doc_string_mismatch().is_some());
    assert!(
        StepError::Handler(varar_core::error::HandlerError::new("x"))
            .as_doc_string_mismatch()
            .is_none()
    );
    assert_eq!("bye\n", err.as_doc_string_mismatch().unwrap().actual);
}
