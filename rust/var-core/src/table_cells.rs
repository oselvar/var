//! Parses a Markdown/Gherkin table row (`| a | b |`) into trimmed cells + each
//! cell's source span — port of `table-cells.ts` / `TableCells.java`.

use crate::offsets::{java_strip, java_strip_leading, utf16_index, utf16_len};
use crate::span::Span;

/// Parallel, same-length trimmed cells and their source spans.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RowCells {
    pub cells: Vec<String>,
    pub cell_spans: Vec<Span>,
}

/// Splits `line_text` (a `| a | b |` row) into trimmed cells and each cell's
/// source span. `line_start_offset` is the row's UTF-16 start offset in `source`.
pub fn parse_row_cells(line_text: &str, line_start_offset: usize, source: &str) -> RowCells {
    let (Some(first), Some(last)) = (line_text.find('|'), line_text.rfind('|')) else {
        return RowCells {
            cells: Vec::new(),
            cell_spans: Vec::new(),
        };
    };
    if last <= first {
        return RowCells {
            cells: Vec::new(),
            cell_spans: Vec::new(),
        };
    }
    // `|` is ASCII, so `first`/`last` byte indices order identically to UTF-16.
    let inner = &line_text[first + 1..last];
    let inner_start = utf16_index(line_text, first + 1);

    let mut cells = Vec::new();
    let mut cell_spans = Vec::new();
    let mut cursor = 0usize;
    for seg in inner.split('|') {
        let trimmed = java_strip(seg);
        let leading = utf16_len(seg) - utf16_len(java_strip_leading(seg));
        let abs_start = line_start_offset + inner_start + cursor + leading;
        cell_spans.push(Span::from_offsets(
            source,
            abs_start,
            abs_start + utf16_len(trimmed),
        ));
        cells.push(trimmed.to_string());
        cursor += utf16_len(seg) + 1; // +1 for the '|' delimiter
    }
    RowCells { cells, cell_spans }
}
