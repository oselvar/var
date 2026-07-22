//! The error model: the Rust replacement for Java var-core's typed exception
//! hierarchy (`CellMismatchException`,
//! `ReturnShapeException`, `UnexpectedPassException`, author `AssertionError`).
//! `Result`/panic-catch replace throw; `instanceof` dispatch becomes `match`.

use crate::cell_diff::CellDiff;
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
    /// One or more compared cells differ — an inline capture, a table cell, a
    /// header-bound row's cell, or a doc string (only the failing cells).
    CellMismatch(Vec<CellDiff>),
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
/// Renders `s` the way `JSON.stringify` does in the TypeScript port.
///
/// Every port quotes doc-string mismatch messages identically because the text is
/// matched by substring in an `error` fence — a port that quotes differently fails
/// a spec its siblings pass. Escaping only `\\`, `"` and `\n` is not enough: doc
/// strings routinely carry tab-indented code.
pub(crate) fn quote(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{08}' => out.push_str("\\b"),
            '\u{0c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// A registration-time (author-wiring) error — never a step failure.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RegistryError {
    /// A duplicate step expression; the message lists both source positions.
    DuplicateStep(String),
    /// The cucumber expression failed to compile (e.g. undefined parameter type).
    Expression(String),
}
