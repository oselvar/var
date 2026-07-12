//! The error model: the Rust replacement for Java var-core's typed exception
//! hierarchy (`CellMismatchException`, `DocStringMismatchException`,
//! `ReturnShapeException`, `UnexpectedPassException`, author `AssertionError`).
//! `Result`/panic-catch replace throw; `instanceof` dispatch becomes `match`.

use crate::cell_diff::CellDiff;
use crate::doc_string_diff::DocStringDiff;
use std::any::Any;

/// A handler-signalled failure (author `Err(...)` or a caught panic) — the
/// analog of an arbitrary thrown `RuntimeException`/`AssertionError`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HandlerError {
    pub message: String,
}

impl HandlerError {
    pub fn new(message: impl Into<String>) -> HandlerError {
        HandlerError {
            message: message.into(),
        }
    }

    /// Extracts a message from a `catch_unwind` panic payload (`&str`/`String`,
    /// else a generic fallback).
    pub fn from_panic(payload: Box<dyn Any + Send>) -> HandlerError {
        let message = if let Some(s) = payload.downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = payload.downcast_ref::<String>() {
            s.clone()
        } else {
            "handler panicked".to_string()
        };
        HandlerError { message }
    }
}

/// A step failure verdict — the closed union replacing the exception hierarchy.
#[derive(Clone, Debug, PartialEq)]
pub enum StepError {
    /// Table / header-bound row mismatch (only the failing cells).
    CellMismatch(Vec<CellDiff>),
    /// Doc-string body mismatch.
    DocStringMismatch(DocStringDiff),
    /// Wrong return type/shape — an author mistake, not a value diff.
    ReturnShape(String),
    /// An `error`-fenced example ran without failing.
    UnexpectedPass,
    /// An author-signalled failure (`Err`) or a caught panic.
    Handler(HandlerError),
}

impl StepError {
    /// The human-readable message (`getMessage()` parity).
    pub fn message(&self) -> String {
        match self {
            StepError::CellMismatch(cells) => cells
                .iter()
                .map(|c| format!("{}: expected {} but was {}", c.column, c.expected, c.actual))
                .collect::<Vec<_>>()
                .join("; "),
            StepError::DocStringMismatch(diff) => {
                format!(
                    "doc string: expected {} but was {}",
                    quote(&diff.expected),
                    quote(&diff.actual)
                )
            }
            StepError::ReturnShape(msg) => msg.clone(),
            StepError::UnexpectedPass => "expected the example to fail, but it passed".to_string(),
            StepError::Handler(e) => e.message.clone(),
        }
    }

    /// The failing cells of a [`StepError::CellMismatch`], else `None`
    /// (`isCellMismatchException` parity).
    pub fn as_cell_mismatch(&self) -> Option<&[CellDiff]> {
        match self {
            StepError::CellMismatch(cells) => Some(cells),
            _ => None,
        }
    }

    /// The diff of a [`StepError::DocStringMismatch`], else `None`.
    pub fn as_doc_string_mismatch(&self) -> Option<&DocStringDiff> {
        match self {
            StepError::DocStringMismatch(diff) => Some(diff),
            _ => None,
        }
    }
}

/// Where a failure points in the `.md` — the structural replacement for Java's
/// synthetic `StackTraceElement` injection.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FailureLocation {
    pub label: String,
    pub path: String,
    pub line: usize,
}

/// A caught step failure plus its (optional) source location.
#[derive(Clone, Debug, PartialEq)]
pub struct StepFailure {
    pub error: StepError,
    pub location: Option<FailureLocation>,
}

impl StepFailure {
    /// A failure with no attached location (fallback-line path).
    pub fn bare(error: StepError) -> StepFailure {
        StepFailure {
            error,
            location: None,
        }
    }
}

/// Mirrors `JSON.stringify`'s quoting of the TS doc-string error message closely
/// enough for a human-readable message (never parsed back).
fn quote(s: &str) -> String {
    format!(
        "\"{}\"",
        s.replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
    )
}

/// A registration-time (author-wiring) error — never a step failure.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RegistryError {
    /// A duplicate step expression; the message lists both source positions.
    DuplicateStep(String),
    /// The cucumber expression failed to compile (e.g. undefined parameter type).
    Expression(String),
}
