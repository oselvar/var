//! Source positions/ranges anchored to UTF-16 code-unit offsets (1-based
//! line/column). Port of `varar-core/src/span.ts` / `Span.java`.

/// A source range `[start_offset, end_offset)` in UTF-16 code units, with
/// 1-based line/column at each end.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Span {
    pub start_offset: usize,
    pub end_offset: usize,
    pub start_line: usize,
    pub start_col: usize,
    pub end_line: usize,
    pub end_col: usize,
}

/// A 1-based line/column position.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LineCol {
    pub line: usize,
    pub col: usize,
}

impl Span {
    /// Computes a [`Span`] for `[start_offset, end_offset)` (UTF-16 offsets) into `source`.
    pub fn from_offsets(source: &str, start_offset: usize, end_offset: usize) -> Span {
        let start = line_col(source, start_offset);
        let end = line_col(source, end_offset);
        Span {
            start_offset,
            end_offset,
            start_line: start.line,
            start_col: start.col,
            end_line: end.line,
            end_col: end.col,
        }
    }
}

/// Computes the 1-based (line, col) at `offset` (a UTF-16 code-unit index) into
/// `source`. Walks per UTF-16 code unit from the start, exactly like Java's
/// `charAt` loop (so an astral character advances `col` by 2).
pub fn line_col(source: &str, offset: usize) -> LineCol {
    let mut line = 1;
    let mut col = 1;
    for (idx, unit) in source.encode_utf16().enumerate() {
        if idx >= offset {
            break;
        }
        if unit == 0x000A {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
    }
    LineCol { line, col }
}
