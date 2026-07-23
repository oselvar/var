"""drift.py — port of typescript/packages/core/src/drift.ts.

Spec drift detection: a paragraph the committed varar.lock.json baseline recorded
as an example that now matches no step. Pure over the existing VarDoc +
ExecutionPlan, byte-identical to the TypeScript port so varar.lock.json is shared
across languages.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Protocol

from varar_core.ast import VarDoc
from varar_core.diagnostics import Diagnostic, drift_detected
from varar_core.hash import hash_source
from varar_core.plan import ExecutionPlan, derive_example_name
from varar_core.span import Span

# A baseline example is re-identified in the edited source by text: an exact
# name match, else the most word-similar paragraph at or above this threshold.
# So a paragraph may be moved anywhere and reworded up to ~half its words and
# still be recognized; edit it past this point and it reads as a fresh
# paragraph (remove + add), not drift. Tune here — ported byte-identically.
DRIFT_SIMILARITY_THRESHOLD = 0.5


@dataclass(frozen=True, slots=True)
class BaselineExample:
    """One example-producing paragraph, as recorded in the baseline."""

    name: str
    line: int


@dataclass(frozen=True, slots=True)
class SpecBaseline:
    """The committed baseline for one spec file."""

    source_hash: str
    examples: tuple[BaselineExample, ...]


@dataclass(frozen=True, slots=True)
class VarLock:
    """The whole varar.lock.json: every spec keyed by its POSIX path."""

    version: int  # always 1
    specs: dict[str, SpecBaseline]


@dataclass(frozen=True, slots=True)
class Drift:
    """A paragraph the baseline says was an example and now matches no step."""

    name: str
    line: int
    span: Span


class BaselineStore(Protocol):
    """Persistence port for varar.lock.json. The core owns the format; adapters
    move only raw text (a filesystem store on disk, an in-memory store)."""

    def read(self) -> str | None: ...

    def write(self, contents: str) -> None: ...


# Do the two spans overlap at all (offset ranges intersect)? A candidate
# paragraph relates to its planned example either way round: a header-bound row
# sits *inside* its binding paragraph, while a merged example's span *covers*
# each of the candidates it absorbed (ADR 0012). Overlap catches both.
def _overlaps(a: Span, b: Span) -> bool:
    return a.start_offset < b.end_offset and b.start_offset < a.end_offset


# A candidate paragraph is "live" (still an example) if it overlaps at least one
# planned example. A now-prose paragraph — one whose step def was renamed or
# deleted — overlaps none (it became a delimiter, splitting any example it was
# part of), so drift catches it.
def _is_live(candidate_span: Span, plan: ExecutionPlan) -> bool:
    return any(_overlaps(pe.span, candidate_span) for pe in plan.examples)


_TOKEN_RE = re.compile(r"[^\W_]+")


def _tokenize(text: str) -> frozenset[str]:
    """Lower-cased word tokens (letters/digits) — the unit of similarity."""
    return frozenset(_TOKEN_RE.findall(text.lower()))


def _similarity(a: frozenset[str], b: frozenset[str]) -> float:
    """Jaccard overlap |A∩B| / |A∪B|. 1 identical, 0 disjoint; two empty = 1."""
    if not a and not b:
        return 1.0
    intersection = len(a & b)
    union = len(a) + len(b) - intersection
    return 0.0 if union == 0 else intersection / union


def live_examples(var_doc: VarDoc, plan: ExecutionPlan) -> tuple[BaselineExample, ...]:
    """The current example-producing paragraphs, in document order."""
    out: list[BaselineExample] = []
    for candidate in var_doc.examples:
        if _is_live(candidate.span, plan):
            out.append(
                BaselineExample(
                    name=derive_example_name(candidate.body),
                    line=candidate.span.start_line,
                )
            )
    return tuple(out)


def derive_spec_baseline(source: str, var_doc: VarDoc, plan: ExecutionPlan) -> SpecBaseline:
    """The full baseline record for a spec: fingerprint plus live examples."""
    return SpecBaseline(source_hash=hash_source(source), examples=live_examples(var_doc, plan))


def detect_drift(
    baseline: SpecBaseline | None,
    var_doc: VarDoc,
    plan: ExecutionPlan,
) -> tuple[Drift, ...]:
    """Paragraphs the baseline recorded as examples that now match zero steps.

    Each is re-identified by the most word-similar current paragraph at/above
    DRIFT_SIMILARITY_THRESHOLD (an exact name scores 1; ties break toward the
    nearest line). No sourceHash short-circuit — a step rename leaves the hash
    untouched.
    """
    if baseline is None:
        return ()
    candidates = var_doc.examples
    tokens = [_tokenize(derive_example_name(c.body)) for c in candidates]
    live = [_is_live(c.span, plan) for c in candidates]

    drifts: list[Drift] = []
    for b in baseline.examples:
        b_tokens = _tokenize(b.name)
        best_idx = -1
        best_score = 0.0
        for i, candidate in enumerate(candidates):
            score = _similarity(b_tokens, tokens[i])
            if score < DRIFT_SIMILARITY_THRESHOLD:
                continue
            line = candidate.span.start_line
            best_line = candidates[best_idx].span.start_line if best_idx >= 0 else 0
            if (
                best_idx < 0
                or score > best_score
                or (score == best_score and abs(line - b.line) < abs(best_line - b.line))
            ):
                best_idx = i
                best_score = score
        if best_idx < 0:
            continue
        candidate = candidates[best_idx]
        if live[best_idx]:
            continue
        drifts.append(Drift(name=b.name, line=candidate.span.start_line, span=candidate.span))
    return tuple(drifts)


def drift_diagnostics(drifts: tuple[Drift, ...]) -> tuple[Diagnostic, ...]:
    """Project drifts onto the shared Diagnostic rail."""
    return tuple(drift_detected(d.name, d.span) for d in drifts)


def reconcile_drift(
    store: BaselineStore,
    spec_path: str,
    source: str,
    var_doc: VarDoc,
    plan: ExecutionPlan,
    update: bool = False,
) -> tuple[Drift, ...]:
    """One spec's baseline reconciliation against a BaselineStore.

    ``update`` accepts all drift (re-record, report nothing). Otherwise detect
    drift; rewrite the baseline only on a clean run so an unacknowledged drift
    keeps its old entry (and stays red).
    """
    text = store.read()
    lock = parse_var_lock(text) if text else None
    baseline = lock.specs.get(spec_path) if lock else None
    drifts = () if update else detect_drift(baseline, var_doc, plan)
    if update or len(drifts) == 0:
        next_spec = derive_spec_baseline(source, var_doc, plan)
        specs = dict(lock.specs) if lock else {}
        specs[spec_path] = next_spec
        store.write(stringify_var_lock(VarLock(version=1, specs=specs)))
    return drifts


def _parse_baseline_example(value: object) -> BaselineExample | None:
    if not isinstance(value, dict):
        return None
    name = value.get("name")
    line = value.get("line")
    # bool is an int subclass; reject it as a line number.
    if isinstance(name, str) and isinstance(line, int) and not isinstance(line, bool):
        return BaselineExample(name=name, line=line)
    return None


def _parse_spec_baseline(value: object) -> SpecBaseline | None:
    if not isinstance(value, dict):
        return None
    source_hash = value.get("sourceHash")
    examples_raw = value.get("examples")
    if not isinstance(source_hash, str) or not isinstance(examples_raw, list):
        return None
    examples: list[BaselineExample] = []
    for item in examples_raw:
        parsed = _parse_baseline_example(item)
        if parsed is None:
            return None
        examples.append(parsed)
    return SpecBaseline(source_hash=source_hash, examples=tuple(examples))


def parse_var_lock(text: str) -> VarLock | None:
    """Parse varar.lock.json; None on malformed input (treated as no baseline)."""
    try:
        parsed = json.loads(text)
    except (ValueError, TypeError):
        return None
    if not isinstance(parsed, dict) or parsed.get("version") != 1:
        return None
    specs_raw = parsed.get("specs")
    if not isinstance(specs_raw, dict):
        return None
    specs: dict[str, SpecBaseline] = {}
    for path, value in specs_raw.items():
        baseline = _parse_spec_baseline(value)
        if baseline is None:
            return None
        specs[path] = baseline
    return VarLock(version=1, specs=specs)


def stringify_var_lock(lock: VarLock) -> str:
    """Serialize varar.lock.json deterministically: spec paths sorted, examples in
    document order, two-space indent, trailing newline. Byte-identical to the
    TypeScript serializer (camelCase keys, non-ASCII kept raw)."""
    specs = {
        path: {
            "sourceHash": lock.specs[path].source_hash,
            "examples": [{"name": e.name, "line": e.line} for e in lock.specs[path].examples],
        }
        for path in sorted(lock.specs)
    }
    obj = {"version": 1, "specs": specs}
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"
