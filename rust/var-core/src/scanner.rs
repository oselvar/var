//! Turns raw Markdown into a flat list of [`Block`] nodes — port of `scanner.ts`
//! / `Scanner.java`. Offsets in stored spans are UTF-16 code units; the line
//! splitter keeps a running (byte, UTF-16) dual cursor and per-line regex offsets
//! are converted from bytes to UTF-16.

use crate::ast::{
    Block, Blockquote, Fence, Heading, ListItem, Paragraph, Row, SegmentOffset, Table,
    ThematicBreak,
};
use crate::offsets::{java_trim, utf16_index, utf16_len};
use crate::span::Span;
use crate::table_cells::parse_row_cells;
use regex::Regex;
use std::sync::LazyLock;

/// One line of source, with its UTF-16 and byte offsets in the full source.
struct RawLine {
    text: String,
    start_offset: usize,
    end_offset: usize,
    start_byte: usize,
    end_byte: usize,
}

// `\1` backreference is expanded into three alternatives (the `regex` crate has
// no backreferences); otherwise these mirror the Java patterns. `[0-9]` keeps the
// ordered-list digit class ASCII.
static THEMATIC_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*(?:-(?:\s*-){2,}|\*(?:\s*\*){2,}|_(?:\s*_){2,})\s*$").unwrap()
});
static UL_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(\s*)([-*+])\s+(.*)$").unwrap());
static OL_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(\s*)([0-9]+)([.)])\s+(.*)$").unwrap());
static BQ_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^>\s?(.*)$").unwrap());
static FENCE_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(`{3,})\s*(\S*)\s*$").unwrap());
static ROW_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\|(.+)\|\s*$").unwrap());
static DELIM_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|\s*$").unwrap());
static HEADING_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$").unwrap());
static HEADING_PREFIX_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^#{1,6}\s+").unwrap());

/// Scans `source` into a list of [`Block`] nodes.
pub fn scan(source: &str) -> Vec<Block> {
    let lines = split_lines(source);
    let mut blocks = Vec::new();

    let mut i = 0;
    while i < lines.len() {
        if java_trim(&lines[i].text).is_empty() {
            i += 1;
            continue;
        }
        if let Some((fence, next)) = try_fence(source, &lines, i) {
            blocks.push(Block::Fence(fence));
            i = next;
            continue;
        }
        if let Some((table, next)) = try_table(source, &lines, i) {
            blocks.push(Block::Table(table));
            i = next;
            continue;
        }
        if let Some(tb) = try_thematic_break(source, &lines[i]) {
            blocks.push(Block::ThematicBreak(tb));
            i += 1;
            continue;
        }
        if let Some((quote, next)) = try_blockquote(source, &lines, i) {
            blocks.push(Block::Blockquote(quote));
            i = next;
            continue;
        }
        if let Some(heading) = try_heading(source, &lines[i]) {
            blocks.push(Block::Heading(heading));
            i += 1;
            continue;
        }
        if let Some(item) = try_list_item(source, &lines[i]) {
            blocks.push(Block::ListItem(item));
            i += 1;
            continue;
        }
        let (paragraph, next) = consume_paragraph(source, &lines, i);
        blocks.push(Block::Paragraph(paragraph));
        i = next;
    }
    blocks
}

fn split_lines(source: &str) -> Vec<RawLine> {
    let mut out = Vec::new();
    let mut byte_start = 0;
    let mut u16_start = 0;
    let mut u16 = 0;
    for (byte_i, c) in source.char_indices() {
        if c == '\n' {
            out.push(RawLine {
                text: source[byte_start..byte_i].to_string(),
                start_offset: u16_start,
                end_offset: u16,
                start_byte: byte_start,
                end_byte: byte_i,
            });
            byte_start = byte_i + 1;
            u16_start = u16 + 1;
        }
        u16 += c.len_utf16();
    }
    out.push(RawLine {
        text: source[byte_start..].to_string(),
        start_offset: u16_start,
        end_offset: u16,
        start_byte: byte_start,
        end_byte: source.len(),
    });
    out
}

fn try_thematic_break(source: &str, line: &RawLine) -> Option<ThematicBreak> {
    if !THEMATIC_RE.is_match(&line.text) {
        return None;
    }
    Some(ThematicBreak {
        span: Span::from_offsets(source, line.start_offset, line.end_offset),
    })
}

fn try_heading(source: &str, line: &RawLine) -> Option<Heading> {
    let m = HEADING_RE.captures(&line.text)?;
    let hashes = m.get(1).unwrap().as_str();
    let text = java_trim(m.get(2).unwrap().as_str()).to_string();
    Some(Heading {
        level: hashes.len(),
        text,
        span: Span::from_offsets(source, line.start_offset, line.end_offset),
    })
}

fn try_list_item(source: &str, line: &RawLine) -> Option<ListItem> {
    if let Some(ul) = UL_RE.captures(&line.text) {
        let text = ul.get(3).unwrap().as_str();
        let marker_start = line.start_offset + utf16_len(ul.get(1).unwrap().as_str());
        let marker_end = marker_start + utf16_len(ul.get(2).unwrap().as_str());
        let text_start = line.start_offset + utf16_index(&line.text, line.text.find(text).unwrap());
        return Some(ListItem {
            text: text.to_string(),
            span: Span::from_offsets(source, line.start_offset, line.end_offset),
            segment_map: vec![SegmentOffset::new(0, text_start)],
            ordered: false,
            marker_span: Span::from_offsets(source, marker_start, marker_end),
        });
    }
    if let Some(ol) = OL_RE.captures(&line.text) {
        let text = ol.get(4).unwrap().as_str();
        let marker_start = line.start_offset + utf16_len(ol.get(1).unwrap().as_str());
        let marker_end = marker_start
            + utf16_len(ol.get(2).unwrap().as_str())
            + utf16_len(ol.get(3).unwrap().as_str());
        let text_start = line.start_offset + utf16_index(&line.text, line.text.find(text).unwrap());
        return Some(ListItem {
            text: text.to_string(),
            span: Span::from_offsets(source, line.start_offset, line.end_offset),
            segment_map: vec![SegmentOffset::new(0, text_start)],
            ordered: true,
            marker_span: Span::from_offsets(source, marker_start, marker_end),
        });
    }
    None
}

fn try_blockquote(
    source: &str,
    lines: &[RawLine],
    start_idx: usize,
) -> Option<(Blockquote, usize)> {
    let first = &lines[start_idx];
    let m = BQ_RE.captures(&first.text)?;
    let first_segment = m.get(1).unwrap().as_str().to_string();

    let mut segments = vec![first_segment.clone()];
    let mut segment_map = vec![SegmentOffset::new(
        0,
        first.start_offset + utf16_index(&first.text, first.text.find(&first_segment).unwrap()),
    )];
    let mut joined_text_offset = utf16_len(&first_segment);

    let mut i = start_idx + 1;
    let mut end_offset = first.end_offset;
    while i < lines.len() {
        let ln = &lines[i];
        let Some(next) = BQ_RE.captures(&ln.text) else {
            break;
        };
        let segment = next.get(1).unwrap().as_str().to_string();
        joined_text_offset += 1; // newline separator
        segment_map.push(SegmentOffset::new(
            joined_text_offset,
            ln.start_offset + utf16_index(&ln.text, ln.text.find(&segment).unwrap()),
        ));
        joined_text_offset += utf16_len(&segment);
        segments.push(segment);
        end_offset = ln.end_offset;
        i += 1;
    }
    let quote = Blockquote {
        text: segments.join("\n"),
        span: Span::from_offsets(source, first.start_offset, end_offset),
        segment_map,
    };
    Some((quote, i))
}

fn consume_paragraph(source: &str, lines: &[RawLine], start_idx: usize) -> (Paragraph, usize) {
    let first = &lines[start_idx];
    let mut end_idx = start_idx;
    while end_idx + 1 < lines.len() {
        let candidate = &lines[end_idx + 1];
        let t = &candidate.text;
        if java_trim(t).is_empty()
            || HEADING_PREFIX_RE.is_match(t)
            || UL_RE.is_match(t)
            || OL_RE.is_match(t)
            || BQ_RE.is_match(t)
            || FENCE_RE.is_match(t)
            || ROW_RE.is_match(t)
            || THEMATIC_RE.is_match(t)
        {
            break;
        }
        end_idx += 1;
    }
    let last = &lines[end_idx];
    let paragraph = Paragraph {
        text: source[first.start_byte..last.end_byte].to_string(),
        span: Span::from_offsets(source, first.start_offset, last.end_offset),
        segment_map: vec![SegmentOffset::new(0, first.start_offset)],
    };
    (paragraph, end_idx + 1)
}

fn try_fence(source: &str, lines: &[RawLine], start_idx: usize) -> Option<(Fence, usize)> {
    let start = &lines[start_idx];
    let open = FENCE_RE.captures(&start.text)?;
    let fence_marker = open.get(1).unwrap().as_str().to_string();
    let info = java_trim(open.get(2).unwrap().as_str()).to_string();

    let mut i = start_idx + 1;
    let mut body_start: Option<(usize, usize)> = None; // (u16, byte)
    let mut body_end: Option<(usize, usize)> = None;
    let mut end_offset = start.end_offset;
    while i < lines.len() {
        let ln = &lines[i];
        if let Some(close) = FENCE_RE.captures(&ln.text) {
            if close.get(1).unwrap().as_str().len() >= fence_marker.len() {
                end_offset = ln.end_offset;
                break;
            }
        }
        if body_start.is_none() {
            body_start = Some((ln.start_offset, ln.start_byte));
        }
        // Include the newline that separates this line from the next.
        body_end = Some((ln.end_offset + 1, ln.end_byte + 1));
        i += 1;
    }

    let source_u16 = utf16_len(source);
    let clamped_end_u16 = body_end.map_or(0, |(u16, _)| u16.min(source_u16));
    let clamped_end_byte = body_end.map_or(0, |(_, byte)| byte.min(source.len()));
    let body = match (body_start, body_end) {
        (Some((_, sb)), Some(_)) => source[sb..clamped_end_byte].to_string(),
        _ => String::new(),
    };
    let fallback = start.end_offset;
    let body_span = Span::from_offsets(
        source,
        body_start.map_or(fallback, |(u16, _)| u16),
        if body_end.is_some() {
            clamped_end_u16
        } else {
            fallback
        },
    );
    let fence = Fence {
        span: Span::from_offsets(source, start.start_offset, end_offset),
        info,
        body,
        body_span,
    };
    Some((fence, i + 1))
}

fn try_table(source: &str, lines: &[RawLine], start_idx: usize) -> Option<(Table, usize)> {
    if start_idx + 1 >= lines.len() {
        return None;
    }
    let header_line = &lines[start_idx];
    let delim_line = &lines[start_idx + 1];
    if !ROW_RE.is_match(&header_line.text) || !DELIM_RE.is_match(&delim_line.text) {
        return None;
    }

    let header_parsed = parse_row_cells(&header_line.text, header_line.start_offset, source);
    let header = Row {
        cells: header_parsed.cells,
        cell_spans: header_parsed.cell_spans,
        span: Span::from_offsets(source, header_line.start_offset, header_line.end_offset),
    };

    let mut rows = Vec::new();
    let mut i = start_idx + 2;
    while i < lines.len() {
        let ln = &lines[i];
        if !ROW_RE.is_match(&ln.text) {
            break;
        }
        let parsed = parse_row_cells(&ln.text, ln.start_offset, source);
        rows.push(Row {
            cells: parsed.cells,
            cell_spans: parsed.cell_spans,
            span: Span::from_offsets(source, ln.start_offset, ln.end_offset),
        });
        i += 1;
    }
    let end_offset = rows
        .last()
        .map_or(delim_line.end_offset, |r| r.span.end_offset);
    let table = Table {
        span: Span::from_offsets(source, header_line.start_offset, end_offset),
        header,
        rows,
    };
    Some((table, i))
}
