//! Pure human-readable rendering of a step failure, anchored to the `.md`.
//! Port of `varar_runner.render.render_failure`; reuses the core diff payloads.

use varar_core::error::StepFailure;

pub fn render_failure(failure: &StepFailure, _source: &str, path: &str) -> String {
    let error = &failure.error;
    if let Some(cells) = error.as_cell_mismatch() {
        let mut lines = vec![format!("Cell mismatch in {path}:")];
        let failing: Vec<_> = cells.iter().filter(|c| !c.ok).collect();
        if failing.is_empty() {
            lines.push("  (no failing cells)".to_string());
        }
        for cell in failing {
            lines.push(format!(
                "  line {} | column '{}' — expected: {:?}, actual: {:?}",
                cell.span.start_line, cell.column, cell.expected, cell.actual
            ));
        }
        return lines.join("\n");
    }
    error.message()
}
