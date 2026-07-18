//! Planning and running examples, plus the adapter display-name rule.

use std::collections::HashMap;
use varar_core::error::StepFailure;
use varar_core::execute::{ExecutePorts, collect_examples};
use varar_core::parse::parse;
use varar_core::plan::{ExecutionPlan, plan};
use varar_core::registry::Registry;
use varar_core::value::Value;

/// Parse + plan one spec.
pub fn plan_spec(name: &str, source: &str, registry: &Registry) -> ExecutionPlan {
    plan(&parse(name, source), registry)
}

/// The per-example display names: the innermost heading (or the body-derived
/// name when there is no heading), de-duplicated with a `[n]` suffix — the rule
/// the pytest/unittest adapters use, so header-bound rows share their binding
/// sentence's name.
pub fn example_names(plan: &ExecutionPlan) -> Vec<String> {
    let mut seen: HashMap<String, usize> = HashMap::new();
    plan.examples
        .iter()
        .map(|ex| {
            let base = ex
                .scope_stack
                .last()
                .cloned()
                .unwrap_or_else(|| ex.name.clone());
            let idx = *seen.get(&base).unwrap_or(&0);
            seen.insert(base.clone(), idx + 1);
            if idx == 0 {
                base
            } else {
                format!("{base}[{idx}]")
            }
        })
        .collect()
}

/// Run a single example by index. `context_factory` maps a step file to its
/// fresh initial state.
pub fn run_example(
    plan: &ExecutionPlan,
    context_factory: &dyn Fn(&str) -> Value,
    index: usize,
) -> Result<(), StepFailure> {
    let ports = ExecutePorts {
        reporter: Box::new(|_| {}),
        create_context: Some(Box::new(|file: &str| context_factory(file))),
        observer: None,
    };
    collect_examples(plan, &ports)[index].run()
}
