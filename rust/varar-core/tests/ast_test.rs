//! Port of `AstTest.java`. Java's defensive-copy/`UnsupportedOperationException`
//! clauses are dropped — Rust's owned `Vec` fields are immutable by construction
//! — leaving each test's constructor + accessor core. The two reflection tests
//! (`blockPermitsExactlySevenVariants` / `tableOrFencePermitsExactlyTableAndFence`)
//! are dropped: the Rust enums *are* the compiler-enforced closed sets.

use varar_core::ast::{
    Block, Blockquote, Example, Fence, Heading, ListItem, Paragraph, Row, SegmentOffset, Table,
    TableOrFence, ThematicBreak, VarDoc,
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
fn segment_offset_exposes_both_offsets() {
    let offset = SegmentOffset::new(3, 7);
    assert_eq!(3, offset.text_offset);
    assert_eq!(7, offset.source_offset);
}

#[test]
fn heading_exposes_level_text_and_span_and_is_a_block() {
    let heading = Heading {
        level: 2,
        text: "Title".to_string(),
        span: SPAN,
    };
    assert_eq!(2, heading.level);
    assert_eq!("Title", heading.text);
    assert_eq!(SPAN, heading.span);
    let _: Block = Block::Heading(heading);
}

#[test]
fn paragraph_exposes_fields_and_is_a_block() {
    let paragraph = Paragraph {
        text: "Some text.".to_string(),
        span: SPAN,
        segment_map: vec![SegmentOffset::new(0, 0)],
    };
    assert_eq!("Some text.", paragraph.text);
    assert_eq!(SPAN, paragraph.span);
    assert_eq!(1, paragraph.segment_map.len());
    let _: Block = Block::Paragraph(paragraph);
}

#[test]
fn list_item_exposes_fields() {
    let marker_span = Span {
        start_offset: 0,
        end_offset: 2,
        start_line: 1,
        start_col: 1,
        end_line: 1,
        end_col: 3,
    };
    let list_item = ListItem {
        text: "An item".to_string(),
        span: SPAN,
        segment_map: vec![SegmentOffset::new(0, 0)],
        ordered: true,
        marker_span,
    };
    assert_eq!("An item", list_item.text);
    assert_eq!(SPAN, list_item.span);
    assert!(list_item.ordered);
    assert_eq!(marker_span, list_item.marker_span);
    let _: Block = Block::ListItem(list_item);
}

#[test]
fn blockquote_exposes_fields() {
    let blockquote = Blockquote {
        text: "Quoted".to_string(),
        span: SPAN,
        segment_map: vec![SegmentOffset::new(0, 0)],
    };
    assert_eq!("Quoted", blockquote.text);
    assert_eq!(SPAN, blockquote.span);
    let _: Block = Block::Blockquote(blockquote);
}

#[test]
fn row_exposes_fields() {
    let row = Row {
        cells: vec!["a".to_string(), "b".to_string()],
        cell_spans: vec![SPAN, SPAN],
        span: SPAN,
    };
    assert_eq!(vec!["a".to_string(), "b".to_string()], row.cells);
    assert_eq!(vec![SPAN, SPAN], row.cell_spans);
    assert_eq!(SPAN, row.span);
}

#[test]
fn table_exposes_fields() {
    let header = Row {
        cells: vec!["h1".to_string(), "h2".to_string()],
        cell_spans: vec![SPAN, SPAN],
        span: SPAN,
    };
    let data_row = Row {
        cells: vec!["v1".to_string(), "v2".to_string()],
        cell_spans: vec![SPAN, SPAN],
        span: SPAN,
    };
    let table = Table {
        span: SPAN,
        header: header.clone(),
        rows: vec![data_row],
    };
    assert_eq!(SPAN, table.span);
    assert_eq!(header, table.header);
    assert_eq!(1, table.rows.len());
    let _: Block = Block::Table(table);
}

#[test]
fn fence_exposes_fields() {
    let body_span = Span {
        start_offset: 1,
        end_offset: 4,
        start_line: 1,
        start_col: 2,
        end_line: 1,
        end_col: 5,
    };
    let fence = Fence {
        span: SPAN,
        info: "json".to_string(),
        body: "{}".to_string(),
        body_span,
    };
    assert_eq!(SPAN, fence.span);
    assert_eq!("json", fence.info);
    assert_eq!("{}", fence.body);
    assert_eq!(body_span, fence.body_span);
    let _: Block = Block::Fence(fence);
}

#[test]
fn thematic_break_exposes_span() {
    let thematic_break = ThematicBreak { span: SPAN };
    assert_eq!(SPAN, thematic_break.span);
    let _: Block = Block::ThematicBreak(thematic_break);
}

#[test]
fn example_exposes_fields() {
    let example = Example {
        scope_stack: vec!["Feature".to_string(), "Scenario".to_string()],
        span: SPAN,
        body: vec![Block::ThematicBreak(ThematicBreak { span: SPAN })],
    };
    assert_eq!(
        vec!["Feature".to_string(), "Scenario".to_string()],
        example.scope_stack
    );
    assert_eq!(SPAN, example.span);
    assert_eq!(1, example.body.len());
}

#[test]
fn var_doc_exposes_fields() {
    let example = Example {
        scope_stack: vec![],
        span: SPAN,
        body: vec![Block::ThematicBreak(ThematicBreak { span: SPAN })],
    };
    let orphan = TableOrFence::Fence(Fence {
        span: SPAN,
        info: String::new(),
        body: String::new(),
        body_span: SPAN,
    });
    let doc = VarDoc {
        path: "spec.md".to_string(),
        source: "# Title".to_string(),
        examples: vec![example],
        orphan_attachments: vec![orphan],
    };
    assert_eq!("spec.md", doc.path);
    assert_eq!("# Title", doc.source);
    assert_eq!(1, doc.examples.len());
    assert_eq!(1, doc.orphan_attachments.len());
}
