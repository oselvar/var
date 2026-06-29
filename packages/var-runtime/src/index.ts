import {
  addStep,
  createRegistry,
  defineParameterType as defineParameterTypeCore,
  type Registry,
  type StepHandler,
  type StepKind,
} from '@oselvar/var'

type Entry = {
  readonly expression: string
  readonly sourceFile: string
  readonly sourceLine: number
  readonly handler: StepHandler
  readonly kind: StepKind
}

type CustomTypeDef = {
  readonly name: string
  readonly regexp: RegExp | ReadonlyArray<RegExp>
  readonly transformer: (...captures: string[]) => unknown
}

let steps: Entry[] = []
// One context factory per stepfile. Each .steps.ts that calls
// defineState() owns its own slice of state; steps from different
// stepfiles never see each other's context.
const contextFactoriesByFile = new Map<string, () => unknown | Promise<unknown>>()
let customTypes: CustomTypeDef[] = []

function registerStep(expression: string, handler: StepHandler, kind: StepKind): void {
  const { sourceFile, sourceLine } = callerLocation()
  steps.push({ expression, sourceFile, sourceLine, handler, kind })
}

// ─── Argument-type inference from the cucumber expression (Tier 1) ───
// The handler's positional args are derived from the expression literal:
// `{int}`/`{float}`/… → number, `{biginteger}` → bigint, `{string}`/`{word}`/
// `{}` → string. Authors no longer annotate them. Custom parameter types
// (`{airport}`) and the trailing data-table / doc-string arg the runtime
// appends are not visible in the expression, so they fall back to `AnyArg` and
// can be annotated to taste (Tier 2 will resolve customs via a typed registry).

// `any`, not `unknown`: an annotated fallback param (`code: string`) must stay
// assignable to its slot, which `unknown` would reject under parameter
// contravariance — the exact TS2345 that typed handlers used to hit.
// biome-ignore lint/suspicious/noExplicitAny: intentional flexible fallback slot
type AnyArg = any

// Built-in cucumber parameter-type name → TypeScript type.
type BuiltInArg<N extends string> = N extends
  | 'int'
  | 'float'
  | 'double'
  | 'long'
  | 'short'
  | 'byte'
  | 'bigdecimal'
  ? number
  : N extends 'biginteger'
    ? bigint
    : N extends 'string' | 'word' | ''
      ? string
      : AnyArg

// Pull `{name}` placeholders out of the expression literal, in source order.
// A `{` preceded by a backslash is an escaped literal brace, not a parameter.
type ParseArgs<
  S extends string,
  Acc extends unknown[] = [],
> = S extends `${infer Pre}{${infer Rest}`
  ? Pre extends `${string}\\`
    ? ParseArgs<Rest, Acc>
    : Rest extends `${infer Name}}${infer After}`
      ? ParseArgs<After, [...Acc, BuiltInArg<Name>]>
      : Acc
  : Acc

// Parsed placeholders, followed by any trailing arg (table/doc string) the
// runtime appends — that tail is `AnyArg` because the expression can't describe it.
type HandlerArgs<E extends string> = [...ParseArgs<E>, ...AnyArg[]]

// A context/action handler runs for its side effects only; its args are inferred
// from the expression `E` (see HandlerArgs), so `(ctx, name) => …` types `name`
// without an annotation and without TS2345.
export type RoleFn<C = unknown> = <E extends string>(
  expression: E,
  handler: (ctx: C, ...args: HandlerArgs<E>) => void | Promise<void>,
) => void

// A sensor may RETURN a value for the pure core to compare against the Markdown.
// That return shape is independent of the captured args — it can be a by-index
// column tuple, a header-bound row object, a whole reproduced table, or a
// doc-string tuple — so `R` is inferred freely from the handler body.
export type SensorFn<C = unknown> = <E extends string, R>(
  expression: E,
  handler: (ctx: C, ...args: HandlerArgs<E>) => R | Promise<R>,
) => void

export const context: RoleFn = (expression, handler) =>
  registerStep(expression, handler as StepHandler, 'context')
export const action: RoleFn = (expression, handler) =>
  registerStep(expression, handler as StepHandler, 'action')
export const sensor: SensorFn = (expression, handler) =>
  registerStep(expression, handler as StepHandler, 'sensor')

export function defineState<C>(factory: () => C | Promise<C>): {
  readonly context: RoleFn<C>
  readonly action: RoleFn<C>
  readonly sensor: SensorFn<C>
} {
  const { sourceFile } = callerLocation()
  if (contextFactoriesByFile.has(sourceFile)) {
    throw new Error(`defineState() called more than once in ${sourceFile}`)
  }
  contextFactoriesByFile.set(sourceFile, factory as () => unknown)
  return {
    context: (expression, handler) => registerStep(expression, handler as StepHandler, 'context'),
    action: (expression, handler) => registerStep(expression, handler as StepHandler, 'action'),
    sensor: (expression, handler) => registerStep(expression, handler as StepHandler, 'sensor'),
  }
}

export function defineParameterType<T>(opts: {
  name: string
  regexp: RegExp | ReadonlyArray<RegExp>
  transformer: (...captures: string[]) => T
}): void {
  customTypes.push(opts as CustomTypeDef)
}

export function contextFactory(): (stepFile: string) => unknown | Promise<unknown> {
  return (stepFile: string) => {
    const f = contextFactoriesByFile.get(stepFile)
    return f ? f() : {}
  }
}

export function buildRegistry(): Registry {
  let r = createRegistry()
  for (const t of customTypes) {
    r = defineParameterTypeCore(r, {
      name: t.name,
      regexp: t.regexp as RegExp | ReadonlyArray<RegExp>,
      transformer: t.transformer,
    })
  }
  for (const e of steps) {
    r = addStep(r, {
      expression: e.expression,
      expressionSourceFile: e.sourceFile,
      expressionSourceLine: e.sourceLine,
      handler: e.handler,
      kind: e.kind,
    })
  }
  return r
}

export function _resetBuilder(): void {
  steps = []
  contextFactoriesByFile.clear()
  customTypes = []
}

function callerLocation(): { sourceFile: string; sourceLine: number } {
  const stack = new Error('locate').stack ?? ''
  const lines = stack.split('\n').slice(1)
  // Find the first frame that's NOT in this module's source/dist.
  let callerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (
      line.includes('/var-runtime/src/index') ||
      line.includes('/var-runtime/dist/index') ||
      line.includes('/api.ts') ||
      line.includes('/api.js')
    ) {
      continue
    }
    callerIdx = i
    break
  }
  const caller = lines[callerIdx] ?? lines[1] ?? ''
  const m = /([^\s(]+):(\d+):\d+\)?$/.exec(caller)
  if (!m) return { sourceFile: '<unknown>', sourceLine: 0 }
  return { sourceFile: m[1] ?? '<unknown>', sourceLine: Number(m[2] ?? 0) }
}
