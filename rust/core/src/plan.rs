//! The planner — port of `plan.ts` / `Plan.java`. Plans each text-bearing block
//! via the matcher, lifts block offsets to source spans, attaches trailing
//! table/fence nodes, handles the ```` ```error ```` fence, expands header-bound
//! tables into one example per row, and collects diagnostics.

use crate::ast::{Block, Fence, Row, SegmentOffset, Table, VarDoc};
use crate::cell_diff::RowCheck;
use crate::diagnostics::{Diagnostic, ambiguous_match, error_fence_without_step};
use crate::matcher::{Hit, ParamSpan, ResolvedSteps, find_hits, resolve_hits};
use crate::offsets::{java_trim, utf16_len};
use crate::registry::{FormatFn, Registry, StepRegistration};
use crate::sentences::split_sentences;
use crate::span::Span;
use crate::value::Value;
use regex::Regex;
use std::collections::BTreeMap;
use std::rc::Rc;
use std::sync::LazyLock;

/// The result of planning a whole [`VarDoc`].
pub struct ExecutionPlan {
    pub var_doc: VarDoc,
    pub examples: Vec<PlannedExample>,
    pub diagnostics: Vec<Diagnostic>,
}

/// One matched-and-runnable example.
pub struct PlannedExample {
    pub name: String,
    pub scope_stack: Vec<String>,
    pub span: Span,
    pub steps: Vec<PlannedStep>,
    pub header_binding: Option<HeaderBinding>,
    pub row_checks: Option<Vec<RowCheck>>,
    pub expected_outcome: Option<String>,
    pub expected_error_message: Option<String>,
}

/// The binding paragraph shared by every row of a header-bound table.
pub struct HeaderBinding {
    pub match_span: Span,
    pub param_spans: Vec<Span>,
    pub step_def: Rc<StepRegistration>,
}

/// One matched step: text, source span, captured-parameter spans, args, and
/// attachments. `formats` aligns 1:1 with `args`.
#[derive(Clone)]
pub struct PlannedStep {
    pub text: String,
    pub match_span: Span,
    pub param_spans: Vec<Span>,
    pub step_def: Rc<StepRegistration>,
    pub args: Vec<Value>,
    pub formats: Vec<Option<FormatFn>>,
    pub data_table: Option<Table>,
    pub doc_string: Option<Fence>,
}

static WHITESPACE_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s+").unwrap());
static WORD_CHAR_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[\p{L}\p{N}_]$").unwrap());

/// Plans `doc` against `registry`. Port of `plan()`.
pub fn plan(doc: &VarDoc, registry: &Registry) -> ExecutionPlan {
    let source = &doc.source;
    let mut diagnostics = Vec::new();

    // Phase 1: plan each candidate paragraph independently into a "unit".
    let units: Vec<CandidateUnit> = doc
        .examples
        .iter()
        .map(|ex| plan_candidate(ex, doc, registry, &mut diagnostics))
        .collect();

    // Phase 2: group adjacent candidates into examples. A matching candidate
    // continues the open example when no delimiter (heading / `---`) precedes it;
    // otherwise it starts a new one. A non-matching candidate (prose) is a
    // delimiter: it closes the open example and is dropped. A header-bound table
    // candidate is standalone — it already emits one example per row. See ADR 0012.
    let mut examples: Vec<PlannedExample> = Vec::new();
    let mut open: Option<MergedExample> = None;
    for unit in units {
        match unit {
            CandidateUnit::HeaderBound { rows } => {
                if let Some(m) = open.take() {
                    examples.push(finish_merged(m, source));
                }
                examples.extend(rows);
            }
            CandidateUnit::Steps(unit) => {
                if !unit.matched {
                    // Prose paragraph — a delimiter. Drop it and end the open example.
                    if let Some(m) = open.take() {
                        examples.push(finish_merged(m, source));
                    }
                    continue;
                }
                match open.as_mut() {
                    Some(m) if !unit.preceded_by_delimiter => merge_into(m, unit),
                    _ => {
                        if let Some(m) = open.take() {
                            examples.push(finish_merged(m, source));
                        }
                        open = Some(start_merged(unit));
                    }
                }
            }
        }
    }
    if let Some(m) = open.take() {
        examples.push(finish_merged(m, source));
    }

    // A table or fence that doesn't attach to a step is just Markdown content,
    // not a mistake — it produces no diagnostic.

    ExecutionPlan {
        var_doc: doc.clone(),
        examples,
        diagnostics,
    }
}

/// A step-bearing candidate accumulating into one example while adjacent matching
/// candidates keep merging in.
struct MergedExample {
    name: String,
    scope_stack: Vec<String>,
    start_offset: usize,
    end_offset: usize,
    steps: Vec<PlannedStep>,
    expected_outcome: Option<String>,
    expected_error_message: Option<String>,
}

/// One candidate paragraph, planned in isolation.
enum CandidateUnit {
    HeaderBound { rows: Vec<PlannedExample> },
    Steps(StepsUnit),
}

struct StepsUnit {
    matched: bool,
    preceded_by_delimiter: bool,
    name: String,
    scope_stack: Vec<String>,
    span: Span,
    steps: Vec<PlannedStep>,
    expected_outcome: Option<String>,
    expected_error_message: Option<String>,
}

fn start_merged(unit: StepsUnit) -> MergedExample {
    MergedExample {
        name: unit.name,
        scope_stack: unit.scope_stack,
        start_offset: unit.span.start_offset,
        end_offset: unit.span.end_offset,
        steps: unit.steps,
        expected_outcome: unit.expected_outcome,
        expected_error_message: unit.expected_error_message,
    }
}

fn merge_into(open: &mut MergedExample, unit: StepsUnit) {
    open.end_offset = unit.span.end_offset;
    open.steps.extend(unit.steps);
    // Any error fence in a merged part marks the whole example expected-to-fail;
    // keep the first message we see.
    if unit.expected_outcome.as_deref() == Some("fail") {
        open.expected_outcome = Some("fail".to_string());
        if open.expected_error_message.is_none() && unit.expected_error_message.is_some() {
            open.expected_error_message = unit.expected_error_message;
        }
    }
}

fn finish_merged(open: MergedExample, source: &str) -> PlannedExample {
    let span = Span::from_offsets(source, open.start_offset, open.end_offset);
    PlannedExample {
        name: open.name,
        scope_stack: open.scope_stack,
        span,
        steps: open.steps,
        header_binding: None,
        row_checks: None,
        expected_outcome: open.expected_outcome,
        expected_error_message: open.expected_error_message,
    }
}

/// Plan a single candidate paragraph (plus its attached tables/fences) in
/// isolation. Emits ambiguity / error-fence diagnostics into `diagnostics`.
fn plan_candidate(
    ex: &crate::ast::Example,
    doc: &VarDoc,
    registry: &Registry,
    diagnostics: &mut Vec<Diagnostic>,
) -> CandidateUnit {
    let source = &doc.source;
    let mut had_ambiguous = false;
    let body = &ex.body;

    // Pass 1: plan each text-bearing block, collecting steps per body index.
    let mut steps_by_block: BTreeMap<usize, Vec<PlannedStep>> = BTreeMap::new();
    for (idx, block) in body.iter().enumerate() {
        if !is_text_bearing(block) {
            continue;
        }
        let text = text_of(block);
        let (block_hits, ambiguities) = plan_block(text, registry);
        for collision in &ambiguities {
            let span = lift_span(source, block, collision.match_start, collision.match_end);
            diagnostics.push(ambiguous_match(span));
            had_ambiguous = true;
        }
        if !had_ambiguous && !block_hits.is_empty() {
            let block_steps: Vec<PlannedStep> = block_hits
                .into_iter()
                .map(|hit| PlannedStep {
                    text: crate::offsets::utf16_slice(text, hit.match_start, hit.match_end)
                        .to_string(),
                    match_span: lift_span(source, block, hit.match_start, hit.match_end),
                    param_spans: hit
                        .param_spans
                        .iter()
                        .map(|p| lift_span(source, block, p.start, p.end))
                        .collect(),
                    step_def: hit.step_def,
                    args: hit.args,
                    formats: hit.formats,
                    data_table: None,
                    doc_string: None,
                })
                .collect();
            steps_by_block.insert(idx, block_steps);
        }
    }

    // Header-bound table: iterate row by row.
    let bound = if had_ambiguous {
        None
    } else {
        detect_header_bound(body, &steps_by_block, source)
    };
    if let Some(bound) = bound {
        let header_binding = HeaderBinding {
            match_span: bound.step.match_span,
            param_spans: bound.header_spans.clone(),
            step_def: bound.step.step_def.clone(),
        };
        let header_cells = &bound.table.header.cells;
        let mut rows = Vec::new();
        for row in &bound.table.rows {
            let mut row_object = BTreeMap::new();
            for (i, header) in header_cells.iter().enumerate() {
                row_object.insert(header.clone(), Value::from(cell_at(row, i)));
            }
            let mut row_args = bound.step.args.clone();
            row_args.push(Value::Map(row_object));
            let row_step = PlannedStep {
                text: bound.step.text.clone(),
                match_span: row.span,
                param_spans: bound.step.param_spans.clone(),
                step_def: bound.step.step_def.clone(),
                args: row_args,
                formats: bound.step.formats.clone(),
                data_table: None,
                doc_string: None,
            };
            let row_checks: Vec<RowCheck> = header_cells
                .iter()
                .enumerate()
                .map(|(i, header)| {
                    RowCheck::new(header.clone(), cell_at(row, i), cell_span_at(row, i))
                })
                .collect();
            let mut nested_scope = ex.scope_stack.clone();
            nested_scope.push(bound.step.text.clone());
            rows.push(PlannedExample {
                name: row.cells.join(" / "),
                scope_stack: nested_scope,
                span: row.span,
                steps: vec![row_step],
                header_binding: Some(HeaderBinding {
                    match_span: header_binding.match_span,
                    param_spans: header_binding.param_spans.clone(),
                    step_def: header_binding.step_def.clone(),
                }),
                row_checks: Some(row_checks),
                expected_outcome: None,
                expected_error_message: None,
            });
        }
        return CandidateUnit::HeaderBound { rows };
    }

    // An ```error fence anywhere marks the candidate expected-to-fail.
    let error_fence: Option<&Fence> = body.iter().find_map(|b| match b {
        Block::Fence(f) if f.info == "error" => Some(f),
        _ => None,
    });

    // Pass 2: table/fence immediately after a step-bearing block.
    let mut attachments: BTreeMap<usize, (Option<Table>, Option<Fence>)> = BTreeMap::new();
    for (idx, here) in body.iter().enumerate().skip(1) {
        match here {
            Block::Table(table) if steps_by_block.contains_key(&(idx - 1)) => {
                attachments.entry(idx - 1).or_default().0 = Some(table.clone());
            }
            Block::Fence(fence)
                if fence.info != "error" && steps_by_block.contains_key(&(idx - 1)) =>
            {
                attachments.entry(idx - 1).or_default().1 = Some(fence.clone());
            }
            _ => {}
        }
    }

    // Pass 3: rebuild the final step list, applying attachments to the last
    // step of each block.
    let mut final_steps = Vec::new();
    for idx in 0..body.len() {
        let Some(steps_at_idx) = steps_by_block.get(&idx) else {
            continue;
        };
        let attach = attachments.get(&idx);
        let last = steps_at_idx.len() - 1;
        for (s, step) in steps_at_idx.iter().enumerate() {
            if s == last {
                if let Some((data_table, doc_string)) = attach {
                    let mut with_attach = step.clone();
                    with_attach.data_table = data_table.clone();
                    with_attach.doc_string = doc_string.clone();
                    final_steps.push(with_attach);
                    continue;
                }
            }
            final_steps.push(step.clone());
        }
    }

    let runnable_steps = if had_ambiguous {
        Vec::new()
    } else {
        final_steps
    };

    // An `error` fence declares the candidate expected-to-fail, but here there's
    // no runnable step to produce that failure (nothing matched, or the match was
    // ambiguous). That's an author mistake, not silent Markdown — flag it.
    if let Some(fence) = error_fence {
        if runnable_steps.is_empty() {
            diagnostics.push(error_fence_without_step(fence.span));
        }
    }

    let (expected_outcome, expected_error_message) = match error_fence {
        Some(fence) => {
            let trimmed = java_trim(&fence.body);
            let msg = if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            };
            (Some("fail".to_string()), msg)
        }
        None => (None, None),
    };

    CandidateUnit::Steps(StepsUnit {
        matched: !runnable_steps.is_empty(),
        preceded_by_delimiter: ex.preceded_by_delimiter,
        name: derive_example_name(body),
        scope_stack: ex.scope_stack.clone(),
        span: ex.span,
        steps: runnable_steps,
        expected_outcome,
        expected_error_message,
    })
}

struct Ambiguity {
    match_start: usize,
    match_end: usize,
}

fn plan_block(text: &str, registry: &Registry) -> (Vec<Hit>, Vec<Ambiguity>) {
    let mut all_steps = Vec::new();
    let mut all_ambiguities = Vec::new();
    for sentence in split_sentences(text) {
        let off = sentence.start_offset;
        let adjusted: Vec<Hit> = find_hits(&sentence.text, registry)
            .into_iter()
            .map(|h| {
                let param_spans = h
                    .param_spans
                    .iter()
                    .map(|p| ParamSpan {
                        start: p.start + off,
                        end: p.end + off,
                    })
                    .collect();
                Hit {
                    expression: h.expression,
                    step_def: h.step_def,
                    match_start: h.match_start + off,
                    match_end: h.match_end + off,
                    args: h.args,
                    param_spans,
                    formats: h.formats,
                }
            })
            .collect();
        match resolve_hits(adjusted) {
            ResolvedSteps::Ambiguous(collisions) => {
                for c in collisions {
                    all_ambiguities.push(Ambiguity {
                        match_start: c.match_start,
                        match_end: c.match_end,
                    });
                }
            }
            ResolvedSteps::Ok(steps) => {
                if !steps.is_empty() {
                    all_steps.extend(steps);
                }
            }
        }
    }
    (all_steps, all_ambiguities)
}

struct HeaderBoundResult {
    table: Table,
    step: PlannedStep,
    header_spans: Vec<Span>,
}

fn detect_header_bound(
    body: &[Block],
    steps_by_block: &BTreeMap<usize, Vec<PlannedStep>>,
    source: &str,
) -> Option<HeaderBoundResult> {
    for idx in 1..body.len() {
        let Block::Table(table) = &body[idx] else {
            continue;
        };
        let above = &body[idx - 1];
        if !is_text_bearing(above) {
            continue;
        }
        let Some(steps) = steps_by_block.get(&(idx - 1)) else {
            continue;
        };
        if steps.is_empty() {
            continue;
        }
        let above_text = text_of(above);
        let header_cells = &table.header.cells;
        let mut offsets = Vec::with_capacity(header_cells.len());
        let mut any_missing = false;
        for cell in header_cells {
            match word_offset(above_text, cell) {
                Some(o) => offsets.push(o),
                None => {
                    any_missing = true;
                    offsets.push(0);
                }
            }
        }
        if any_missing {
            continue;
        }
        let header_spans: Vec<Span> = header_cells
            .iter()
            .zip(&offsets)
            .map(|(cell, &o)| lift_span(source, above, o, o + utf16_len(cell)))
            .collect();
        return Some(HeaderBoundResult {
            table: table.clone(),
            step: steps.last().unwrap().clone(),
            header_spans,
        });
    }
    None
}

/// UTF-16 offset of `word` in `haystack` as a whole word (case-sensitive), or
/// `None`. Manual scan replacing Java's lookbehind/lookaround regex.
fn word_offset(haystack: &str, word: &str) -> Option<usize> {
    if word.is_empty() {
        return None;
    }
    let mut from = 0;
    while let Some(rel) = haystack[from..].find(word) {
        let at = from + rel;
        let before_ok = haystack[..at]
            .chars()
            .next_back()
            .is_none_or(|c| !is_word_char(c));
        let after = at + word.len();
        let after_ok = haystack[after..]
            .chars()
            .next()
            .is_none_or(|c| !is_word_char(c));
        if before_ok && after_ok {
            return Some(crate::offsets::utf16_index(haystack, at));
        }
        from = at + haystack[at..].chars().next().map_or(1, char::len_utf8);
    }
    None
}

fn is_word_char(c: char) -> bool {
    let mut buf = [0u8; 4];
    WORD_CHAR_RE.is_match(c.encode_utf8(&mut buf))
}

/// The example name: the primary block's text with whitespace collapsed and a
/// single trailing terminator stripped. Port of `deriveExampleName`.
pub(crate) fn derive_example_name(body: &[Block]) -> String {
    let Some(primary) = body.iter().find(|b| is_text_bearing(b)) else {
        return String::new();
    };
    let collapsed = WHITESPACE_RE.replace_all(text_of(primary), " ");
    let mut name = java_trim(&collapsed).to_string();
    if let Some(last) = name.chars().last() {
        if last == '.' || last == '!' || last == '?' {
            name.pop();
        }
    }
    name
}

fn is_text_bearing(block: &Block) -> bool {
    matches!(block, Block::Paragraph(_) | Block::ListItem(_) | Block::Blockquote(_))
}

fn text_of(block: &Block) -> &str {
    match block {
        Block::Paragraph(p) => &p.text,
        Block::ListItem(l) => &l.text,
        Block::Blockquote(b) => &b.text,
        _ => panic!("not a text-bearing block"),
    }
}

fn cell_at(row: &Row, i: usize) -> &str {
    row.cells.get(i).map_or("", |c| c.as_str())
}

fn cell_span_at(row: &Row, i: usize) -> Span {
    row.cell_spans.get(i).copied().unwrap_or(row.span)
}

fn segment_map_of(block: &Block) -> Option<&[SegmentOffset]> {
    match block {
        Block::Paragraph(p) => Some(&p.segment_map),
        Block::ListItem(l) => Some(&l.segment_map),
        Block::Blockquote(b) => Some(&b.segment_map),
        _ => None,
    }
}

fn lift_span(source: &str, block: &Block, block_start: usize, block_end: usize) -> Span {
    match segment_map_of(block) {
        Some(sm) => {
            let start = lift_segment_offset(sm, block_start);
            let end = lift_segment_offset(sm, block_end);
            Span::from_offsets(source, start, end)
        }
        None => block.span(),
    }
}

fn lift_segment_offset(segment_map: &[SegmentOffset], text_offset: usize) -> usize {
    let mut best = segment_map.first();
    for entry in segment_map {
        if entry.text_offset <= text_offset {
            best = Some(entry);
        }
    }
    let best = best.expect("empty segmentMap");
    best.source_offset + (text_offset - best.text_offset)
}
