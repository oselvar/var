//! Projects pipeline output into the plain [`Value`] wire artifacts the
//! conformance goldens pin — port of `conformance.ts` / `Conformance.java`.
//! Covers all four projections (var-doc, registry, plan, trace).

use crate::ast::{
    Block, Blockquote, Example, Fence, Heading, ListItem, Paragraph, Row, SegmentOffset, Table,
    TableOrFence, ThematicBreak, VarDoc,
};
use crate::diagnostics::{Diagnostic, DiagnosticCode, Severity};
use crate::error::{StepError, StepFailure};
use crate::execute::{ExecutePorts, StepObservation, StepOutcome, collect_examples};
use crate::offsets::utf16_slice;
use crate::plan::{ExecutionPlan, PlannedExample, PlannedStep, plan};
use crate::registry::Registry;
use crate::span::Span;
use crate::value::Value;
use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap};
use std::rc::Rc;

pub use crate::expression::parameter_type_names;

/// All four projected wire artifacts for one bundle.
pub struct BundleArtifacts {
    pub var_doc: Value,
    pub registry: Value,
    pub plan: Value,
    pub trace: Value,
}

fn obj(pairs: Vec<(&str, Value)>) -> Value {
    let mut m = BTreeMap::new();
    for (k, v) in pairs {
        m.insert(k.to_string(), v);
    }
    Value::Map(m)
}

fn vint(n: usize) -> Value {
    Value::Int(n as i64)
}

// -----------------------------------------------------------------------------
// var-doc projection
// -----------------------------------------------------------------------------

/// Projects a parsed [`VarDoc`] to the var-doc wire artifact.
pub fn to_var_doc_artifact(doc: &VarDoc) -> Value {
    obj(vec![
        ("path", Value::from(doc.path.as_str())),
        (
            "examples",
            Value::List(doc.examples.iter().map(example).collect()),
        ),
        (
            "orphanAttachments",
            Value::List(doc.orphan_attachments.iter().map(table_or_fence).collect()),
        ),
    ])
}

fn span(s: Span) -> Value {
    obj(vec![
        ("startOffset", vint(s.start_offset)),
        ("endOffset", vint(s.end_offset)),
        ("startLine", vint(s.start_line)),
        ("startCol", vint(s.start_col)),
        ("endLine", vint(s.end_line)),
        ("endCol", vint(s.end_col)),
    ])
}

fn segment_offset(o: &SegmentOffset) -> Value {
    obj(vec![
        ("textOffset", vint(o.text_offset)),
        ("sourceOffset", vint(o.source_offset)),
    ])
}

fn segment_map(map: &[SegmentOffset]) -> Value {
    Value::List(map.iter().map(segment_offset).collect())
}

fn row(r: &Row) -> Value {
    obj(vec![
        (
            "cells",
            Value::List(r.cells.iter().map(|c| Value::from(c.as_str())).collect()),
        ),
        (
            "cellSpans",
            Value::List(r.cell_spans.iter().map(|s| span(*s)).collect()),
        ),
        ("span", span(r.span)),
    ])
}

fn table(t: &Table) -> Value {
    obj(vec![
        ("kind", Value::from("table")),
        ("span", span(t.span)),
        ("header", row(&t.header)),
        ("rows", Value::List(t.rows.iter().map(row).collect())),
    ])
}

fn fence(f: &Fence) -> Value {
    obj(vec![
        ("kind", Value::from("fence")),
        ("span", span(f.span)),
        ("info", Value::from(f.info.as_str())),
        ("body", Value::from(f.body.as_str())),
        ("bodySpan", span(f.body_span)),
    ])
}

fn heading(h: &Heading) -> Value {
    obj(vec![
        ("kind", Value::from("heading")),
        ("level", vint(h.level)),
        ("text", Value::from(h.text.as_str())),
        ("span", span(h.span)),
    ])
}

fn paragraph(p: &Paragraph) -> Value {
    obj(vec![
        ("kind", Value::from("paragraph")),
        ("text", Value::from(p.text.as_str())),
        ("span", span(p.span)),
        ("segmentMap", segment_map(&p.segment_map)),
    ])
}

fn list_item(l: &ListItem) -> Value {
    obj(vec![
        ("kind", Value::from("list_item")),
        ("text", Value::from(l.text.as_str())),
        ("span", span(l.span)),
        ("segmentMap", segment_map(&l.segment_map)),
        ("ordered", Value::Bool(l.ordered)),
        ("markerSpan", span(l.marker_span)),
    ])
}

fn blockquote(b: &Blockquote) -> Value {
    obj(vec![
        ("kind", Value::from("blockquote")),
        ("text", Value::from(b.text.as_str())),
        ("span", span(b.span)),
        ("segmentMap", segment_map(&b.segment_map)),
    ])
}

fn thematic_break(t: &ThematicBreak) -> Value {
    obj(vec![
        ("kind", Value::from("thematic_break")),
        ("span", span(t.span)),
    ])
}

fn block(b: &Block) -> Value {
    match b {
        Block::Heading(h) => heading(h),
        Block::Paragraph(p) => paragraph(p),
        Block::ListItem(l) => list_item(l),
        Block::Blockquote(b) => blockquote(b),
        Block::Table(t) => table(t),
        Block::Fence(f) => fence(f),
        Block::ThematicBreak(t) => thematic_break(t),
    }
}

fn table_or_fence(tf: &TableOrFence) -> Value {
    match tf {
        TableOrFence::Table(t) => table(t),
        TableOrFence::Fence(f) => fence(f),
    }
}

fn example(e: &Example) -> Value {
    obj(vec![
        (
            "scopeStack",
            Value::List(
                e.scope_stack
                    .iter()
                    .map(|s| Value::from(s.as_str()))
                    .collect(),
            ),
        ),
        ("span", span(e.span)),
        ("body", Value::List(e.body.iter().map(block).collect())),
    ])
}

// -----------------------------------------------------------------------------
// registry projection
// -----------------------------------------------------------------------------

/// Projects a [`Registry`] to the registry wire artifact.
pub fn to_registry_artifact(registry: &Registry) -> Value {
    let steps: Vec<Value> = registry
        .steps
        .iter()
        .map(|s| {
            obj(vec![
                ("expression", Value::from(s.expression.as_str())),
                (
                    "parameterTypeNames",
                    Value::List(
                        parameter_type_names(&s.expression)
                            .into_iter()
                            .map(Value::from)
                            .collect(),
                    ),
                ),
            ])
        })
        .collect();
    let parameter_types: Vec<Value> = registry
        .custom_parameter_types
        .iter()
        .map(|p| {
            obj(vec![
                ("name", Value::from(p.name.as_str())),
                ("regexp", Value::from(p.regexp.as_str())),
            ])
        })
        .collect();
    obj(vec![
        ("steps", Value::List(steps)),
        ("parameterTypes", Value::List(parameter_types)),
    ])
}

// -----------------------------------------------------------------------------
// plan projection
// -----------------------------------------------------------------------------

/// Projects an [`ExecutionPlan`] to the plan wire artifact.
pub fn to_plan_artifact(plan: &ExecutionPlan) -> Value {
    let source = &plan.var_doc.source;
    obj(vec![
        (
            "examples",
            Value::List(
                plan.examples
                    .iter()
                    .map(|ex| planned_example(source, ex))
                    .collect(),
            ),
        ),
        (
            "diagnostics",
            Value::List(plan.diagnostics.iter().map(diagnostic).collect()),
        ),
    ])
}

fn planned_example(source: &str, ex: &PlannedExample) -> Value {
    let mut pairs = vec![
        ("name", Value::from(ex.name.as_str())),
        (
            "scopeStack",
            Value::List(
                ex.scope_stack
                    .iter()
                    .map(|s| Value::from(s.as_str()))
                    .collect(),
            ),
        ),
        ("span", span(ex.span)),
        (
            "expectedOutcome",
            Value::from(ex.expected_outcome.as_deref().unwrap_or("pass")),
        ),
    ];
    if let Some(msg) = &ex.expected_error_message {
        pairs.push(("expectedErrorMessage", Value::from(msg.as_str())));
    }
    pairs.push((
        "steps",
        Value::List(ex.steps.iter().map(|s| planned_step(source, s)).collect()),
    ));
    obj(pairs)
}

fn planned_step(source: &str, step: &PlannedStep) -> Value {
    let param_names = parameter_type_names(&step.step_def.expression);
    let args: Vec<Value> = step
        .param_spans
        .iter()
        .enumerate()
        .map(|(i, ps)| {
            obj(vec![
                (
                    "value",
                    Value::from(utf16_slice(source, ps.start_offset, ps.end_offset)),
                ),
                (
                    "parameterType",
                    param_names
                        .get(i)
                        .map_or(Value::Null, |n| Value::from(n.as_str())),
                ),
            ])
        })
        .collect();

    let mut pairs = vec![
        ("text", Value::from(step.text.as_str())),
        ("matchSpan", span(step.match_span)),
        (
            "paramSpans",
            Value::List(step.param_spans.iter().map(|s| span(*s)).collect()),
        ),
        (
            "matchedExpression",
            Value::from(step.step_def.expression.as_str()),
        ),
        ("args", Value::List(args)),
    ];
    if let Some(t) = &step.data_table {
        pairs.push(("dataTable", table(t)));
    }
    if let Some(f) = &step.doc_string {
        pairs.push(("docString", doc_string(f)));
    }
    obj(pairs)
}

fn doc_string(f: &Fence) -> Value {
    obj(vec![
        ("content", Value::from(f.body.as_str())),
        ("contentType", Value::from(f.info.as_str())),
        ("span", span(f.body_span)),
    ])
}

fn diagnostic(d: &Diagnostic) -> Value {
    obj(vec![
        ("code", Value::from(diagnostic_code(d.code))),
        ("severity", Value::from(severity(d.severity))),
        ("span", span(d.span)),
    ])
}

fn diagnostic_code(code: DiagnosticCode) -> &'static str {
    match code {
        DiagnosticCode::AmbiguousMatch => "ambiguous-match",
        DiagnosticCode::ErrorFenceWithoutStep => "error-fence-without-step",
        DiagnosticCode::Drift => "drift",
    }
}

fn severity(s: Severity) -> &'static str {
    match s {
        Severity::Error => "error",
        Severity::Warning => "warning",
        Severity::Info => "info",
    }
}

// -----------------------------------------------------------------------------
// trace projection
// -----------------------------------------------------------------------------

/// Projects a caught step failure to the `FailureArtifact` wire shape. `None`
/// error falls through to `"thrown"`.
pub fn to_failure_artifact(failure: Option<&StepFailure>, match_span: Span) -> Value {
    let line = match_span.start_line;
    let anchor_span = match failure {
        Some(f) => crate::failure_anchor::anchor(&f.error, match_span),
        None => match_span,
    };
    let anchor = span(anchor_span);

    match failure.map(|f| &f.error) {
        Some(StepError::CellMismatch(cells)) => {
            let failing: Vec<Value> = cells.iter().filter(|c| !c.ok).map(failure_cell).collect();
            obj(vec![
                ("kind", Value::from("cell-mismatch")),
                ("line", vint(line)),
                ("anchor", anchor),
                ("cells", Value::List(failing)),
            ])
        }
        Some(StepError::DocStringMismatch(diff)) => {
            let d = obj(vec![
                ("expected", Value::from(diff.expected.as_str())),
                ("actual", Value::from(diff.actual.as_str())),
                ("span", span(diff.span)),
            ]);
            obj(vec![
                ("kind", Value::from("doc-string-mismatch")),
                ("line", vint(line)),
                ("anchor", anchor),
                ("diff", d),
            ])
        }
        Some(StepError::ReturnShape(_)) => kind_line_anchor("return-shape", line, anchor),
        Some(StepError::UnexpectedPass) => kind_line_anchor("unexpected-pass", line, anchor),
        _ => kind_line_anchor("thrown", line, anchor),
    }
}

fn failure_cell(c: &crate::cell_diff::CellDiff) -> Value {
    obj(vec![
        ("column", Value::from(c.column.as_str())),
        ("expected", Value::from(c.expected.as_str())),
        ("actual", Value::from(c.actual.as_str())),
        ("span", span(c.span)),
    ])
}

fn kind_line_anchor(kind: &str, line: usize, anchor: Value) -> Value {
    obj(vec![
        ("kind", Value::from(kind)),
        ("line", vint(line)),
        ("anchor", anchor),
    ])
}

/// Recovers the cross-language-shared step-file stem (strip the last extension),
/// e.g. `numerals.steps.rs` → `numerals.steps`.
fn file_stem(path: &str) -> String {
    let base = path.rsplit(['/', '\\']).next().unwrap_or(path);
    match base.rfind('.') {
        Some(dot) if dot > 0 => base[..dot].to_string(),
        _ => base.to_string(),
    }
}

/// Runs one bundle end-to-end: plan, execute (recording observations), and
/// project all four wire artifacts. Port of `runConformance`.
pub fn run_conformance(
    doc: &VarDoc,
    registry: &Registry,
    context_factory: &dyn Fn() -> Value,
) -> BundleArtifacts {
    let execution = plan(doc, registry);

    let observed: Rc<RefCell<HashMap<usize, Vec<StepObservation>>>> =
        Rc::new(RefCell::new(HashMap::new()));
    let observed_writer = observed.clone();
    let ports = ExecutePorts {
        reporter: Box::new(|_| {}),
        create_context: Some(Box::new(|_| context_factory())),
        observer: Some(Box::new(move |o: StepObservation| {
            observed_writer
                .borrow_mut()
                .entry(o.example_index)
                .or_default()
                .push(o);
        })),
    };

    let queue = collect_examples(&execution, &ports);
    let mut trace_examples = Vec::with_capacity(queue.len());
    for (k, queued) in queue.iter().enumerate() {
        let outcome = if queued.run().is_err() {
            "fail"
        } else {
            "pass"
        };

        let planned = &execution.examples[k];
        let empty = Vec::new();
        let obs_map = observed.borrow();
        let obs = obs_map.get(&k).unwrap_or(&empty);

        let mut steps = Vec::with_capacity(planned.steps.len());
        for (i, step) in planned.steps.iter().enumerate() {
            let ordinal = i + 1;
            // Prefer the first "fail" observation for this ordinal; else the last.
            let mut chosen: Option<&StepObservation> = None;
            for o in obs {
                if o.ordinal != ordinal {
                    continue;
                }
                chosen = Some(o);
                if o.outcome == StepOutcome::Fail {
                    break;
                }
            }
            let step_outcome = chosen.map_or("skipped", |o| o.outcome.as_str());

            let context_key = obj(vec![
                ("exampleName", Value::from(queued.name.as_str())),
                (
                    "stepFile",
                    Value::from(file_stem(&step.step_def.expression_source_file).as_str()),
                ),
            ]);
            let mut step_pairs = vec![
                ("exampleName", Value::from(queued.name.as_str())),
                ("ordinal", vint(ordinal)),
                ("stepText", Value::from(step.text.as_str())),
                (
                    "matchedExpression",
                    Value::from(step.step_def.expression.as_str()),
                ),
                ("contextKey", context_key),
                ("outcome", Value::from(step_outcome)),
            ];
            if step_outcome == "fail" {
                let failure = chosen.and_then(|o| o.error.as_ref());
                step_pairs.push(("failure", to_failure_artifact(failure, step.match_span)));
            }
            steps.push(obj(step_pairs));
        }

        trace_examples.push(obj(vec![
            ("name", Value::from(queued.name.as_str())),
            ("outcome", Value::from(outcome)),
            ("steps", Value::List(steps)),
        ]));
    }

    let trace = obj(vec![("examples", Value::List(trace_examples))]);

    BundleArtifacts {
        var_doc: to_var_doc_artifact(doc),
        registry: to_registry_artifact(registry),
        plan: to_plan_artifact(&execution),
        trace,
    }
}
