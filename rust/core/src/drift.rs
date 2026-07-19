//! Spec drift detection — port of `drift.ts` / `Drift.java`. A paragraph the
//! committed `varar.lock.json` baseline recorded as an example that now matches no
//! step. Byte-identical to the other ports (FNV-1a fingerprint, insertion-ordered
//! lockfile serializer, Jaccard word-similarity re-identification).

use crate::ast::VarDoc;
use crate::hash::hash_source;
use crate::plan::{ExecutionPlan, derive_example_name};
use crate::span::Span;
use crate::value::Value;
use regex::Regex;
use std::collections::{BTreeMap, HashSet};
use std::sync::LazyLock;

/// The word-similarity threshold for re-identifying a moved/reworded example.
pub const SIMILARITY_THRESHOLD: f64 = 0.5;

/// One example-producing paragraph, as recorded in the baseline.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BaselineExample {
    pub name: String,
    pub line: usize,
}

/// The committed baseline for one spec file.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpecBaseline {
    pub source_hash: String,
    pub examples: Vec<BaselineExample>,
}

/// The whole `varar.lock.json`: every spec keyed by its POSIX path.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VarLock {
    pub version: u32,
    pub specs: BTreeMap<String, SpecBaseline>,
}

/// A paragraph the baseline says was an example and now matches no step.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Drifted {
    pub name: String,
    pub line: usize,
    pub span: Span,
}

/// Persistence port for `varar.lock.json`. The core owns the format; adapters move
/// only raw text.
pub trait BaselineStore {
    /// The whole lockfile's contents, or `None` when there is no baseline yet.
    fn read(&self) -> Option<String>;

    fn write(&mut self, contents: &str);
}

static TOKEN_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[\p{L}\p{N}]+").unwrap());

fn within(inner: Span, outer: Span) -> bool {
    inner.start_offset >= outer.start_offset && inner.end_offset <= outer.end_offset
}

fn is_live(candidate_span: Span, plan: &ExecutionPlan) -> bool {
    plan.examples
        .iter()
        .any(|pe| within(pe.span, candidate_span))
}

fn tokenize(text: &str) -> HashSet<String> {
    TOKEN_RE
        .find_iter(&text.to_lowercase())
        .map(|m| m.as_str().to_string())
        .collect()
}

fn similarity(a: &HashSet<String>, b: &HashSet<String>) -> f64 {
    if a.is_empty() && b.is_empty() {
        return 1.0;
    }
    let intersection = a.iter().filter(|t| b.contains(*t)).count();
    let union = a.len() + b.len() - intersection;
    if union == 0 {
        0.0
    } else {
        intersection as f64 / union as f64
    }
}

/// The current example-producing paragraphs, in document order.
pub fn live_examples(var_doc: &VarDoc, plan: &ExecutionPlan) -> Vec<BaselineExample> {
    var_doc
        .examples
        .iter()
        .filter(|c| is_live(c.span, plan))
        .map(|c| BaselineExample {
            name: derive_example_name(&c.body),
            line: c.span.start_line,
        })
        .collect()
}

/// The full baseline record for a spec: fingerprint plus live examples.
pub fn derive_spec_baseline(source: &str, var_doc: &VarDoc, plan: &ExecutionPlan) -> SpecBaseline {
    SpecBaseline {
        source_hash: hash_source(source),
        examples: live_examples(var_doc, plan),
    }
}

/// Paragraphs the baseline recorded as examples that now match zero steps.
pub fn detect_drift(
    baseline: Option<&SpecBaseline>,
    var_doc: &VarDoc,
    plan: &ExecutionPlan,
) -> Vec<Drifted> {
    let Some(baseline) = baseline else {
        return Vec::new();
    };
    let candidates = &var_doc.examples;
    let n = candidates.len();
    let tokens: Vec<HashSet<String>> = candidates
        .iter()
        .map(|c| tokenize(&derive_example_name(&c.body)))
        .collect();
    let live: Vec<bool> = candidates.iter().map(|c| is_live(c.span, plan)).collect();

    let mut drifts = Vec::new();
    for b in &baseline.examples {
        let b_tokens = tokenize(&b.name);
        let mut best_idx: Option<usize> = None;
        let mut best_score = 0.0f64;
        for i in 0..n {
            let score = similarity(&b_tokens, &tokens[i]);
            if score < SIMILARITY_THRESHOLD {
                continue;
            }
            let line = candidates[i].span.start_line as isize;
            let best_line = best_idx.map_or(0, |bi| candidates[bi].span.start_line as isize);
            let b_line = b.line as isize;
            if best_idx.is_none()
                || score > best_score
                || (score == best_score && (line - b_line).abs() < (best_line - b_line).abs())
            {
                best_idx = Some(i);
                best_score = score;
            }
        }
        if let Some(bi) = best_idx {
            if !live[bi] {
                let cand = &candidates[bi];
                drifts.push(Drifted {
                    name: b.name.clone(),
                    line: cand.span.start_line,
                    span: cand.span,
                });
            }
        }
    }
    drifts
}

/// The human-readable message for a drift.
pub fn message(drifted: &Drifted) -> String {
    format!(
        "This paragraph was an example and no longer matches any step (drift): \"{}\".\nFix the step so it matches again, or accept it as prose (run in update mode).",
        drifted.name
    )
}

/// One spec's baseline reconciliation against a [`BaselineStore`]. `update`
/// accepts all drift; otherwise detect drift and rewrite the baseline only on a
/// clean run.
pub fn reconcile_drift(
    store: &mut dyn BaselineStore,
    spec_path: &str,
    source: &str,
    var_doc: &VarDoc,
    plan: &ExecutionPlan,
    update: bool,
) -> Vec<Drifted> {
    let lock = store.read().as_deref().and_then(parse_var_lock);
    let drifts = if update {
        Vec::new()
    } else {
        detect_drift(lock.as_ref().and_then(|l| l.specs.get(spec_path)), var_doc, plan)
    };
    if update || drifts.is_empty() {
        let next = derive_spec_baseline(source, var_doc, plan);
        let mut specs = lock.map_or_else(BTreeMap::new, |l| l.specs);
        specs.insert(spec_path.to_string(), next);
        store.write(&stringify_var_lock(&VarLock { version: 1, specs }));
    }
    drifts
}

/// Serializes `varar.lock.json` deterministically (fixed field order, sorted spec
/// paths, two-space indent, trailing newline) — NOT [`crate::canonical_json`].
pub fn stringify_var_lock(lock: &VarLock) -> String {
    let mut sb = String::new();
    sb.push_str("{\n  \"version\": 1,\n  \"specs\": ");
    if lock.specs.is_empty() {
        sb.push_str("{}");
    } else {
        sb.push_str("{\n");
        let n = lock.specs.len();
        // `BTreeMap` iterates spec paths in sorted order.
        for (p, (path, baseline)) in lock.specs.iter().enumerate() {
            sb.push_str("    ");
            write_json_string(&mut sb, path);
            sb.push_str(": {\n      \"sourceHash\": ");
            write_json_string(&mut sb, &baseline.source_hash);
            sb.push_str(",\n      \"examples\": ");
            if baseline.examples.is_empty() {
                sb.push_str("[]");
            } else {
                sb.push_str("[\n");
                let en = baseline.examples.len();
                for (e, ex) in baseline.examples.iter().enumerate() {
                    sb.push_str("        {\n          \"name\": ");
                    write_json_string(&mut sb, &ex.name);
                    sb.push_str(",\n          \"line\": ");
                    sb.push_str(&ex.line.to_string());
                    sb.push_str("\n        }");
                    if e + 1 < en {
                        sb.push(',');
                    }
                    sb.push('\n');
                }
                sb.push_str("      ]");
            }
            sb.push_str("\n    }");
            if p + 1 < n {
                sb.push(',');
            }
            sb.push('\n');
        }
        sb.push_str("  }");
    }
    sb.push_str("\n}\n");
    sb
}

fn write_json_string(sb: &mut String, s: &str) {
    use std::fmt::Write;
    sb.push('"');
    for c in s.chars() {
        match c {
            '"' => sb.push_str("\\\""),
            '\\' => sb.push_str("\\\\"),
            '\n' => sb.push_str("\\n"),
            '\r' => sb.push_str("\\r"),
            '\t' => sb.push_str("\\t"),
            '\u{0008}' => sb.push_str("\\b"),
            '\u{000c}' => sb.push_str("\\f"),
            c if (c as u32) < 0x20 => {
                let _ = write!(sb, "\\u{:04x}", c as u32);
            }
            c => sb.push(c),
        }
    }
    sb.push('"');
}

/// Parses `varar.lock.json`; `None` on malformed input (treated as no baseline).
pub fn parse_var_lock(text: &str) -> Option<VarLock> {
    let parsed = JsonReader::new(text).parse_whole()?;
    let Value::Map(obj) = parsed else { return None };
    if !matches!(obj.get("version"), Some(Value::Int(1))) {
        return None;
    }
    let Some(Value::Map(specs_raw)) = obj.get("specs") else {
        return None;
    };
    let mut specs = BTreeMap::new();
    for (k, v) in specs_raw {
        specs.insert(k.clone(), parse_spec_baseline(v)?);
    }
    Some(VarLock { version: 1, specs })
}

fn parse_spec_baseline(value: &Value) -> Option<SpecBaseline> {
    let Value::Map(map) = value else { return None };
    let Some(Value::String(source_hash)) = map.get("sourceHash") else {
        return None;
    };
    let Some(Value::List(examples_raw)) = map.get("examples") else {
        return None;
    };
    let mut examples = Vec::new();
    for item in examples_raw {
        let Value::Map(e) = item else { return None };
        let Some(Value::String(name)) = e.get("name") else {
            return None;
        };
        let Some(Value::Int(line)) = e.get("line") else {
            return None;
        };
        examples.push(BaselineExample {
            name: name.clone(),
            line: *line as usize,
        });
    }
    Some(SpecBaseline {
        source_hash: source_hash.clone(),
        examples,
    })
}

/// A tiny recursive-descent JSON reader — enough for `varar.lock.json`, returning
/// `None` on malformed input (Java's caught-exception → null).
struct JsonReader {
    chars: Vec<char>,
    i: usize,
}

impl JsonReader {
    fn new(text: &str) -> JsonReader {
        JsonReader {
            chars: text.chars().collect(),
            i: 0,
        }
    }

    fn parse_whole(&mut self) -> Option<Value> {
        let v = self.value()?;
        self.skip_ws();
        if self.i != self.chars.len() {
            return None;
        }
        Some(v)
    }

    fn value(&mut self) -> Option<Value> {
        self.skip_ws();
        match self.peek()? {
            '{' => self.object(),
            '[' => self.array(),
            '"' => self.string().map(Value::String),
            't' | 'f' => self.boolean(),
            'n' => self.null(),
            _ => self.number(),
        }
    }

    fn object(&mut self) -> Option<Value> {
        self.expect('{')?;
        let mut map = BTreeMap::new();
        self.skip_ws();
        if self.peek()? == '}' {
            self.i += 1;
            return Some(Value::Map(map));
        }
        loop {
            self.skip_ws();
            let key = self.string()?;
            self.skip_ws();
            self.expect(':')?;
            map.insert(key, self.value()?);
            self.skip_ws();
            match self.next()? {
                '}' => return Some(Value::Map(map)),
                ',' => {}
                _ => return None,
            }
        }
    }

    fn array(&mut self) -> Option<Value> {
        self.expect('[')?;
        let mut list = Vec::new();
        self.skip_ws();
        if self.peek()? == ']' {
            self.i += 1;
            return Some(Value::List(list));
        }
        loop {
            list.push(self.value()?);
            self.skip_ws();
            match self.next()? {
                ']' => return Some(Value::List(list)),
                ',' => {}
                _ => return None,
            }
        }
    }

    fn string(&mut self) -> Option<String> {
        self.expect('"')?;
        let mut out = String::new();
        loop {
            match self.next()? {
                '"' => return Some(out),
                '\\' => match self.next()? {
                    '"' => out.push('"'),
                    '\\' => out.push('\\'),
                    '/' => out.push('/'),
                    'n' => out.push('\n'),
                    'r' => out.push('\r'),
                    't' => out.push('\t'),
                    'b' => out.push('\u{0008}'),
                    'f' => out.push('\u{000c}'),
                    'u' => {
                        let code = self.hex4()?;
                        out.push(char::from_u32(code)?);
                    }
                    _ => return None,
                },
                c => out.push(c),
            }
        }
    }

    fn hex4(&mut self) -> Option<u32> {
        if self.i + 4 > self.chars.len() {
            return None;
        }
        let slice: String = self.chars[self.i..self.i + 4].iter().collect();
        self.i += 4;
        u32::from_str_radix(&slice, 16).ok()
    }

    fn number(&mut self) -> Option<Value> {
        let start = self.i;
        while self.i < self.chars.len() && "-+.eE0123456789".contains(self.chars[self.i]) {
            self.i += 1;
        }
        if self.i == start {
            return None;
        }
        let num: String = self.chars[start..self.i].iter().collect();
        if num.contains(['.', 'e', 'E']) {
            num.parse::<f64>().ok().map(Value::Float)
        } else {
            num.parse::<i64>().ok().map(Value::Int)
        }
    }

    fn boolean(&mut self) -> Option<Value> {
        if self.starts_with("true") {
            self.i += 4;
            Some(Value::Bool(true))
        } else if self.starts_with("false") {
            self.i += 5;
            Some(Value::Bool(false))
        } else {
            None
        }
    }

    fn null(&mut self) -> Option<Value> {
        if self.starts_with("null") {
            self.i += 4;
            Some(Value::Null)
        } else {
            None
        }
    }

    fn starts_with(&self, lit: &str) -> bool {
        let lit: Vec<char> = lit.chars().collect();
        self.i + lit.len() <= self.chars.len() && self.chars[self.i..self.i + lit.len()] == lit[..]
    }

    fn skip_ws(&mut self) {
        while self.i < self.chars.len() && matches!(self.chars[self.i], ' ' | '\n' | '\r' | '\t') {
            self.i += 1;
        }
    }

    fn peek(&self) -> Option<char> {
        self.chars.get(self.i).copied()
    }

    fn next(&mut self) -> Option<char> {
        let c = self.chars.get(self.i).copied()?;
        self.i += 1;
        Some(c)
    }

    fn expect(&mut self, c: char) -> Option<()> {
        if self.next()? == c { Some(()) } else { None }
    }
}
