//! Where a failure points in the `.md` — port of `failure-anchor.ts` /
//! `FailureAnchor.java`. A mismatch anchors at its first failing span; anything
//! else at the fallback (the step's match start). Crate-private, like Java's
//! package-private class.

use crate::error::StepError;
use crate::span::Span;

/// The failure's source anchor: first failing cell span / doc-string body span /
/// the `fallback`.
pub(crate) fn anchor(error: &StepError, fallback: Span) -> Span {
    match error {
        StepError::CellMismatch(cells) => cells.iter().find(|c| !c.ok).map_or(fallback, |c| c.span),
        StepError::DocStringMismatch(diff) => diff.span,
        _ => fallback,
    }
}
