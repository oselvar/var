//! Diagnostics produced by the planner — port of the subset of `diagnostics.ts`
//! that `Plan` needs / `Diagnostics.java`.

use crate::span::Span;

/// Diagnostic severity. Only `Error` is constructed today.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Severity {
    Error,
    Warning,
    Info,
}

/// The closed set of diagnostic codes the planner produces. `Ord` follows the
/// Java enum's declaration order (ordinal), matching its sort semantics.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum DiagnosticCode {
    AmbiguousMatch,
    ErrorFenceWithoutStep,
    Drift,
}

/// One diagnostic: its code, severity, and the source span it points at.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Diagnostic {
    pub code: DiagnosticCode,
    pub severity: Severity,
    pub span: Span,
}

/// Builds an `ambiguous-match` diagnostic pointing at `span`.
pub fn ambiguous_match(span: Span) -> Diagnostic {
    Diagnostic {
        code: DiagnosticCode::AmbiguousMatch,
        severity: Severity::Error,
        span,
    }
}

/// Builds an `error-fence-without-step` diagnostic pointing at `span`.
pub fn error_fence_without_step(span: Span) -> Diagnostic {
    Diagnostic {
        code: DiagnosticCode::ErrorFenceWithoutStep,
        severity: Severity::Error,
        span,
    }
}
