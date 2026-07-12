//! Table row/cell comparison — port of `cell-diff.ts` / `CellDiff.java`.
//! `Object` + `instanceof Map`/`List` duck-typing becomes matching on [`Value`].

use crate::ast::Table;
use crate::error::StepError;
use crate::span::Span;
use crate::value::Value;

/// The verdict for one checked column: expected vs actual, plus raw values and
/// whether a parameter-type `format` produced `actual` (inline-parameter path).
#[derive(Clone, Debug, PartialEq)]
pub struct CellDiff {
    pub column: String,
    pub span: Span,
    pub expected: String,
    pub actual: String,
    pub ok: bool,
    pub expected_value: Option<Value>,
    pub actual_value: Option<Value>,
    pub formatted: bool,
}

impl CellDiff {
    /// The five-component form (row/table paths): raw values `None`, not formatted.
    pub fn new(
        column: impl Into<String>,
        span: Span,
        expected: impl Into<String>,
        actual: impl Into<String>,
        ok: bool,
    ) -> CellDiff {
        CellDiff {
            column: column.into(),
            span,
            expected: expected.into(),
            actual: actual.into(),
            ok,
            expected_value: None,
            actual_value: None,
            formatted: false,
        }
    }
}

/// One checked column of one header-bound row.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RowCheck {
    pub column: String,
    pub value: String,
    pub span: Span,
}

impl RowCheck {
    pub fn new(column: impl Into<String>, value: impl Into<String>, span: Span) -> RowCheck {
        RowCheck {
            column: column.into(),
            value: value.into(),
            span,
        }
    }
}

/// Display rules 2–4 of the mismatch-rendering chain: a string as-is, anything
/// else a best-effort stringification.
pub fn render_cell_value(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Int(i) => i.to_string(),
        Value::Float(d) => format!("{d}"),
        Value::Bool(b) => b.to_string(),
        Value::Null => "null".to_string(),
        // Port-native fallback (deliberately outside conformance): a bundle that
        // pins an object-valued actual must give the parameter type a `format`.
        Value::List(_) | Value::Map(_) => format!("{value:?}"),
    }
}

/// Compares a row step's returned map against the row's cells. Only columns
/// present on `returned` are checked; a non-map/`None` return checks nothing.
pub fn compare_row(returned: Option<&Value>, checks: &[RowCheck]) -> Vec<CellDiff> {
    let Some(Value::Map(obj)) = returned else {
        return Vec::new();
    };
    let mut diffs = Vec::new();
    for check in checks {
        let Some(value) = obj.get(&check.column) else {
            continue;
        };
        let actual = render_cell_value(value);
        let ok = actual == check.value;
        diffs.push(CellDiff::new(
            check.column.clone(),
            check.span,
            check.value.clone(),
            actual,
            ok,
        ));
    }
    diffs
}

/// Compares a whole-table step's returned table against the input table. `None`
/// checks nothing; type/shape problems return [`StepError::ReturnShape`].
pub fn compare_table(returned: Option<&Value>, input: &Table) -> Result<Vec<CellDiff>, StepError> {
    let rows = match returned {
        None => return Ok(Vec::new()),
        Some(Value::List(rows)) => rows,
        Some(other) => {
            return Err(StepError::ReturnShape(format!(
                "expected a table (array of rows), got {}",
                other.type_name()
            )));
        }
    };
    let columns = &input.header.cells;
    let data_rows = &input.rows;
    if rows.len() != data_rows.len() {
        return Err(StepError::ReturnShape(format!(
            "expected {} row(s), got {}",
            data_rows.len(),
            rows.len()
        )));
    }
    let all_arrays = rows.iter().all(|r| matches!(r, Value::List(_)));
    let all_records = rows.iter().all(|r| matches!(r, Value::Map(_)));
    if !all_arrays && !all_records {
        return Err(StepError::ReturnShape(
            "table rows must be all arrays or all objects".to_string(),
        ));
    }

    let mut diffs = Vec::new();
    for (i, (data_row, ret)) in data_rows.iter().zip(rows).enumerate() {
        if all_arrays {
            if let Value::List(cells) = ret {
                if cells.len() != columns.len() {
                    return Err(StepError::ReturnShape(format!(
                        "row {}: expected {} column(s), got {}",
                        i,
                        columns.len(),
                        cells.len()
                    )));
                }
            }
        }
        for (j, column) in columns.iter().enumerate() {
            let actual_value: &Value = if all_arrays {
                let Value::List(cells) = ret else {
                    unreachable!()
                };
                &cells[j]
            } else {
                let Value::Map(rec) = ret else { unreachable!() };
                match rec.get(column) {
                    Some(v) => v,
                    None => {
                        return Err(StepError::ReturnShape(format!(
                            "row {i}: missing column \"{column}\""
                        )));
                    }
                }
            };
            let expected = data_row.cells.get(j).map_or("", |c| c.as_str());
            let actual = render_cell_value(actual_value);
            let span = data_row.cell_spans.get(j).copied().unwrap_or(data_row.span);
            let ok = actual == expected;
            diffs.push(CellDiff::new(column.clone(), span, expected, actual, ok));
        }
    }
    Ok(diffs)
}
