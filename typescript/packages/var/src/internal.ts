import {
  addStep,
  createRegistry,
  defineParameterType as defineParameterTypeCore,
  type Registry,
  type StepHandler,
  type StepKind,
} from '@oselvar/var-core'

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
  readonly parse?: (...captures: string[]) => unknown
  readonly format?: (value: unknown) => string
}

let stepEntries: Entry[] = []
// One context factory per stepfile. Each .steps.ts that calls
// steps() owns its own slice of state; steps from different
// stepfiles never see each other's context.
const contextFactoriesByFile = new Map<string, () => unknown | Promise<unknown>>()
let customTypes: CustomTypeDef[] = []

function registerStep(expression: string, handler: StepHandler, kind: StepKind): void {
  const { sourceFile, sourceLine } = callerLocation()
  stepEntries.push({ expression, sourceFile, sourceLine, handler, kind })
}

// ─── Argument-type inference from the cucumber expression ───
// var's own port of cucumber-expressions' parameter grammar: map an expression
// literal's `{name}` placeholders to the types their parse functions produce.
// (Deliberately kept here rather than upstreamed — the parameter-extraction
// grammar is small and stable, and var's needs are narrow.) The one
// var-specific choice is the `AnyArg` fallback for a name with no known type:
// `any`, not `unknown`, so authors can still annotate a slot the inference can't
// reach — a custom type not declared via `.param()`, or the trailing
// data-table / doc-string arg the runtime appends.

// `any`, not `unknown`: an annotated fallback param (`code: string`) must stay
// assignable to its slot, which `unknown` would reject under parameter
// contravariance — the exact TS2345 that typed handlers used to hit.
// biome-ignore lint/suspicious/noExplicitAny: intentional flexible fallback slot
type AnyArg = any

// Built-in cucumber parameter-type name → the type its parse function produces.
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

// Deeply-readonly view of the state handed to every step: each nested property
// is `readonly`, so a handler can read state but never mutate it (mutation is a
// type error and — because the runtime deep-freezes — a runtime throw too).
// Functions pass through; arrays and objects recurse.
type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T

// A stimulus handler receives the immutable `state` (deeply readonly) plus
// the args inferred from the expression `E` (built-in parameter types, plus any
// `Custom` types declared via `.param()`), so `(state, name) => …` types
// `name` without an annotation and without TS2345. It EVOLVES state by RETURNING
// a partial state object (shallow-merged by the runtime) — or nothing, for no
// change. It never mutates `state`.
type StimulusFn<C = unknown, Custom = Record<never, never>> = <E extends string>(
  expression: E,
  handler: (
    state: DeepReadonly<C>,
    ...args: HandlerArgs<E, Custom>
    // biome-ignore lint/suspicious/noConfusingVoidType: mirrors the outer void; async handlers that return nothing satisfy Promise<void>, which is assignable here
  ) => Partial<C> | void | Promise<Partial<C> | void>,
) => void

// A sensor is a pure OBSERVER: it reads the immutable `state` (deeply readonly)
// and may RETURN a value for the pure core to compare against the Markdown. That
// return shape is independent of the captured args — a by-index column tuple, a
// header-bound row object, a whole reproduced table, or a doc-string tuple — so
// `R` is inferred freely from the handler body. A sensor never changes state.
type SensorFn<C = unknown, Custom = Record<never, never>> = <E extends string, R>(
  expression: E,
  handler: (state: DeepReadonly<C>, ...args: HandlerArgs<E, Custom>) => R | Promise<R>,
) => void

// The step-authoring surface returned by `steps()`: the three roles a step
// file needs, all hanging off one object. `param` declares a custom parameter
// type AND widens `Custom` at the type level, so a later `{name}` in a stimulus
// or sensor expression resolves to that type without an annotation.
//
// `param` is CHAINABLE: each call returns a `Steps` whose `Custom` gained this
// type, so `stimulus`/`sensor` read off the accumulated map. Declaring params
// via a returned-and-reassigned chain (rather than an up-front object) is what
// preserves inference — `stimulus`/`sensor` must be reached *after* the params
// they use. A file with no custom types can still destructure
// `const { stimulus, sensor } = steps(factory)`; built-in `{int}`/`{word}`
// inference doesn't depend on `Custom`.
//
// `parse` is a VARARGS function over the capture groups — cucumber-expressions
// passes each group as a separate argument. Omitted, the parameter stays the
// matched text (`T` defaults to `string`). `format` is the inverse: value →
// the document's notation, used only to display the actual side of a parameter
// mismatch. Because `param` is generic per call, `format`'s value is typed `T`
// — the exact return of this call's `parse` — so an unannotated `format: (m) =>
// …` is contextually typed and the parse/format pairing is checked.
export interface Steps<C = Record<string, never>, Custom = Record<never, never>> {
  param<const Name extends string, T = string>(
    name: Name,
    regexp: RegExp | ReadonlyArray<RegExp>,
    parse?: (...captures: string[]) => T,
    format?: (value: T) => string,
  ): Steps<C, Custom & Record<Name, T>>
  readonly stimulus: StimulusFn<C, Custom>
  readonly sensor: SensorFn<C, Custom>
}

// Non-generic runtime view of the builder. The three methods just push into the
// module-level accumulators; `param` returns the same object (the widening is
// purely type-level). Kept separate from the generic public `Steps<C, Custom>`
// so `param`'s self-referential return type doesn't need to be inferred here —
// `steps()` casts this to the public contract, which drives all author-facing
// inference.
interface StepsRuntime {
  param(
    name: string,
    regexp: RegExp | ReadonlyArray<RegExp>,
    parse?: (...captures: string[]) => unknown,
    format?: (value: unknown) => string,
  ): StepsRuntime
  stimulus(expression: string, handler: StepHandler): void
  sensor(expression: string, handler: StepHandler): void
}

// The factory is OPTIONAL: a step file whose steps are pure (nothing to
// arrange, nothing to evolve) calls `steps()` bare and its handlers receive an
// empty state. `C` then defaults to `Record<string, never>`, so a stimulus can
// only return `{}`/nothing and a sensor can't read phantom fields.
export function steps<C = Record<string, never>>(factory?: () => C | Promise<C>): Steps<C> {
  const { sourceFile } = callerLocation()
  if (contextFactoriesByFile.has(sourceFile)) {
    throw new Error(`steps() called more than once in ${sourceFile}`)
  }
  contextFactoriesByFile.set(sourceFile, (factory ?? (() => ({}))) as () => unknown)
  const self: StepsRuntime = {
    param(name, regexp, parse, format) {
      customTypes.push({
        name,
        regexp,
        ...(parse ? { parse } : {}),
        ...(format ? { format } : {}),
      })
      return self
    },
    stimulus(expression, handler) {
      registerStep(expression, handler, 'stimulus')
    },
    sensor(expression, handler) {
      registerStep(expression, handler, 'sensor')
    },
  }
  return self as unknown as Steps<C>
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
      ...(t.parse ? { parse: t.parse } : {}),
      ...(t.format ? { format: t.format } : {}),
    })
  }
  for (const e of stepEntries) {
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

// Conformance-harness accessor: the custom parameter types accumulated by
// steps().param() since the last _resetBuilder, projected to the {name, regexp}
// wire shape toRegistryArtifact serializes. regexp is the bare pattern
// source (RegExp.source — no flags/delimiters), the cross-port convention
// every language's registry golden uses. Internal-only: exported via
// @oselvar/var/registry beside _resetBuilder, never from the package root.
export function _customParameterTypes(): ReadonlyArray<{
  readonly name: string
  readonly regexp: string
}> {
  return customTypes.map((t) => {
    if (Array.isArray(t.regexp)) {
      throw new Error(
        `parameter type "${t.name}": regexp arrays are not supported by the conformance projection yet`,
      )
    }
    return { name: t.name, regexp: (t.regexp as RegExp).source }
  })
}

export function _resetBuilder(): void {
  stepEntries = []
  contextFactoriesByFile.clear()
  customTypes = []
}

// Parse one stack frame into its file path and line, stripping the engine's
// framing: V8's `at fn (path:line:col)` / `at path:line:col`, and Firefox/JSC's
// `fn@url:line:col` / `@url:line:col`. The file class excludes `@`, `(` and
// whitespace so the function-name prefix never leaks into the path — the paths
// must compare equal across frames of the same module (see below).
function parseFrame(line: string): { file: string; line: number } | undefined {
  const m = /(?:@|\(|\s)?([^\s@(]+):(\d+):\d+\)?\s*$/.exec(line)
  return m ? { file: m[1] ?? '', line: Number(m[2] ?? 0) } : undefined
}

function callerLocation(): { sourceFile: string; sourceLine: number } {
  return _callerLocationFromStack(new Error('locate').stack ?? '')
}

// Split out from callerLocation so it can be unit-tested against real V8,
// SpiderMonkey and JSC stack strings without a browser.
//
// The deepest parseable frame is callerLocation's own — its file identifies
// *this* module: a real source path when loaded from disk (`.../var/src/…` or
// `.../var/dist/…`), or a bundled chunk when a runner bundles the package (the
// website's Web Worker). Every internal frame — callerLocation, steps,
// registerStep, the param/stimulus/sensor closures — shares that file, so the
// first frame with a *different* file is the step author's. Keying on file
// identity instead of a hardcoded `/var/src/internal` substring is what makes
// this work once bundled: the old substring never appears in a minified chunk,
// and on engines whose stack omits the `Error:` header (Firefox/JSC) steps and
// registerStep would otherwise resolve to different internal frames, keying the
// context factory under mismatched paths — the exact cause of a lost state
// factory (`state.<field> is undefined`) in the bundled worker.
export function _callerLocationFromStack(stack: string): {
  sourceFile: string
  sourceLine: number
} {
  let selfFile: string | undefined
  for (const line of stack.split('\n')) {
    const frame = parseFrame(line)
    if (!frame) continue
    if (selfFile === undefined) {
      selfFile = frame.file
      continue
    }
    if (frame.file !== selfFile) return { sourceFile: frame.file, sourceLine: frame.line }
  }
  return { sourceFile: '<unknown>', sourceLine: 0 }
}
