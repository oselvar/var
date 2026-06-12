import type { Bdd, Block, Fence, InlineOffset, Table } from './ast.js'
import { type Diagnostic, ambiguousMatch, orphanAttachment } from './diagnostics.js'
import { type Hit, findHits, resolveHits } from './matcher.js'
import type { Registry, StepRegistration } from './registry.js'
import { splitSentences } from './sentences.js'
import { type Span, spanFromOffsets } from './span.js'

export type ExecutionPlan = {
  readonly bdd: Bdd
  readonly examples: ReadonlyArray<PlannedExample>
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

export type PlannedExample = {
  readonly name: string
  // Heading texts above this example, outer→inner. The runtime renders this
  // as a stack of `describe(...)` calls around the test.
  readonly scopeStack: ReadonlyArray<string>
  readonly span: Span
  readonly steps: ReadonlyArray<PlannedStep>
}

export type PlannedStep = {
  readonly text: string
  readonly matchSpan: Span
  readonly paramSpans: ReadonlyArray<Span>
  readonly stepDef: StepRegistration
  readonly args: ReadonlyArray<unknown>
  readonly dataTable?: Table
  readonly docString?: { content: string; contentType: string }
}

export function plan(bdd: Bdd, registry: Registry): ExecutionPlan {
  const examples: PlannedExample[] = []
  const diagnostics: Diagnostic[] = []
  for (const ex of bdd.examples) {
    let hadAmbiguous = false

    // Pass 1: plan each text-bearing block and collect steps per body index.
    const stepsByBlock = new Map<number, PlannedStep[]>()
    ex.body.forEach((block, idx) => {
      if (block.kind !== 'paragraph' && block.kind !== 'list_item' && block.kind !== 'blockquote')
        return
      const result = planBlock(block.text, registry)
      for (const collision of result.ambiguities) {
        const span = liftSpan(bdd.source, block, collision.matchStart, collision.matchEnd)
        diagnostics.push(
          ambiguousMatch({
            text: block.text.slice(collision.matchStart, collision.matchEnd),
            span,
            candidates: collision.candidates.map((c) => ({
              expression: c.expression,
              sourceFile: c.stepDef.expressionSourceFile,
              sourceLine: c.stepDef.expressionSourceLine,
            })),
          }),
        )
        hadAmbiguous = true
      }
      if (!hadAmbiguous && result.steps.length > 0) {
        const blockSteps: PlannedStep[] = result.steps.map((hit) => ({
          text: block.text.slice(hit.matchStart, hit.matchEnd),
          matchSpan: liftSpan(bdd.source, block, hit.matchStart, hit.matchEnd),
          paramSpans: hit.paramSpans.map((p) => liftSpan(bdd.source, block, p.start, p.end)),
          stepDef: hit.stepDef,
          args: hit.args,
        }))
        stepsByBlock.set(idx, blockSteps)
      }
    })

    // Pass 2: look for table/fence immediately after a step-bearing block.
    const attachments = new Map<
      number,
      { dataTable?: Table; docString?: { content: string; contentType: string } }
    >()
    for (let idx = 1; idx < ex.body.length; idx++) {
      const here = ex.body[idx]
      if (!here) continue
      if (here.kind === 'table' && stepsByBlock.has(idx - 1)) {
        attachments.set(idx - 1, { ...(attachments.get(idx - 1) ?? {}), dataTable: here })
      } else if (here.kind === 'fence' && stepsByBlock.has(idx - 1)) {
        const fence = here as Fence
        attachments.set(idx - 1, {
          ...(attachments.get(idx - 1) ?? {}),
          docString: { content: fence.body, contentType: fence.info },
        })
      }
    }

    // Pass 3: rebuild final step list, applying attachments to the last step of each block.
    const finalSteps: PlannedStep[] = []
    ex.body.forEach((_b, idx) => {
      const stepsAtIdx = stepsByBlock.get(idx) ?? []
      const attachAt = attachments.get(idx)
      for (let s = 0; s < stepsAtIdx.length; s++) {
        const step = stepsAtIdx[s]
        if (!step) continue
        if (s === stepsAtIdx.length - 1 && attachAt) {
          finalSteps.push({ ...step, ...attachAt })
        } else {
          finalSteps.push(step)
        }
      }
    })

    // Emit orphan-attachment for unattached tables/fences in this example's body.
    ex.body.forEach((block, idx) => {
      if (block.kind !== 'table' && block.kind !== 'fence') return
      const prev = ex.body[idx - 1]
      if (!prev) {
        diagnostics.push(orphanAttachment({ text: '', span: block.span, kind: block.kind }))
        return
      }
      const prevHadSteps = stepsByBlock.has(idx - 1)
      if (!prevHadSteps) {
        diagnostics.push(orphanAttachment({ text: '', span: block.span, kind: block.kind }))
      }
    })

    if (finalSteps.length === 0 && !hadAmbiguous) {
      // Example has no matches and no diagnostics — drop it (docs).
      continue
    }
    examples.push({
      name: deriveExampleName(ex.body),
      scopeStack: ex.scopeStack,
      span: ex.span,
      steps: hadAmbiguous ? [] : finalSteps,
    })
  }

  // Top-level orphans (tables/fences not inside any example).
  for (const orphan of bdd.orphanAttachments) {
    diagnostics.push(
      orphanAttachment({
        text: '',
        span: orphan.span,
        kind: orphan.kind,
      }),
    )
  }

  return { bdd, examples, diagnostics }
}

type BlockPlan = {
  readonly steps: ReadonlyArray<Hit>
  readonly ambiguities: ReadonlyArray<{
    readonly matchStart: number
    readonly matchEnd: number
    readonly candidates: ReadonlyArray<Hit>
  }>
}

function planBlock(text: string, registry: Registry): BlockPlan {
  const allSteps: Hit[] = []
  const allAmbiguities: {
    matchStart: number
    matchEnd: number
    candidates: ReadonlyArray<Hit>
  }[] = []
  for (const sentence of splitSentences(text)) {
    const hits = findHits(sentence.text, registry)
    const adjusted = hits.map((h) => ({
      ...h,
      matchStart: h.matchStart + sentence.startOffset,
      matchEnd: h.matchEnd + sentence.startOffset,
      paramSpans: h.paramSpans.map((p) => ({
        start: p.start + sentence.startOffset,
        end: p.end + sentence.startOffset,
      })),
    }))
    const resolved = resolveHits(adjusted)
    if (resolved.kind === 'ambiguous') {
      for (const c of resolved.collisions) allAmbiguities.push({ ...c })
    } else if (resolved.steps.length > 0) {
      allSteps.push(...resolved.steps)
    }
    // No keyword-led "missing step" detection — by design. Step-def
    // generation is selection-driven only, never inferred from sentence shape.
  }
  return { steps: allSteps, ambiguities: allAmbiguities }
}

function deriveExampleName(body: ReadonlyArray<Block>): string {
  const primary = body.find(
    (b) => b.kind === 'paragraph' || b.kind === 'list_item' || b.kind === 'blockquote',
  )
  if (!primary || (primary.kind !== 'paragraph' && primary.kind !== 'list_item' && primary.kind !== 'blockquote')) {
    return ''
  }
  const sentences = splitSentences(primary.text)
  const first = sentences[0]
  if (!first) return ''
  // Strip a single trailing . ! ? for the test name; embedded terminators
  // (e.g. inside `i.e.` or a quoted string) are left alone.
  return first.text.replace(/[.!?]$/, '')
}

function liftSpan(source: string, block: Block, blockStart: number, blockEnd: number): Span {
  if (block.kind !== 'paragraph' && block.kind !== 'list_item' && block.kind !== 'blockquote') {
    return block.span
  }
  return liftFromInlineMap(source, block.inlineMap, blockStart, blockEnd)
}

function liftFromInlineMap(
  source: string,
  inlineMap: ReadonlyArray<InlineOffset>,
  blockStart: number,
  blockEnd: number,
): Span {
  const start = liftInlineOffset(inlineMap, blockStart)
  const end = liftInlineOffset(inlineMap, blockEnd)
  return spanFromOffsets(source, start, end)
}

function liftInlineOffset(inlineMap: ReadonlyArray<InlineOffset>, textOffset: number): number {
  let best = inlineMap[0]
  for (const entry of inlineMap) {
    if (entry.textOffset <= textOffset) best = entry
  }
  if (!best) throw new Error('empty inlineMap')
  return best.sourceOffset + (textOffset - best.textOffset)
}
