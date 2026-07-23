import type { VarDoc } from './ast.ts'
import { type Diagnostic, driftDetected } from './diagnostics.ts'
import { hashSource } from './hash.ts'
import { deriveExampleName, type ExecutionPlan } from './plan.ts'
import type { BaselineStore } from './ports.ts'
import type { Span } from './span.ts'

// A baseline example is re-identified in the edited source by text: an exact
// name match, else the most word-similar paragraph at or above this threshold.
// So you may move a paragraph anywhere and reword up to ~half its words and Varar
// still recognizes it; edit it past this point and Varar treats it as a fresh
// paragraph (remove + add), not drift. Tune here — a single number, ported
// byte-identically to every language.
export const DRIFT_SIMILARITY_THRESHOLD = 0.5

// One example-producing paragraph, as recorded in the committed baseline.
// `name` is the paragraph's normalized primary text (identical to the planned
// example's name); `line` is the 1-based start line of its primary block. Both
// re-identify the example after edits: `name` for exact/similarity matching
// (survives moves), `line` only to break ties between equally-similar
// paragraphs (prefer the nearest).
export type BaselineExample = {
  readonly name: string
  readonly line: number
}

// The committed baseline for one spec file.
export type SpecBaseline = {
  readonly sourceHash: string
  readonly examples: ReadonlyArray<BaselineExample>
}

// The whole `varar.lock.json`: every spec keyed by its POSIX path relative to the
// project root.
export type VarLock = {
  readonly version: 1
  readonly specs: Readonly<Record<string, SpecBaseline>>
}

// A paragraph that the baseline says was an example and now matches zero steps.
// `line` anchors line-based reporting; `span` covers the paragraph for editor
// decorations and LSP diagnostics.
export type Drift = {
  readonly name: string
  readonly line: number
  readonly span: Span
}

// Do the two spans overlap at all (offset ranges intersect)? A candidate
// paragraph relates to its planned example either way round: a header-bound row
// sits *inside* its binding paragraph, while a merged example's span *covers*
// each of the candidates it absorbed (ADR 0012). Overlap catches both.
function overlaps(a: Span, b: Span): boolean {
  return a.startOffset < b.endOffset && b.startOffset < a.endOffset
}

// A candidate paragraph is "live" (still an example) if it overlaps at least one
// planned example. A now-prose paragraph — one whose step def was renamed or
// deleted — overlaps none (it became a delimiter, splitting any example it was
// part of), so drift catches it.
function isLive(candidateSpan: Span, plan: ExecutionPlan): boolean {
  return plan.examples.some((pe) => overlaps(pe.span, candidateSpan))
}

// Lower-cased word tokens (Unicode letters/digits) of a paragraph name. The
// unit of similarity — chosen because a word set is trivially portable across
// languages (no shared string-distance library needed).
function tokenize(text: string): ReadonlySet<string> {
  const set = new Set<string>()
  for (const m of text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) set.add(m[0])
  return set
}

// Jaccard overlap of two token sets: |A∩B| / |A∪B|. 1 when identical, 0 when
// disjoint. Two empty sets count as identical.
function similarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let intersection = 0
  for (const t of a) if (b.has(t)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

// The current example-producing paragraphs, in document order — what a clean
// run records as the new baseline for a spec.
export function liveExamples(varDoc: VarDoc, plan: ExecutionPlan): ReadonlyArray<BaselineExample> {
  const out: BaselineExample[] = []
  for (const candidate of varDoc.examples) {
    if (isLive(candidate.span, plan)) {
      out.push({ name: deriveExampleName(candidate.body), line: candidate.span.startLine })
    }
  }
  return out
}

// The full baseline record for a spec: its source fingerprint plus its live
// examples.
export function deriveSpecBaseline(
  source: string,
  varDoc: VarDoc,
  plan: ExecutionPlan,
): SpecBaseline {
  return { sourceHash: hashSource(source), examples: liveExamples(varDoc, plan) }
}

// Detect drift for one spec: paragraphs the baseline recorded as examples that
// now match zero steps. Pure — no `sourceHash` short-circuit, because a step
// definition can be renamed with the Markdown (and its hash) untouched.
//
// Each baseline example is re-identified in the current source by text: the
// most word-similar paragraph at or above DRIFT_SIMILARITY_THRESHOLD (an exact
// name scores 1). This is position-independent, so moving a paragraph never
// looks like drift, and rewording within the threshold keeps its identity.
//   matched & live → not drift · matched & dead → DRIFT · no match → remove+add
export function detectDrift(
  baseline: SpecBaseline | undefined,
  varDoc: VarDoc,
  plan: ExecutionPlan,
): ReadonlyArray<Drift> {
  if (!baseline) return [] // no baseline yet (first run) — nothing to compare
  const candidates = varDoc.examples
  const names = candidates.map((c) => deriveExampleName(c.body))
  const tokens = names.map(tokenize)
  const live = candidates.map((c) => isLive(c.span, plan))

  const drifts: Drift[] = []
  for (const b of baseline.examples) {
    const bTokens = tokenize(b.name)
    // Pick the most-similar candidate at/above the threshold; break ties toward
    // the paragraph nearest the baseline's recorded line.
    let bestIdx = -1
    let bestScore = 0
    for (let i = 0; i < candidates.length; i++) {
      const score = similarity(bTokens, tokens[i] as ReadonlySet<string>)
      if (score < DRIFT_SIMILARITY_THRESHOLD) continue
      const line = candidates[i]?.span.startLine ?? 0
      const bestLine = candidates[bestIdx]?.span.startLine ?? 0
      if (
        bestIdx < 0 ||
        score > bestScore ||
        (score === bestScore && Math.abs(line - b.line) < Math.abs(bestLine - b.line))
      ) {
        bestIdx = i
        bestScore = score
      }
    }
    if (bestIdx < 0) continue // no recognizable paragraph — a rewrite/removal, not drift
    const candidate = candidates[bestIdx]
    if (!candidate || live[bestIdx]) continue // still an example — not drift
    drifts.push({ name: b.name, line: candidate.span.startLine, span: candidate.span })
  }
  return drifts
}

// Project drifts onto the shared Diagnostic rail — the single way every surface
// (CLI exit, vitest/pytest test, LSP squiggle, browser editor) reports drift.
export function driftDiagnostics(drifts: ReadonlyArray<Drift>): ReadonlyArray<Diagnostic> {
  return drifts.map((d) => driftDetected({ name: d.name, span: d.span }))
}

// One spec's baseline reconciliation against a BaselineStore — the shared
// read → detect → write step every runner uses (browser and Node alike; only
// the store differs). Returns the drifts to report.
//   - `update` accepts all drift: re-record the baseline, report nothing.
//   - otherwise detect drift; rewrite the baseline only on a clean run, so an
//     unacknowledged drift keeps its old baseline entry (and stays red).
export async function reconcileDrift(opts: {
  readonly store: BaselineStore
  readonly specPath: string
  readonly source: string
  readonly varDoc: VarDoc
  readonly plan: ExecutionPlan
  readonly update?: boolean
}): Promise<ReadonlyArray<Drift>> {
  const text = await opts.store.read()
  const lock = text ? parseVarLock(text) : null
  const baseline = lock?.specs[opts.specPath]
  const drifts = opts.update ? [] : detectDrift(baseline, opts.varDoc, opts.plan)
  if (opts.update || drifts.length === 0) {
    const nextSpec = deriveSpecBaseline(opts.source, opts.varDoc, opts.plan)
    const nextLock: VarLock = {
      version: 1,
      specs: { ...(lock?.specs ?? {}), [opts.specPath]: nextSpec },
    }
    await opts.store.write(stringifyVarLock(nextLock))
  }
  return drifts
}

function isBaselineExample(v: unknown): v is BaselineExample {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  return typeof e.name === 'string' && typeof e.line === 'number'
}

function isSpecBaseline(v: unknown): v is SpecBaseline {
  if (typeof v !== 'object' || v === null) return false
  const b = v as Record<string, unknown>
  return (
    typeof b.sourceHash === 'string' &&
    Array.isArray(b.examples) &&
    b.examples.every(isBaselineExample)
  )
}

// Parse `varar.lock.json`. Returns null on malformed input (treated as "no
// baseline yet"), mirroring the LSP's tolerant result ingestion.
export function parseVarLock(text: string): VarLock | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const obj = parsed as Record<string, unknown>
  if (obj.version !== 1 || typeof obj.specs !== 'object' || obj.specs === null) return null
  const specs: Record<string, SpecBaseline> = {}
  for (const [path, value] of Object.entries(obj.specs as Record<string, unknown>)) {
    if (!isSpecBaseline(value)) return null
    specs[path] = value
  }
  return { version: 1, specs }
}

// Serialize a `varar.lock.json` deterministically: spec paths sorted, examples in
// document order, two-space indent, trailing newline. Byte-stable across runs
// so a clean re-run produces no git diff.
export function stringifyVarLock(lock: VarLock): string {
  const specs: Record<string, SpecBaseline> = {}
  for (const path of Object.keys(lock.specs).sort()) {
    const b = lock.specs[path]
    if (b) specs[path] = b
  }
  return `${JSON.stringify({ version: 1, specs }, null, 2)}\n`
}
