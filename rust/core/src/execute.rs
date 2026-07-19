//! The executor — port of `execute.ts` / `Execute.java`, on the full-replacement
//! state model. Handlers are invoked via boxed closures (no reflection); panics
//! are caught (the `AssertionError`/`Throwable` parity channel); `Future`
//! returns are driven by a small std `block_on`. State is a [`Value`], replaced
//! wholesale by each stimulus.

use crate::cell_diff::{CellDiff, compare_row, compare_table};
use crate::diagnostics::Diagnostic;
use crate::doc_string_diff::compare_doc_string;
use crate::error::{FailureLocation, HandlerError, StepError, StepFailure};
use crate::failure_anchor;
use crate::handler::{Handler, StepReturn};
use crate::offsets::{utf16_len, utf16_slice};
use crate::param_diff::compare_params_with_formats;
use crate::plan::{ExecutionPlan, PlannedExample, PlannedStep};
use crate::step_kind::StepKind;
use crate::value::Value;
use std::cell::Cell;
use std::collections::HashMap;
use std::future::Future;
use std::panic::AssertUnwindSafe;
use std::pin::Pin;
use std::sync::Once;
use std::task::{Context, Poll, Wake, Waker};

/// A step's outcome in the conformance trace.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StepOutcome {
    Pass,
    Fail,
    Skipped,
}

impl StepOutcome {
    /// The wire string (`"pass"`/`"fail"`/`"skipped"`).
    pub fn as_str(self) -> &'static str {
        match self {
            StepOutcome::Pass => "pass",
            StepOutcome::Fail => "fail",
            StepOutcome::Skipped => "skipped",
        }
    }
}

/// One executed step's outcome. `example_index` is 0-based; `ordinal` is 1-based.
#[derive(Clone, Debug, PartialEq)]
pub struct StepObservation {
    pub example_index: usize,
    pub ordinal: usize,
    pub outcome: StepOutcome,
    pub error: Option<StepFailure>,
}

/// The ports [`collect_examples`]/[`execute_plan`] need. `create_context` maps a
/// step-file to its fresh initial state (`None` → [`Value::Null`] per file);
/// `observer` is optional per-step instrumentation. The lifetime lets the port
/// closures borrow caller locals (e.g. a conformance observer's accumulator).
pub struct ExecutePorts<'a> {
    pub reporter: Reporter<'a>,
    pub create_context: Option<ContextFactory<'a>>,
    pub observer: Option<Observer<'a>>,
}

/// Receives every diagnostic collected during planning.
pub type Reporter<'a> = Box<dyn Fn(&Diagnostic) + 'a>;
/// Maps a step-file to its fresh initial state.
pub type ContextFactory<'a> = Box<dyn Fn(&str) -> Value + 'a>;
/// Per-step instrumentation (conformance trace mode).
pub type Observer<'a> = Box<dyn Fn(StepObservation) + 'a>;

impl<'a> ExecutePorts<'a> {
    /// Ports with just a reporter (no context factory, no observer).
    pub fn new(reporter: Box<dyn Fn(&Diagnostic) + 'a>) -> ExecutePorts<'a> {
        ExecutePorts {
            reporter,
            create_context: None,
            observer: None,
        }
    }
}

impl ExecutePorts<'static> {
    /// Ports that discard diagnostics and observe nothing.
    pub fn silent() -> ExecutePorts<'static> {
        ExecutePorts::new(Box::new(|_| {}))
    }
}

/// One runnable example: its name and a callback that runs its steps.
pub struct QueuedExample<'a> {
    pub name: String,
    run: Box<dyn Fn() -> Result<(), StepFailure> + 'a>,
}

impl QueuedExample<'_> {
    /// Runs the example's steps; `Err` on the first failure.
    pub fn run(&self) -> Result<(), StepFailure> {
        (self.run)()
    }
}

/// Reports every diagnostic in `plan`, then returns one [`QueuedExample`] per
/// planned example, in document order (each `run` is lazy). Port of `collectExamples`.
pub fn collect_examples<'a>(
    plan: &'a ExecutionPlan,
    ports: &'a ExecutePorts<'a>,
) -> Vec<QueuedExample<'a>> {
    for d in &plan.diagnostics {
        (ports.reporter)(d);
    }
    plan.examples
        .iter()
        .enumerate()
        .map(|(i, ex)| QueuedExample {
            name: ex.name.clone(),
            run: Box::new(move || run_example(plan, ex, i, ports)),
        })
        .collect()
}

/// Runs every example in `plan`, in order, stopping at the first failure. Port
/// of `executePlan`.
pub fn execute_plan<'a>(
    plan: &'a ExecutionPlan,
    ports: &'a ExecutePorts<'a>,
) -> Result<(), StepFailure> {
    for q in collect_examples(plan, ports) {
        q.run()?;
    }
    Ok(())
}

// -----------------------------------------------------------------------------
// One example
// -----------------------------------------------------------------------------

fn run_example(
    plan: &ExecutionPlan,
    ex: &PlannedExample,
    example_index: usize,
    ports: &ExecutePorts,
) -> Result<(), StepFailure> {
    let path = &plan.var_doc.path;
    let source = &plan.var_doc.source;
    let steps = &ex.steps;

    let mut state_by_file: HashMap<String, Value> = HashMap::new();
    let mut last_return: Option<Value> = None;
    let mut thrown: Option<StepFailure> = None;

    for (i, step) in steps.iter().enumerate() {
        let file = &step.step_def.expression_source_file;
        let state = match state_by_file.get(file) {
            Some(s) => s.clone(),
            None => {
                let created = create_context(ports, file);
                state_by_file.insert(file.clone(), created.clone());
                created
            }
        };

        // A trailing data table / doc string is the last handler argument.
        let mut call_args = step.args.clone();
        if let Some(table) = &step.data_table {
            call_args.push(table_rows(table));
        } else if let Some(fence) = &step.doc_string {
            call_args.push(Value::from(fence.body.as_str()));
        }

        let step_error: Option<StepError> =
            match invoke_resolve(&step.step_def.handler, state, call_args) {
                Err(he) => Some(StepError::Handler(he)),
                Ok(returned) => {
                    last_return = returned.clone();
                    match step.step_def.kind {
                        Some(StepKind::Stimulus) => {
                            state_by_file.insert(file.clone(), returned.unwrap_or(Value::Null));
                            None
                        }
                        Some(StepKind::Sensor) => {
                            // Header-bound rows are checked after the loop via row_checks.
                            if ex.row_checks.is_none() {
                                check_sensor_return(source, step, returned).err()
                            } else {
                                None
                            }
                        }
                        None => Some(StepError::ReturnShape("unknown step kind: null".to_string())),
                    }
                }
            };

        match step_error {
            None => observe(
                ports,
                StepObservation {
                    example_index,
                    ordinal: i + 1,
                    outcome: StepOutcome::Pass,
                    error: None,
                },
            ),
            Some(err) => {
                let failure = attach_location(err, step, path);
                observe(
                    ports,
                    StepObservation {
                        example_index,
                        ordinal: i + 1,
                        outcome: StepOutcome::Fail,
                        error: Some(failure.clone()),
                    },
                );
                thrown = Some(failure);
                break;
            }
        }
    }

    // Header-bound row checks (deferred to after the loop).
    if thrown.is_none() {
        if let Some(checks) = &ex.row_checks {
            if !checks.is_empty() {
                let bad: Vec<CellDiff> = compare_row(last_return.as_ref(), checks)
                    .into_iter()
                    .filter(|d| !d.ok)
                    .collect();
                if !bad.is_empty() {
                    let last_step = steps.last().unwrap();
                    let failure = attach_location(StepError::CellMismatch(bad), last_step, path);
                    observe(
                        ports,
                        StepObservation {
                            example_index,
                            ordinal: steps.len(),
                            outcome: StepOutcome::Fail,
                            error: Some(failure.clone()),
                        },
                    );
                    thrown = Some(failure);
                }
            }
        }
    }

    // Error-fence inversion.
    if ex.expected_outcome.as_deref() == Some("fail") {
        match thrown {
            None => {
                return Err(match steps.last() {
                    Some(last) => attach_location(StepError::UnexpectedPass, last, path),
                    None => StepFailure::bare(StepError::UnexpectedPass),
                });
            }
            Some(failure) => {
                if let Some(expected_msg) = &ex.expected_error_message {
                    if !failure.error.message().contains(expected_msg) {
                        return Err(failure);
                    }
                }
                return Ok(());
            }
        }
    }

    match thrown {
        Some(failure) => Err(failure),
        None => Ok(()),
    }
}

fn create_context(ports: &ExecutePorts, file: &str) -> Value {
    match &ports.create_context {
        Some(cc) => cc(file),
        None => Value::Null,
    }
}

fn observe(ports: &ExecutePorts, observation: StepObservation) {
    if let Some(observer) = &ports.observer {
        observer(observation);
    }
}

fn table_rows(table: &crate::ast::Table) -> Value {
    let row =
        |cells: &[String]| Value::List(cells.iter().map(|c| Value::from(c.as_str())).collect());
    let mut rows = vec![row(&table.header.cells)];
    for r in &table.rows {
        rows.push(row(&r.cells));
    }
    Value::List(rows)
}

fn attach_location(error: StepError, step: &PlannedStep, var_path: &str) -> StepFailure {
    let anchor = failure_anchor::anchor(&error, step.match_span);
    let label = truncate_label(&step.text);
    StepFailure {
        error,
        location: Some(FailureLocation {
            label,
            path: var_path.to_string(),
            line: anchor.start_line,
        }),
    }
}

fn truncate_label(text: &str) -> String {
    if utf16_len(text) > 60 {
        let truncated: String = text.chars().take(60).collect();
        format!("{truncated}…")
    } else {
        text.to_string()
    }
}

// -----------------------------------------------------------------------------
// Sensor return comparison
// -----------------------------------------------------------------------------

fn check_sensor_return(
    source: &str,
    step: &PlannedStep,
    returned: Option<Value>,
) -> Result<(), StepError> {
    let Some(returned) = returned else {
        return Ok(());
    };
    let extra_count = usize::from(step.data_table.is_some() || step.doc_string.is_some());
    let slot_count = step.args.len() + extra_count;
    if slot_count == 0 {
        return Err(StepError::ReturnShape(
            "this sensor has no parameters, data table or doc string — nothing to compare a return value against \
             (throw to fail, return nothing to pass)"
                .to_string(),
        ));
    }
    let slots: Vec<Value> = if slot_count == 1 {
        // The return IS the single slot's value, never read as a positional list.
        vec![returned]
    } else {
        match returned {
            Value::List(list) => {
                if list.len() != slot_count {
                    return Err(StepError::ReturnShape(format!(
                        "sensor return must have {} element(s), got {}",
                        slot_count,
                        list.len()
                    )));
                }
                list
            }
            other => {
                return Err(StepError::ReturnShape(format!(
                    "a sensor with {} parameters must return a List of {} values, got {}",
                    slot_count,
                    slot_count,
                    other.type_name()
                )));
            }
        }
    };

    let arg_count = step.args.len();
    if arg_count > 0 {
        let source_texts: Vec<String> = step
            .param_spans
            .iter()
            .map(|s| utf16_slice(source, s.start_offset, s.end_offset).to_string())
            .collect();
        let bad: Vec<CellDiff> = compare_params_with_formats(
            &slots[0..arg_count],
            &step.args,
            &step.param_spans,
            &source_texts,
            Some(&step.formats),
        )
        .into_iter()
        .filter(|d| !d.ok)
        .collect();
        if !bad.is_empty() {
            return Err(StepError::CellMismatch(bad));
        }
    }

    if let Some(table) = &step.data_table {
        let bad: Vec<CellDiff> = compare_table(Some(&slots[arg_count]), table)?
            .into_iter()
            .filter(|d| !d.ok)
            .collect();
        if !bad.is_empty() {
            return Err(StepError::CellMismatch(bad));
        }
    } else if let Some(fence) = &step.doc_string {
        if let Some(diff) =
            compare_doc_string(Some(&slots[arg_count]), &fence.body, fence.body_span)?
        {
            return Err(StepError::DocStringMismatch(diff));
        }
    }
    Ok(())
}

// -----------------------------------------------------------------------------
// Handler invocation (panic-catching + async resolution)
// -----------------------------------------------------------------------------

thread_local! {
    static SUPPRESS_PANIC: Cell<bool> = const { Cell::new(false) };
}

static HOOK: Once = Once::new();

/// Installs a panic hook (once) that suppresses the default stderr print for
/// panics the executor deliberately catches (a handler's assertion-style
/// failure), while leaving genuine test panics untouched on other threads.
///
/// DECLARED EXCEPTION to the "no globals in the core" rule (see `lib.rs`):
/// `catch_unwind` is the executor's assertion channel — the AssertionError
/// parity with Java — and the process-wide hook is the only way Rust offers to
/// keep a *caught* panic from spewing to stderr. It is `Once`-guarded, chains
/// the previous hook, and gates on a thread-local so it is inert outside
/// [`invoke_resolve`]; observable behaviour is otherwise unchanged.
fn install_hook() {
    HOOK.call_once(|| {
        let previous = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            if SUPPRESS_PANIC.with(Cell::get) {
                return;
            }
            previous(info);
        }));
    });
}

/// Invokes the handler and resolves any `Future`, catching a panic (the
/// assertion-style failure channel) into a [`HandlerError`].
fn invoke_resolve(
    handler: &Handler,
    state: Value,
    args: Vec<Value>,
) -> Result<Option<Value>, HandlerError> {
    install_hook();
    let caught = SUPPRESS_PANIC.with(|s| {
        s.set(true);
        let r = std::panic::catch_unwind(AssertUnwindSafe(|| match handler.call(state, args) {
            StepReturn::Ready(r) => r,
            StepReturn::Pending(fut) => block_on(fut),
        }));
        s.set(false);
        r
    });
    match caught {
        Ok(r) => r,
        Err(payload) => Err(HandlerError::from_panic(payload)),
    }
}

/// A minimal `block_on`: polls the future, parking the thread until its waker
/// unparks it. No dependencies, no unsafe.
fn block_on<T>(mut fut: Pin<Box<dyn Future<Output = T>>>) -> T {
    struct ThreadWaker(std::thread::Thread);
    impl Wake for ThreadWaker {
        fn wake(self: std::sync::Arc<Self>) {
            self.0.unpark();
        }
        fn wake_by_ref(self: &std::sync::Arc<Self>) {
            self.0.unpark();
        }
    }
    let waker = Waker::from(std::sync::Arc::new(ThreadWaker(std::thread::current())));
    let mut cx = Context::from_waker(&waker);
    loop {
        match fut.as_mut().poll(&mut cx) {
            Poll::Ready(v) => return v,
            Poll::Pending => std::thread::park(),
        }
    }
}
