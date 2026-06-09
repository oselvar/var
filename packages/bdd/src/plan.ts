import type { Bdd, Block, InlineOffset } from './ast.js'
import { type Diagnostic, ambiguousMatch } from './diagnostics.js'
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
  readonly span: Span
  readonly steps: ReadonlyArray<PlannedStep>
}

export type PlannedStep = {
  readonly text: string
  readonly matchSpan: Span
  readonly stepDef: StepRegistration
  readonly args: ReadonlyArray<unknown>
}

export function plan(bdd: Bdd, registry: Registry): ExecutionPlan {
  const examples: PlannedExample[] = []
  const diagnostics: Diagnostic[] = []
  for (const ex of bdd.examples) {
    const steps: PlannedStep[] = []
    let hadAmbiguous = false
    for (const block of ex.body) {
      if (block.kind !== 'paragraph' && block.kind !== 'list_item' && block.kind !== 'blockquote')
        continue
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
      if (!hadAmbiguous) {
        for (const hit of result.steps) {
          steps.push({
            text: block.text.slice(hit.matchStart, hit.matchEnd),
            matchSpan: liftSpan(bdd.source, block, hit.matchStart, hit.matchEnd),
            stepDef: hit.stepDef,
            args: hit.args,
          })
        }
      }
    }
    if (steps.length === 0 && !hadAmbiguous) {
      // Example has no matches and no diagnostics — drop it (docs).
      continue
    }
    examples.push({
      name: ex.name,
      span: ex.span,
      steps: hadAmbiguous ? [] : steps,
    })
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
  let offsetCursor = 0
  for (const sentence of splitSentences(text)) {
    const hits = findHits(sentence.text, registry)
    const adjusted = hits.map((h) => ({
      ...h,
      matchStart: h.matchStart + sentence.startOffset,
      matchEnd: h.matchEnd + sentence.startOffset,
    }))
    const resolved = resolveHits(adjusted)
    if (resolved.kind === 'ambiguous') {
      for (const c of resolved.collisions) allAmbiguities.push({ ...c })
    } else {
      allSteps.push(...resolved.steps)
    }
    offsetCursor = sentence.endOffset
    void offsetCursor
  }
  return { steps: allSteps, ambiguities: allAmbiguities }
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
