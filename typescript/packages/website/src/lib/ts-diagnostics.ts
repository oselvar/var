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

// The REAL `@oselvar/var` typings: the package's exports point at its
// TypeScript source (`./src/index.ts`), so the editor type-checks against the
// same files authors install — no hand-maintained ambient copy to drift when
// the API changes. `internal.ts`'s own imports from @oselvar/var-core stay
// unresolved in here; that only degrades types INSIDE internal.ts (whose
// diagnostics are never requested) — steps's public type closure is
// self-contained.
import varIndexSource from '../../../var/src/index.ts?raw'
import varInternalSource from '../../../var/src/internal.ts?raw'

const VAR_PACKAGE_DIR = '/oselvar-var'
const VAR_ENTRY = `${VAR_PACKAGE_DIR}/index.ts`
const VAR_SOURCES: ReadonlyArray<readonly [string, string]> = [
  [VAR_ENTRY, varIndexSource],
  [`${VAR_PACKAGE_DIR}/internal.ts`, varInternalSource],
]

const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  // index.ts imports './internal.ts' with its extension, as the whole
  // workspace does (Node runs the sources natively).
  allowImportingTsExtensions: true,
  baseUrl: '/',
  paths: { '@oselvar/var': [VAR_ENTRY] },
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
  for (const [path, text] of VAR_SOURCES) docs.set(path, { text, version: 0 })

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
