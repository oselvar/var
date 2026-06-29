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

// ─── Argument-type inference from the cucumber expression ───
// var's own port of cucumber-expressions' parameter grammar: map an expression
// literal's `{name}` placeholders to the types their transformers produce.
// (Deliberately kept here rather than upstreamed — the parameter-extraction
// grammar is small and stable, and var's needs are narrow.) The one
// var-specific choice is the `AnyArg` fallback for a name with no known type:
// `any`, not `unknown`, so authors can still annotate a slot the inference can't
// reach — a custom type not declared via `defineState`, or the trailing
// data-table / doc-string arg the runtime appends.

// `any`, not `unknown`: an annotated fallback param (`code: string`) must stay
// assignable to its slot, which `unknown` would reject under parameter
// contravariance — the exact TS2345 that typed handlers used to hit.
// biome-ignore lint/suspicious/noExplicitAny: intentional flexible fallback slot
type AnyArg = any

// Built-in cucumber parameter-type name → the type its transformer produces.
interface BuiltInParameterTypes {
  int: number
  float: number
  double: number
  byte: number
  short: number
  long: number
  biginteger: bigint
  bigdecimal: string
  word: string
  string: string
  '': string
}

// Parameter-type names in the expression, in source order. Escape-aware:
// a brace escaped with a backslash (`\{`) is literal text, not a parameter.
type ParameterNames<
  S extends string,
  InParameter extends boolean = false,
  Current extends string = '',
  Names extends string[] = [],
> = S extends `\\${infer _Escaped}${infer Rest}`
  ? ParameterNames<Rest, InParameter, Current, Names>
  : S extends `{${infer Rest}`
    ? ParameterNames<Rest, true, '', Names>
    : S extends `}${infer Rest}`
      ? InParameter extends true
        ? ParameterNames<Rest, false, '', [...Names, Current]>
        : ParameterNames<Rest, false, '', Names>
      : S extends `${infer Char}${infer Rest}`
        ? InParameter extends true
          ? ParameterNames<Rest, true, `${Current}${Char}`, Names>
          : ParameterNames<Rest, false, Current, Names>
        : Names

// Resolve one parameter name to a type: a custom registry entry wins, then a
// built-in, then the `any` fallback.
type ResolveArg<Name extends string, Custom> = Name extends keyof Custom
  ? Custom[Name]
  : Name extends keyof BuiltInParameterTypes
    ? BuiltInParameterTypes[Name]
    : AnyArg

type MapArgs<Names extends readonly string[], Custom> = {
  [Index in keyof Names]: ResolveArg<Names[Index] & string, Custom>
}

// Parsed placeholders mapped to types, then any trailing arg (table/doc string)
// the runtime appends — that tail is `AnyArg` because the expression can't
// describe it.
type HandlerArgs<E extends string, Custom> = [...MapArgs<ParameterNames<E>, Custom>, ...AnyArg[]]

// A context/action handler runs for its side effects only; its args are inferred
// from the expression `E` (built-in parameter types, plus any `Custom` types
// declared via `defineState`), so `(ctx, name) => …` types `name` without an
// annotation and without TS2345.
export type RoleFn<C = unknown, Custom = Record<never, never>> = <E extends string>(
  expression: E,
  handler: (ctx: C, ...args: HandlerArgs<E, Custom>) => void | Promise<void>,
) => void

// A sensor may RETURN a value for the pure core to compare against the Markdown.
// That return shape is independent of the captured args — it can be a by-index
// column tuple, a header-bound row object, a whole reproduced table, or a
// doc-string tuple — so `R` is inferred freely from the handler body.
export type SensorFn<C = unknown, Custom = Record<never, never>> = <E extends string, R>(
  expression: E,
  handler: (ctx: C, ...args: HandlerArgs<E, Custom>) => R | Promise<R>,
) => void

export const context: RoleFn = (expression, handler) =>
  registerStep(expression, handler as StepHandler, 'context')
export const action: RoleFn = (expression, handler) =>
  registerStep(expression, handler as StepHandler, 'action')
export const sensor: SensorFn = (expression, handler) =>
  registerStep(expression, handler as StepHandler, 'sensor')

// A custom parameter type, declared inline in `defineState` so its transformer's
// return type can be captured for inference (and registered for matching).
type ParamTypeDef<T> = {
  readonly regexp: RegExp | ReadonlyArray<RegExp>
  readonly transformer: (...captures: string[]) => T
}

// Record of parameter-type definitions → `{ name: producedType }`, the custom
// registry that drives `{name}` → type inference for this stepfile's steps.
type CustomRegistry<P> = { [K in keyof P]: P[K] extends ParamTypeDef<infer T> ? T : never }

export function defineState<
  C,
  P extends Record<string, ParamTypeDef<unknown>> = Record<never, never>,
>(
  factory: () => C | Promise<C>,
  paramTypes?: P,
): {
  readonly context: RoleFn<C, CustomRegistry<P>>
  readonly action: RoleFn<C, CustomRegistry<P>>
  readonly sensor: SensorFn<C, CustomRegistry<P>>
} {
  const { sourceFile } = callerLocation()
  if (contextFactoriesByFile.has(sourceFile)) {
    throw new Error(`defineState() called more than once in ${sourceFile}`)
  }
  contextFactoriesByFile.set(sourceFile, factory as () => unknown)
  if (paramTypes) {
    for (const [name, def] of Object.entries(paramTypes)) {
      customTypes.push({ name, regexp: def.regexp, transformer: def.transformer })
    }
  }
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
