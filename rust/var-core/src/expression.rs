//! Cucumber-expression matching — the owned layer over the `cucumber-expressions`
//! crate's grammar parser. Replaces `io.cucumber.cucumberexpressions`. We take the
//! crate's AST parser (the escape-rule-dense part) and own the small, corpus-pinned
//! rest: regex generation with one named group per parameter, built-in + custom
//! parameter types, argument extraction, and `parameter_type_names`.

use crate::value::Value;
use cucumber_expressions::Expression;
use cucumber_expressions::ast::SingleExpression;
use regex::Regex;
use std::rc::Rc;

/// A parameter-type transform: maps the matched capture group(s) to a value.
pub type ParseFn = Rc<dyn Fn(&[&str]) -> Value>;

/// One captured argument of a whole-string match.
#[derive(Clone, Debug, PartialEq)]
pub struct Argument {
    /// The transformed value.
    pub value: Value,
    /// The parameter-type name (the `formats` lookup key).
    pub parameter_type_name: String,
    /// The captured group's byte offsets within the matched text (`None` if the
    /// group did not participate).
    pub group: Option<(usize, usize)>,
}

/// Registry of parameter types (built-ins + author-defined custom types).
#[derive(Clone)]
pub struct ParameterTypeRegistry {
    types: Vec<ParameterTypeDef>,
}

#[derive(Clone)]
struct ParameterTypeDef {
    name: String,
    regexp_source: String,
    transform: Transform,
}

#[derive(Clone)]
enum Transform {
    Int,
    Word,
    QuotedString,
    Custom(ParseFn),
}

// Built-in regexps, mirroring cucumber-expressions 20.0.0 (via the crate's own
// expansion). Each is wrapped in one named group per parameter at compile time.
const INT_RE: &str = r"(?:-?\d+)|(?:\d+)";
const WORD_RE: &str = r"[^\s]+";
const STRING_RE: &str = r#""[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'"#;

impl ParameterTypeRegistry {
    /// A fresh registry with the built-in `{int}`, `{word}`, `{string}` types.
    pub fn new() -> ParameterTypeRegistry {
        ParameterTypeRegistry {
            types: vec![
                ParameterTypeDef {
                    name: "int".to_string(),
                    regexp_source: INT_RE.to_string(),
                    transform: Transform::Int,
                },
                ParameterTypeDef {
                    name: "word".to_string(),
                    regexp_source: WORD_RE.to_string(),
                    transform: Transform::Word,
                },
                ParameterTypeDef {
                    name: "string".to_string(),
                    regexp_source: STRING_RE.to_string(),
                    transform: Transform::QuotedString,
                },
            ],
        }
    }

    /// Registers a custom parameter type `name` with a bare regexp source and a
    /// transform.
    pub fn define(&mut self, name: &str, regexp_source: &str, parse: ParseFn) {
        self.types.push(ParameterTypeDef {
            name: name.to_string(),
            regexp_source: regexp_source.to_string(),
            transform: Transform::Custom(parse),
        });
    }

    fn lookup(&self, name: &str) -> Option<&ParameterTypeDef> {
        self.types.iter().find(|t| t.name == name)
    }
}

impl Default for ParameterTypeRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// An expression failed to compile.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExpressionError {
    pub message: String,
}

/// A compiled cucumber expression.
#[derive(Clone)]
pub struct CompiledExpression {
    source: String,
    regexp_source: String,
    anchored: Regex,
    params: Vec<ParamRef>,
}

#[derive(Clone)]
struct ParamRef {
    group_name: String,
    type_name: String,
    transform: Transform,
}

impl CompiledExpression {
    /// Compiles `source` against `types`. Errors on an undefined parameter type
    /// or an un-compilable pattern.
    pub fn compile(
        source: &str,
        types: &ParameterTypeRegistry,
    ) -> Result<CompiledExpression, ExpressionError> {
        let parsed = Expression::parse(source).map_err(|e| ExpressionError {
            message: format!("failed to parse cucumber expression: {e}"),
        })?;

        let mut regex_str = String::from("^");
        let mut params = Vec::new();
        for se in &parsed.0 {
            match se {
                SingleExpression::Text(input) => regex_str.push_str(&escape_text(input.fragment())),
                SingleExpression::Whitespaces(input) => {
                    regex_str.push_str(&regex::escape(input.fragment()))
                }
                SingleExpression::Parameter(p) => {
                    let name = *p.input.fragment();
                    let def = types.lookup(name).ok_or_else(|| ExpressionError {
                        message: format!("Undefined parameter type {{{name}}}"),
                    })?;
                    let group = format!("__p{}", params.len());
                    regex_str.push_str(&format!("(?P<{group}>{})", def.regexp_source));
                    params.push(ParamRef {
                        group_name: group,
                        type_name: name.to_string(),
                        transform: def.transform.clone(),
                    });
                }
                SingleExpression::Optional(opt) => {
                    regex_str.push_str("(?:");
                    regex_str.push_str(&escape_text(opt.0.fragment()));
                    regex_str.push_str(")?");
                }
                SingleExpression::Alternation(alt) => regex_str.push_str(&alternation_regex(alt)),
            }
        }
        regex_str.push('$');

        let anchored = Regex::new(&regex_str).map_err(|e| ExpressionError {
            message: format!("failed to compile expression regex: {e}"),
        })?;
        Ok(CompiledExpression {
            source: source.to_string(),
            regexp_source: regex_str,
            anchored,
            params,
        })
    }

    /// The original expression text.
    pub fn source(&self) -> &str {
        &self.source
    }

    /// The anchored regex source (`^...$`), what the matcher strips to scan.
    pub fn regexp_source(&self) -> &str {
        &self.regexp_source
    }

    /// Matches the *entire* `text`, returning the typed arguments. `None` when
    /// `text` is not a whole match.
    pub fn match_whole(&self, text: &str) -> Option<Vec<Argument>> {
        let caps = self.anchored.captures(text)?;
        let mut args = Vec::with_capacity(self.params.len());
        for p in &self.params {
            match caps.name(&p.group_name) {
                Some(m) => args.push(Argument {
                    value: apply_transform(&p.transform, m.as_str()),
                    parameter_type_name: p.type_name.clone(),
                    group: Some((m.start(), m.end())),
                }),
                None => args.push(Argument {
                    value: Value::Null,
                    parameter_type_name: p.type_name.clone(),
                    group: None,
                }),
            }
        }
        Some(args)
    }
}

fn apply_transform(transform: &Transform, text: &str) -> Value {
    match transform {
        Transform::Int => text.parse::<i64>().map_or(Value::Null, Value::Int),
        Transform::Word => Value::String(text.to_string()),
        Transform::QuotedString => Value::String(dequote(text)),
        Transform::Custom(f) => f(&[text]),
    }
}

/// Strips a `{string}` token's surrounding quotes and unescapes `\X` → `X`.
fn dequote(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() < 2 {
        return s.to_string();
    }
    let inner = &chars[1..chars.len() - 1];
    let mut out = String::new();
    let mut i = 0;
    while i < inner.len() {
        if inner[i] == '\\' && i + 1 < inner.len() {
            out.push(inner[i + 1]);
            i += 2;
        } else {
            out.push(inner[i]);
            i += 1;
        }
    }
    out
}

/// Unescapes cucumber `\X` sequences in expression text, then regex-escapes so the
/// literal text matches verbatim.
fn escape_text(raw: &str) -> String {
    let mut unescaped = String::new();
    let mut chars = raw.chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            if let Some(n) = chars.next() {
                unescaped.push(n);
            }
        } else {
            unescaped.push(c);
        }
    }
    regex::escape(&unescaped)
}

fn alternation_regex(
    alt: &cucumber_expressions::ast::Alternation<cucumber_expressions::ast::Spanned<'_>>,
) -> String {
    use cucumber_expressions::ast::Alternative;
    let mut branches = Vec::new();
    for single in alt.0.iter() {
        let mut branch = String::new();
        for alternative in single {
            match alternative {
                Alternative::Text(t) => branch.push_str(&escape_text(t.fragment())),
                Alternative::Optional(o) => {
                    branch.push_str("(?:");
                    branch.push_str(&escape_text(o.0.fragment()));
                    branch.push_str(")?");
                }
            }
        }
        branches.push(branch);
    }
    format!("(?:{})", branches.join("|"))
}

/// Parameter-type names in source order, read from the parsed AST (escaped
/// braces `\{...\}` are literal text, not parameters).
pub fn parameter_type_names(source: &str) -> Vec<String> {
    let Ok(parsed) = Expression::parse(source) else {
        return Vec::new();
    };
    parsed
        .0
        .iter()
        .filter_map(|se| match se {
            SingleExpression::Parameter(p) => Some((*p.input.fragment()).to_string()),
            _ => None,
        })
        .collect()
}
