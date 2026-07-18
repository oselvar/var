//! Port of `ScannerTest.java` / `scanner.test.ts`.

use varar_core::ast::Block;
use varar_core::ast::SegmentOffset;
use varar_core::offsets::{utf16_len, utf16_slice};
use varar_core::scanner::scan;
use varar_core::span::Span;

fn kind_of(b: &Block) -> &'static str {
    match b {
        Block::Heading(_) => "heading",
        Block::Paragraph(_) => "paragraph",
        Block::ListItem(_) => "list_item",
        Block::Blockquote(_) => "blockquote",
        Block::Table(_) => "table",
        Block::Fence(_) => "fence",
        Block::ThematicBreak(_) => "thematic_break",
    }
}

fn kinds(blocks: &[Block]) -> Vec<&'static str> {
    blocks.iter().map(kind_of).collect()
}

fn slice(source: &str, span: Span) -> &str {
    utf16_slice(source, span.start_offset, span.end_offset)
}

fn first_paragraph(blocks: &[Block]) -> &varar_core::ast::Paragraph {
    blocks
        .iter()
        .find_map(|b| {
            if let Block::Paragraph(p) = b {
                Some(p)
            } else {
                None
            }
        })
        .unwrap()
}

fn first_table(blocks: &[Block]) -> &varar_core::ast::Table {
    blocks
        .iter()
        .find_map(|b| {
            if let Block::Table(t) = b {
                Some(t)
            } else {
                None
            }
        })
        .unwrap()
}

fn first_fence(blocks: &[Block]) -> &varar_core::ast::Fence {
    blocks
        .iter()
        .find_map(|b| {
            if let Block::Fence(f) = b {
                Some(f)
            } else {
                None
            }
        })
        .unwrap()
}

// ── Heading tests ────────────────────────────────────────────────────

#[test]
fn scan_finds_a_single_h1_heading() {
    let blocks = scan("# Hello");
    assert_eq!(1, blocks.len());
    let Block::Heading(h) = &blocks[0] else {
        panic!("expected heading")
    };
    assert_eq!(1, h.level);
    assert_eq!("Hello", h.text);
    assert_eq!(
        Span {
            start_offset: 0,
            end_offset: 7,
            start_line: 1,
            start_col: 1,
            end_line: 1,
            end_col: 8
        },
        h.span
    );
}

#[test]
fn scan_finds_headings_at_levels_1_through_6() {
    let source = "# a\n## b\n### c\n#### d\n##### e\n###### f";
    let blocks = scan(source);
    let levels: Vec<usize> = blocks
        .iter()
        .filter_map(|b| {
            if let Block::Heading(h) = b {
                Some(h.level)
            } else {
                None
            }
        })
        .collect();
    assert_eq!(vec![1, 2, 3, 4, 5, 6], levels);
}

#[test]
fn scan_ignores_headings_with_more_than_6_hashes() {
    let blocks = scan("####### too deep");
    assert!(!blocks.iter().any(|b| matches!(b, Block::Heading(_))));
}

#[test]
fn scan_strips_the_optional_trailing_hash_marker() {
    let blocks = scan("## Hello ##");
    let Block::Heading(h) = &blocks[0] else {
        panic!("expected heading")
    };
    assert_eq!("Hello", h.text);
}

// ── Paragraph tests ──────────────────────────────────────────────────

#[test]
fn scan_groups_consecutive_non_blank_lines_into_a_single_paragraph() {
    let source = "first line\nsecond line\n\nthird line";
    let blocks = scan(source);
    let paragraphs: Vec<&varar_core::ast::Paragraph> = blocks
        .iter()
        .filter_map(|b| {
            if let Block::Paragraph(p) = b {
                Some(p)
            } else {
                None
            }
        })
        .collect();
    assert_eq!(2, paragraphs.len());
    assert_eq!("first line\nsecond line", paragraphs[0].text);
    assert_eq!("third line", paragraphs[1].text);
}

#[test]
fn paragraph_span_covers_the_full_multi_line_range() {
    let source = "first line\nsecond line\n\nthird line";
    let blocks = scan(source);
    let p1 = first_paragraph(&blocks);
    assert_eq!(0, p1.span.start_offset);
    assert_eq!(utf16_len("first line\nsecond line"), p1.span.end_offset);
    assert_eq!(1, p1.span.start_line);
    assert_eq!(2, p1.span.end_line);
}

#[test]
fn paragraph_segment_map_maps_text_offsets_to_source_offsets() {
    let source = "# Heading\n\nhello world";
    let blocks = scan(source);
    let paragraph = first_paragraph(&blocks);
    // 'hello world' lives at source offset 11 (after '# Heading\n\n')
    assert_eq!(SegmentOffset::new(0, 11), paragraph.segment_map[0]);
}

#[test]
fn inline_markup_is_never_stripped_block_text_is_the_raw_source() {
    let source = "Maya borrowed *Emma*, see [docs](https://x.test) and `code`.";
    let blocks = scan(source);
    assert_eq!(source, first_paragraph(&blocks).text);
}

#[test]
fn astral_paragraph_span_end_offset_is_utf16_code_units() {
    let source = "🎉 hello";
    assert_eq!(8, utf16_len(source));
    let blocks = scan(source);
    assert_eq!(1, blocks.len());
    let Block::Paragraph(p) = &blocks[0] else {
        panic!("expected paragraph")
    };
    assert_eq!(0, p.span.start_offset);
    assert_eq!(8, p.span.end_offset);
}

// ── Fence tests ──────────────────────────────────────────────────────

#[test]
fn scan_recognizes_a_fenced_code_block_with_info_string() {
    let source = "# Title\n\n```json\n{ \"a\": 1 }\n```\n";
    let blocks = scan(source);
    let fence = first_fence(&blocks);
    assert_eq!("json", fence.info);
    assert_eq!("{ \"a\": 1 }\n", fence.body);
}

#[test]
fn scan_tolerates_a_fence_with_no_info_string() {
    let blocks = scan("```\nplain body\n```");
    let fence = first_fence(&blocks);
    assert_eq!("", fence.info);
    assert_eq!("plain body\n", fence.body);
}

#[test]
fn scan_does_not_split_paragraphs_across_a_fence() {
    let source = "paragraph above\n\n```\nbody\n```\n\nparagraph below";
    let blocks = scan(source);
    assert_eq!(vec!["paragraph", "fence", "paragraph"], kinds(&blocks));
}

// ── Table tests ───────────────────────────────────────────────────────

#[test]
fn scan_recognizes_a_gfm_table_with_header_delimiter_rows() {
    let source = "| name | age |\n|------|-----|\n| Bob  | 30  |\n| Eve  | 25  |\n";
    let blocks = scan(source);
    let table = first_table(&blocks);
    assert_eq!(
        vec!["name".to_string(), "age".to_string()],
        table.header.cells
    );
    assert_eq!(2, table.rows.len());
    assert_eq!(
        vec!["Bob".to_string(), "30".to_string()],
        table.rows[0].cells
    );
    assert_eq!(
        vec!["Eve".to_string(), "25".to_string()],
        table.rows[1].cells
    );
}

#[test]
fn a_line_that_looks_like_a_row_but_has_no_following_delimiter_is_a_paragraph() {
    let blocks = scan("| not | a | table |");
    assert!(matches!(&blocks[0], Block::Paragraph(_)));
}

#[test]
fn table_rows_expose_a_source_span_per_cell_that_slices_back_to_the_trimmed_cell_text() {
    let source = "# T\n\nthese rows:\n\n| a | bb  |\n| - | --- |\n| 1 | 222 |";
    let blocks = scan(source);
    let table = first_table(&blocks);
    let row = &table.rows[0];
    assert_eq!(2, row.cell_spans.len());
    assert_eq!("1", slice(source, row.cell_spans[0]));
    assert_eq!("222", slice(source, row.cell_spans[1]));
    // The header row carries cell spans too.
    assert_eq!("bb", slice(source, table.header.cell_spans[1]));
}

#[test]
fn a_single_column_gfm_table_parses_as_a_table_not_paragraphs() {
    let source = "# T\n\nthese:\n\n| n |\n| - |\n| 7 |\n| 8 |";
    let blocks = scan(source);
    let table = first_table(&blocks);
    assert_eq!(vec!["n".to_string()], table.header.cells);
    let rows: Vec<Vec<String>> = table.rows.iter().map(|r| r.cells.clone()).collect();
    assert_eq!(vec![vec!["7".to_string()], vec!["8".to_string()]], rows);
    assert_eq!("7", slice(source, table.rows[0].cell_spans[0]));
}

// ── Thematic break tests ─────────────────────────────────────────────

#[test]
fn recognizes_thematic_break() {
    for mark in ["---", "***", "___", "----", "* * *"] {
        let blocks = scan(&format!("a\n\n{mark}\n\nb"));
        assert_eq!(
            vec!["paragraph", "thematic_break", "paragraph"],
            kinds(&blocks),
            "mark = {mark}"
        );
    }
}

// ── List item tests ──────────────────────────────────────────────────

#[test]
fn scan_recognizes_unordered_list_items() {
    let blocks = scan("- Given I have 100\n- When I withdraw 40\n- Then I should have 60");
    assert_eq!(vec!["list_item", "list_item", "list_item"], kinds(&blocks));
    let Block::ListItem(first) = &blocks[0] else {
        panic!("expected list item")
    };
    assert!(!first.ordered);
    assert_eq!("Given I have 100", first.text);
}

#[test]
fn scan_recognizes_ordered_list_items() {
    let blocks = scan("1. First step\n2. Second step");
    assert_eq!(vec!["list_item", "list_item"], kinds(&blocks));
    let Block::ListItem(first) = &blocks[0] else {
        panic!("expected list item")
    };
    assert!(first.ordered);
}

// ── Blockquote tests ─────────────────────────────────────────────────

#[test]
fn scan_recognizes_blockquotes() {
    let blocks = scan("> Given I have 100\n> When I withdraw 40");
    assert_eq!(1, blocks.len());
    let Block::Blockquote(bq) = &blocks[0] else {
        panic!("expected blockquote")
    };
    assert_eq!("Given I have 100\nWhen I withdraw 40", bq.text);
}

#[test]
fn blockquote_text_drops_the_prefix_per_line_with_one_segment_entry_each() {
    let source = "> first *line*\n> second line";
    let blocks = scan(source);
    let Block::Blockquote(quote) = &blocks[0] else {
        panic!("expected blockquote")
    };
    assert_eq!("first *line*\nsecond line", quote.text);
    assert_eq!(
        vec![
            SegmentOffset::new(0, 2),
            SegmentOffset::new(utf16_len("first *line*\n"), utf16_len("> first *line*\n> ")),
        ],
        quote.segment_map
    );
}
