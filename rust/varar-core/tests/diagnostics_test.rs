//! Port of `DiagnosticsTest.java`. Java's `assertSame` (identity) becomes value
//! equality — [`Span`] is a `Copy` value type.

use varar_core::diagnostics::{
    DiagnosticCode, Severity, ambiguous_match, error_fence_without_step,
};
use varar_core::span::Span;

const SPAN: Span = Span {
    start_offset: 0,
    end_offset: 5,
    start_line: 1,
    start_col: 1,
    end_line: 1,
    end_col: 6,
};

#[test]
fn ambiguous_match_builds_an_error_severity_diagnostic_with_the_given_span() {
    let d = ambiguous_match(SPAN);
    assert_eq!(DiagnosticCode::AmbiguousMatch, d.code);
    assert_eq!(Severity::Error, d.severity);
    assert_eq!(SPAN, d.span);
}

#[test]
fn error_fence_without_step_builds_an_error_severity_diagnostic_with_the_given_span() {
    let d = error_fence_without_step(SPAN);
    assert_eq!(DiagnosticCode::ErrorFenceWithoutStep, d.code);
    assert_eq!(Severity::Error, d.severity);
    assert_eq!(SPAN, d.span);
}
