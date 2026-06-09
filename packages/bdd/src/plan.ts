import type { Bdd, Block, Fence, InlineOffset, Table } from './ast.js'
import { type Diagnostic, ambiguousMatch, missingStep, orphanAttachment } from './diagnostics.js'
import { isKeywordLed } from './keywords.js'
import { type Hit, findHits, resolveHits } from './matcher.js'
import type { Registry, StepRegistration } from './registry.js'
import { splitSentences } from './sentences.js'
import { generateSnippet } from './snippet.js'
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
  readonly dataTable?: Table
  readonly docString?: { content: string; contentType: string }
}

export function plan(bdd: Bdd, registry: Registry): ExecutionPlan {
  const examples: PlannedExample[] = []
  const diagnostics: Diagnostic[] = []
  for (const ex of bdd.examples) {
    let hadAmbiguous = false
    let hadMissing = false

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
          stepDef: hit.stepDef,
          args: hit.args,
        }))
        stepsByBlock.set(idx, blockSteps)
      }
      for (const missing of result.missing) {
        diagnostics.push(
          missingStep({
            text: missing.text,
            span: liftSpan(bdd.source, block, missing.start, missing.end),
            snippet: generateSnippet(missing.text, registry),
          }),
        )
        hadMissing = true
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

    if (finalSteps.length === 0 && !hadAmbiguous && !hadMissing) {
      // Example has no matches and no diagnostics — drop it (docs).
      continue
    }
    examples.push({
      name: ex.name,
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
  readonly missing: ReadonlyArray<{
    readonly text: string
    readonly start: number
    readonly end: number
  }>
}

function planBlock(text: string, registry: Registry): BlockPlan {
  const allSteps: Hit[] = []
  const allAmbiguities: {
    matchStart: number
    matchEnd: number
    candidates: ReadonlyArray<Hit>
  }[] = []
  const allMissing: { text: string; start: number; end: number }[] = []
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
    } else if (resolved.steps.length > 0) {
      allSteps.push(...resolved.steps)
    } else if (isKeywordLed(sentence.text)) {
      allMissing.push({ text: sentence.text, start: sentence.startOffset, end: sentence.endOffset })
    }
    offsetCursor = sentence.endOffset
    void offsetCursor
  }
  return { steps: allSteps, ambiguities: allAmbiguities, missing: allMissing }
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
