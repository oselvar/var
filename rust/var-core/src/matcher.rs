//! Matches a sentence against a registry's compiled expressions — port of
//! `matcher.ts` / `Matcher.java`. Unanchored substring scan per step, then
//! greedy left-to-right non-overlap resolution. All returned offsets are UTF-16
//! (regex byte offsets converted at [`Hit`] construction).

use crate::offsets::utf16_index;
use crate::registry::{FormatFn, Registry, StepRegistration};
use crate::value::Value;
use regex::Regex;
use std::rc::Rc;

/// UTF-16 start/end of one captured parameter within the sentence.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ParamSpan {
    pub start: usize,
    pub end: usize,
}

/// One successful expression match inside a sentence. `formats` aligns 1:1 with
/// `args` (`None` where the parameter type has no formatter).
#[derive(Clone)]
pub struct Hit {
    pub expression: String,
    pub step_def: Rc<StepRegistration>,
    pub match_start: usize,
    pub match_end: usize,
    pub args: Vec<Value>,
    pub param_spans: Vec<ParamSpan>,
    pub formats: Vec<Option<FormatFn>>,
}

/// Two or more hits that start at the same position with equal length.
#[derive(Clone)]
pub struct AmbiguityCollision {
    pub match_start: usize,
    pub match_end: usize,
    pub candidates: Vec<Hit>,
}

/// The tagged result of [`resolve_hits`].
pub enum ResolvedSteps {
    /// The greedy, left-to-right, non-overlapping selection.
    Ok(Vec<Hit>),
    /// Every same-start/same-length tie that blocked selection.
    Ambiguous(Vec<AmbiguityCollision>),
}

/// Every expression match found anywhere in `sentence`, one unanchored scan per
/// registered step, in registration order. Port of `findHits`. Regex byte offsets
/// are converted to UTF-16 at [`Hit`] construction.
pub fn find_hits(sentence: &str, registry: &Registry) -> Vec<Hit> {
    let mut hits = Vec::new();
    for step in &registry.steps {
        let Ok(unanchored) = Regex::new(&strip_anchors(step.compiled.regexp_source())) else {
            continue;
        };
        for m in unanchored.find_iter(sentence) {
            let matched_text = &sentence[m.start()..m.end()];
            let arguments = step.compiled.match_whole(matched_text).unwrap_or_default();

            let mut args = Vec::with_capacity(arguments.len());
            let mut param_spans = Vec::new();
            let mut formats = Vec::with_capacity(arguments.len());
            for arg in arguments {
                formats.push(registry.formats.get(&arg.parameter_type_name).cloned());
                if let Some((gs, ge)) = arg.group {
                    param_spans.push(ParamSpan {
                        start: utf16_index(sentence, m.start() + gs),
                        end: utf16_index(sentence, m.start() + ge),
                    });
                }
                args.push(arg.value);
            }

            hits.push(Hit {
                expression: step.expression.clone(),
                step_def: step.clone(),
                match_start: utf16_index(sentence, m.start()),
                match_end: utf16_index(sentence, m.end()),
                args,
                param_spans,
                formats,
            });
        }
    }
    hits
}

/// Strips a compiled expression's `^...$` anchors so an unanchored scan can find
/// it anywhere in the sentence.
fn strip_anchors(source: &str) -> String {
    let s = source.strip_prefix('^').unwrap_or(source);
    let s = s.strip_suffix('$').unwrap_or(s);
    s.to_string()
}

/// Selects the greedy, left-to-right, non-overlapping subset of `hits`, or
/// reports every same-start/same-length ambiguity. Port of `resolveHits`.
pub fn resolve_hits(hits: Vec<Hit>) -> ResolvedSteps {
    if hits.is_empty() {
        return ResolvedSteps::Ok(Vec::new());
    }
    let mut sorted = hits;
    // Sort by matchStart ascending, then by length descending (stable).
    sorted.sort_by(|a, b| {
        a.match_start
            .cmp(&b.match_start)
            .then_with(|| (b.match_end - b.match_start).cmp(&(a.match_end - a.match_start)))
    });

    let mut collisions = Vec::new();
    let mut i = 0;
    while i < sorted.len() {
        let here_start = sorted[i].match_start;
        let here_len = sorted[i].match_end - sorted[i].match_start;
        let mut j = i + 1;
        while j < sorted.len()
            && sorted[j].match_start == here_start
            && sorted[j].match_end - sorted[j].match_start == here_len
        {
            j += 1;
        }
        if j - i > 1 {
            collisions.push(AmbiguityCollision {
                match_start: here_start,
                match_end: sorted[i].match_end,
                candidates: sorted[i..j].to_vec(),
            });
        }
        i = j;
    }
    if !collisions.is_empty() {
        return ResolvedSteps::Ambiguous(collisions);
    }

    let mut steps = Vec::new();
    let mut cursor: isize = -1;
    for hit in sorted {
        if (hit.match_start as isize) < cursor {
            continue;
        }
        cursor = hit.match_end as isize;
        steps.push(hit);
    }
    ResolvedSteps::Ok(steps)
}
