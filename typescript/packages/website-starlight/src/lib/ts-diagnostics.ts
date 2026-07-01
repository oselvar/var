import * as ts from 'typescript'

// Bundled TypeScript lib .d.ts files, keyed by basename (e.g. "lib.es2020.d.ts").
// Vite/Vitest resolve this glob at build/test time; no CDN.
const libModules = import.meta.glob('/node_modules/typescript/lib/lib.*.d.ts', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>
const LIB = new Map<string, string>()
for (const [p, text] of Object.entries(libModules)) {
  const base = p.split('/').pop()
  if (base) LIB.set(base, text)
}

// Ambient types for the browser step-definition runtime, so imports resolve and
// ctx/args typecheck without real module resolution.
const AMBIENT_FILE = 'var.d.ts'
const AMBIENT = `declare module '@oselvar/var' {
  type AnyArg = any
  interface BuiltInParameterTypes {
    int: number; float: number; double: number; byte: number; short: number; long: number
    biginteger: bigint; bigdecimal: string; word: string; string: string; '': string
  }
  type ParameterNames<S extends string, InParameter extends boolean = false, Current extends string = '', Names extends string[] = []> =
    S extends \`\\\\\${infer _Escaped}\${infer Rest}\` ? ParameterNames<Rest, InParameter, Current, Names>
    : S extends \`{\${infer Rest}\` ? ParameterNames<Rest, true, '', Names>
    : S extends \`}\${infer Rest}\` ? (InParameter extends true ? ParameterNames<Rest, false, '', [...Names, Current]> : ParameterNames<Rest, false, '', Names>)
    : S extends \`\${infer Char}\${infer Rest}\` ? (InParameter extends true ? ParameterNames<Rest, true, \`\${Current}\${Char}\`, Names> : ParameterNames<Rest, false, Current, Names>)
    : Names
  type ResolveArg<Name extends string, Custom> = Name extends keyof Custom ? Custom[Name] : Name extends keyof BuiltInParameterTypes ? BuiltInParameterTypes[Name] : AnyArg
  type MapArgs<Names extends readonly string[], Custom> = { [Index in keyof Names]: ResolveArg<Names[Index] & string, Custom> }
  type HandlerArgs<E extends string, Custom> = [...MapArgs<ParameterNames<E>, Custom>, ...AnyArg[]]
  type DeepReadonly<T> = T extends (...args: never[]) => unknown
    ? T
    : T extends ReadonlyArray<infer U>
      ? ReadonlyArray<DeepReadonly<U>>
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T
  export type RoleFn<C = unknown, Custom = Record<never, never>> = <E extends string>(
    expression: E,
    handler: (
      state: DeepReadonly<C>,
      ...args: HandlerArgs<E, Custom>
    ) => Partial<C> | void | Promise<Partial<C> | void>,
  ) => void
  export type SensorFn<C = unknown, Custom = Record<never, never>> = <E extends string, R>(
    expression: E,
    handler: (state: DeepReadonly<C>, ...args: HandlerArgs<E, Custom>) => R | Promise<R>,
  ) => void
  type ParamTypeDef<T> = { regexp: RegExp | readonly RegExp[]; transformer: (...captures: string[]) => T }
  type CustomRegistry<P> = { [K in keyof P]: P[K] extends ParamTypeDef<infer T> ? T : never }
  export function defineState<C, P extends Record<string, ParamTypeDef<unknown>> = Record<never, never>>(
    factory: () => C | Promise<C>,
    paramTypes?: P,
  ): {
    readonly context: RoleFn<C, CustomRegistry<P>>; readonly action: RoleFn<C, CustomRegistry<P>>; readonly sensor: SensorFn<C, CustomRegistry<P>>
  }
}`

const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  strict: false,
  skipLibCheck: true,
}

export type LspDiagnostic = {
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
  message: string
  severity: number
}

export function createTsDiagnostics() {
  const docs = new Map<string, { text: string; version: number }>()
  docs.set(AMBIENT_FILE, { text: AMBIENT, version: 0 })

  const base = (f: string) => f.split('/').pop() ?? f

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...docs.keys()],
    getScriptVersion: (f) => String(docs.get(f)?.version ?? 0),
    getScriptSnapshot: (f) => {
      const d = docs.get(f)
      if (d) return ts.ScriptSnapshot.fromString(d.text)
      const lib = LIB.get(base(f))
      return lib ? ts.ScriptSnapshot.fromString(lib) : undefined
    },
    getCurrentDirectory: () => '/',
    getCompilationSettings: () => OPTIONS,
    getDefaultLibFileName: () => 'lib.es2020.d.ts',
    fileExists: (f) => docs.has(f) || LIB.has(base(f)),
    readFile: (f) => docs.get(f)?.text ?? LIB.get(base(f)),
    readDirectory: () => [],
    directoryExists: () => true,
    getDirectories: () => [],
  }

  const service = ts.createLanguageService(host, ts.createDocumentRegistry())

  function updateDoc(path: string, text: string): void {
    const prev = docs.get(path)
    docs.set(path, { text, version: (prev?.version ?? 0) + 1 })
  }

  function diagnostics(path: string): LspDiagnostic[] {
    const raw = [...service.getSyntacticDiagnostics(path), ...service.getSemanticDiagnostics(path)]
    const sf = service.getProgram()?.getSourceFile(path)
    return raw.map((d) => {
      const start = d.start ?? 0
      const s = sf?.getLineAndCharacterOfPosition(start) ?? { line: 0, character: 0 }
      const e = sf?.getLineAndCharacterOfPosition(start + (d.length ?? 0)) ?? s
      return {
        range: {
          start: { line: s.line, character: s.character },
          end: { line: e.line, character: e.character },
        },
        message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
        severity:
          d.category === ts.DiagnosticCategory.Error
            ? 1
            : d.category === ts.DiagnosticCategory.Warning
              ? 2
              : 3,
      }
    })
  }

  return { updateDoc, diagnostics }
}
