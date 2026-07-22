//! Immutable run-result records — port of `result.ts` / `Result.java`. The
//! persisted `.var/<spec>.json` file is a serialized [`SpecResults`].

/// One mismatched CELL as a source-offset range plus the runtime value.
/// `from`/`to` are absolute UTF-16 source offsets; `to` is exclusive.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CellFailure {
    pub from: usize,
    pub to: usize,
    pub actual: String,
}

impl CellFailure {
    pub fn new(from: usize, to: usize, actual: impl Into<String>) -> CellFailure {
        CellFailure {
            from,
            to,
            actual: actual.into(),
        }
    }
}

/// An example's run outcome.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Passed,
    Failed,
}

/// The failure payload of a failed [`ExampleResult`]. `cells` is `None`
/// when not applicable. `line` may be a caller-supplied fallback (`-1`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExampleFailure {
    pub line: i64,
    pub message: String,
    pub stack: String,
    pub cells: Option<Vec<CellFailure>>,
}

/// The run result for one BDD example.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExampleResult {
    pub name: String,
    pub status: Status,
    pub lines: Vec<usize>,
    pub failure: Option<ExampleFailure>,
}

/// The persisted run result for one spec file.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpecResults {
    pub version: u32,
    pub spec_path: String,
    pub source_hash: String,
    pub examples: Vec<ExampleResult>,
}
