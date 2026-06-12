import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  CodeAction,
  type CodeActionContext,
  CodeActionKind,
  type CodeActionProvider,
  commands,
  type ExtensionContext,
  languages,
  Position,
  Range,
  type Selection,
  type TextDocument,
  type TextEditor,
  type TextEditorDecorationType,
  Uri,
  window,
  workspace,
  WorkspaceEdit,
} from 'vscode'
import {
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node.js'
import { LanguageClient } from 'vscode-languageclient/node.js'

let client: LanguageClient | undefined

export function activate(context: ExtensionContext): void {
  // The symlink installer (T8) mirrors `packages/bdd-vscode/` into
  // ~/.vscode/extensions/. Resolve the symlink before walking `..` so we land
  // at the real `packages/` directory; otherwise we'd point at
  // `~/.vscode/extensions/bdd-lsp/dist/bin.js`, which doesn't exist.
  const extReal = realpathSync(context.extensionPath)
  const serverModule = resolve(extReal, '..', 'bdd-lsp', 'dist', 'bin.js')
  // `@oselvar/bdd`'s `exports.import` points at `src/index.ts` so we can run
  // tests without a build step. The LSP server reaches the core through that
  // same entry, so we need tsx to load `.ts` files at runtime.
  const tsxLoader = resolve(extReal, '..', '..', 'node_modules', 'tsx', 'dist', 'loader.mjs')
  const execArgv = ['--import', pathToFileURL(tsxLoader).href]
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio, options: { execArgv } },
    debug: { module: serverModule, transport: TransportKind.stdio, options: { execArgv } },
  }
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', pattern: '**/*.bdd.md' },
      { scheme: 'file', pattern: '**/*.steps.ts' },
    ],
  }
  client = new LanguageClient('oselvar-bdd', 'oselvar BDD', serverOptions, clientOptions)
  const started = client.start()
  registerMatchDecorations(context, client, started)
  registerGenerateStepDefinition(context, client, started)
  registerGenerateCodeAction(context)
  registerStepRename(context, client, started)
}

type LspRange = {
  readonly start: { readonly line: number; readonly character: number }
  readonly end: { readonly line: number; readonly character: number }
}

type MatchRangeEntry = { readonly range: LspRange; readonly params: ReadonlyArray<LspRange> }

function toVscodeRange(r: LspRange): Range {
  return new Range(r.start.line, r.start.character, r.end.line, r.end.character)
}

function registerMatchDecorations(
  context: ExtensionContext,
  lspClient: LanguageClient,
  started: Promise<void>,
): void {
  // Greenish wash for the whole matched substring — clearly visible against
  // both light and dark themes without competing with selection or search.
  const matchDecoration: TextEditorDecorationType = window.createTextEditorDecorationType({
    backgroundColor: 'rgba(80, 200, 120, 0.18)',
  })
  // Stronger green + bold weight on the parameter spans (e.g. the `"world"`
  // captured by `{string}`).
  const paramDecoration: TextEditorDecorationType = window.createTextEditorDecorationType({
    backgroundColor: 'rgba(80, 200, 120, 0.42)',
    fontWeight: 'bold',
  })
  context.subscriptions.push(matchDecoration, paramDecoration)

  const refresh = async (editor: TextEditor | undefined): Promise<void> => {
    if (!editor) return
    if (!editor.document.fileName.endsWith('.bdd.md')) return
    try {
      const entries = await lspClient.sendRequest<ReadonlyArray<MatchRangeEntry>>(
        'bdd/matchRanges',
        { uri: editor.document.uri.toString() },
      )
      editor.setDecorations(
        matchDecoration,
        entries.map((e) => toVscodeRange(e.range)),
      )
      editor.setDecorations(
        paramDecoration,
        entries.flatMap((e) => e.params.map(toVscodeRange)),
      )
    } catch {
      // Server may be initializing; the next 'bdd/didIndex' will retry.
    }
  }

  const refreshAll = (): void => {
    for (const ed of window.visibleTextEditors) void refresh(ed)
  }

  context.subscriptions.push(
    window.onDidChangeActiveTextEditor((ed) => void refresh(ed)),
    window.onDidChangeVisibleTextEditors(refreshAll),
    workspace.onDidChangeTextDocument((e) => {
      for (const ed of window.visibleTextEditors) {
        if (ed.document === e.document) void refresh(ed)
      }
    }),
  )

  // `onNotification` requires the client to be started; wait, then register
  // the handler and do an initial paint.
  started
    .then(() => {
      lspClient.onNotification('bdd/didIndex', refreshAll)
      refreshAll()
    })
    .catch(() => {
      // start failure is already surfaced by the language client itself.
    })
}

function registerGenerateCodeAction(context: ExtensionContext): void {
  const provider: CodeActionProvider = {
    provideCodeActions(
      _document: TextDocument,
      range: Range | Selection,
      _context: CodeActionContext,
    ) {
      // Only offer the action when the user has actually selected text — no
      // keyword sniffing, no cursor-only triggering.
      if (range.isEmpty) return undefined
      const action = new CodeAction(
        'Generate Step Definition from Selection',
        CodeActionKind.RefactorExtract,
      )
      action.command = {
        command: 'oselvar-bdd.generateStepDefinition',
        title: 'Generate Step Definition',
      }
      return [action]
    },
  }
  context.subscriptions.push(
    languages.registerCodeActionsProvider(
      { scheme: 'file', pattern: '**/*.bdd.md' },
      provider,
      { providedCodeActionKinds: [CodeActionKind.RefactorExtract] },
    ),
  )
}

function registerGenerateStepDefinition(
  context: ExtensionContext,
  lspClient: LanguageClient,
  started: Promise<void>,
): void {
  const cmd = commands.registerCommand('oselvar-bdd.generateStepDefinition', async () => {
    const editor = window.activeTextEditor
    if (!editor) {
      void window.showInformationMessage('No active editor.')
      return
    }
    const text = editor.document.getText(editor.selection).trim()
    if (text.length === 0) {
      void window.showInformationMessage('Select the text to generate a step definition from.')
      return
    }
    await started
    const [snippet, stepGlobs] = await Promise.all([
      lspClient.sendRequest<{ readonly fullCode: string; readonly expression: string }>(
        'bdd/generateSnippet',
        { text },
      ),
      lspClient.sendRequest<ReadonlyArray<string>>('bdd/stepGlobs'),
    ])
    const stepFiles = await findStepFiles(stepGlobs)
    if (stepFiles.length === 0) {
      void window.showWarningMessage(
        'No *.steps.ts files found in the workspace. Create one first, then re-run the command.',
      )
      return
    }
    const pick = await window.showQuickPick(
      stepFiles.map((u) => ({ label: workspace.asRelativePath(u), uri: u })),
      { placeHolder: `Append "${snippet.expression}" to which steps file?` },
    )
    if (!pick) return
    await appendSnippet(pick.uri, snippet.fullCode)
    const doc = await workspace.openTextDocument(pick.uri)
    await window.showTextDocument(doc, { selection: new Range(doc.lineCount, 0, doc.lineCount, 0) })
  })
  context.subscriptions.push(cmd)
}

async function findStepFiles(stepGlobs: ReadonlyArray<string>): Promise<ReadonlyArray<Uri>> {
  // Use the workspace globs reported by the server when present (config-driven);
  // fall back to the convention if the config has no steps glob.
  const patterns = stepGlobs.length > 0 ? stepGlobs : ['**/*.steps.ts']
  const seen = new Set<string>()
  const out: Uri[] = []
  for (const pattern of patterns) {
    const found = await workspace.findFiles(pattern, '**/node_modules/**')
    for (const u of found) {
      const key = u.toString()
      if (!seen.has(key)) {
        seen.add(key)
        out.push(u)
      }
    }
  }
  return out
}

async function appendSnippet(uri: Uri, snippet: string): Promise<void> {
  const doc = await workspace.openTextDocument(uri)
  const edit = new WorkspaceEdit()
  // Append at the very end of the file with a leading blank line separator.
  const sep = doc.lineCount > 0 && doc.lineAt(doc.lineCount - 1).text.length > 0 ? '\n\n' : '\n'
  const end = new Position(doc.lineCount, 0)
  edit.insert(uri, end, `${sep}${snippet}`)
  await workspace.applyEdit(edit)
  await doc.save()
}

// -----------------------------------------------------------------------------
// Rename: F2 on a matched step in .bdd.md OR on a step('...') expression
// literal in .steps.ts triggers a cross-file refactor. v1 handles the
// "literals only changed" case — same parameter count/order. Param add/remove
// is rejected with a friendly message in this phase; phase 4 will prompt
// per-occurrence for adds and strip for removes.
// -----------------------------------------------------------------------------

type StepAtMatch = {
  readonly uri: string
  readonly range: LspRange
  readonly paramRanges: ReadonlyArray<LspRange>
  readonly paramValues: ReadonlyArray<string>
}

type StepAtResult = {
  readonly expression: string
  readonly stepDefUri: string
  readonly expressionRange: LspRange
  readonly matches: ReadonlyArray<StepAtMatch>
} | null

type PlanParamFate =
  | {
      readonly kind: 'kept'
      readonly oldIndex: number
      readonly newIndex: number
      readonly oldName: string
      readonly newName: string
      readonly nameUnchanged: boolean
    }
  | { readonly kind: 'added'; readonly newIndex: number; readonly name: string }
  | { readonly kind: 'removed'; readonly oldIndex: number; readonly name: string }

type HandlerSyncEdit = {
  readonly uri: string
  readonly range: LspRange
  readonly newText: string
}

type PlanRenameResult =
  | {
      readonly ok: true
      readonly newExpression: string
      readonly paramFates: ReadonlyArray<PlanParamFate>
      readonly stepDef: { readonly uri: string; readonly expressionInnerRange: LspRange }
      readonly matches: ReadonlyArray<{
        readonly uri: string
        readonly range: LspRange
        readonly paramValues: ReadonlyArray<string>
      }>
      readonly handlerSync?: HandlerSyncEdit | undefined
    }
  | { readonly ok: false; readonly error: string }

type RenderTextResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly error: string }

function registerStepRename(
  context: ExtensionContext,
  lspClient: LanguageClient,
  started: Promise<void>,
): void {
  const provider: import('vscode').RenameProvider = {
    async prepareRename(document, position) {
      await started
      const at = await lspClient.sendRequest<StepAtResult>('bdd/stepAt', {
        uri: document.uri.toString(),
        position: { line: position.line, character: position.character },
      })
      if (!at) {
        throw new Error('Place the cursor on a matched step or a step() expression first.')
      }
      // What VSCode pre-fills the inline editor with:
      //   - in .bdd.md: the matched substring (a sentence)
      //   - in .steps.ts: the cucumber expression literal WITHOUT its quotes
      if (document.fileName.endsWith('.bdd.md')) {
        const m = at.matches.find((m) => m.uri === document.uri.toString())
        if (!m) throw new Error('Internal: no match for the active document.')
        return {
          range: toVscodeRange(m.range),
          placeholder: document.getText(toVscodeRange(m.range)),
        }
      }
      const inner = innerStringRange(document, toVscodeRange(at.expressionRange))
      return { range: inner, placeholder: document.getText(inner) }
    },
    async provideRenameEdits(document, position, newName) {
      await started
      const plan = await lspClient.sendRequest<PlanRenameResult>('bdd/planRename', {
        uri: document.uri.toString(),
        position: { line: position.line, character: position.character },
        newName,
      })
      if (!plan.ok) throw new Error(plan.error)

      const edit = new WorkspaceEdit()
      edit.replace(
        Uri.parse(plan.stepDef.uri),
        toVscodeRange(plan.stepDef.expressionInnerRange),
        plan.newExpression,
      )
      if (plan.handlerSync) {
        edit.replace(
          Uri.parse(plan.handlerSync.uri),
          toVscodeRange(plan.handlerSync.range),
          plan.handlerSync.newText,
        )
      }

      // Walk param fates in the NEW expression's order so we know what value
      // each new-side parameter wants. For each match, build the values list
      // and call the server-side renderer.
      const orderedNew = plan.paramFates
        .filter((f): f is Exclude<PlanParamFate, { kind: 'removed' }> => f.kind !== 'removed')
        .sort((a, b) => a.newIndex - b.newIndex)

      for (const site of plan.matches) {
        const relPath = workspace.asRelativePath(Uri.parse(site.uri))
        const values: string[] = []
        for (const fate of orderedNew) {
          if (fate.kind === 'kept' && fate.nameUnchanged) {
            values.push(site.paramValues[fate.oldIndex] ?? '')
            continue
          }
          // Prompt: either a brand-new parameter or a parameter whose TYPE
          // changed (old value not safely reusable). Cancellation aborts.
          const prompt =
            fate.kind === 'added'
              ? `Value for new {${fate.name}} in ${relPath}`
              : `Value for {${fate.newName}} (was {${(fate as { oldName: string }).oldName}} = ${
                  site.paramValues[(fate as { oldIndex: number }).oldIndex]
                }) in ${relPath}`
          const answer = await window.showInputBox({
            prompt,
            value:
              fate.kind === 'added'
                ? ''
                : site.paramValues[(fate as { oldIndex: number }).oldIndex] ?? '',
            ignoreFocusOut: true,
          })
          if (answer === undefined) {
            // User pressed Escape — abort the whole rename.
            return undefined
          }
          values.push(answer)
        }
        const rendered = await lspClient.sendRequest<RenderTextResult>(
          'bdd/renderExpressionText',
          { expression: plan.newExpression, values },
        )
        if (!rendered.ok) throw new Error(rendered.error)
        edit.replace(Uri.parse(site.uri), toVscodeRange(site.range), rendered.text)
      }
      return edit
    },
  }

  context.subscriptions.push(
    languages.registerRenameProvider({ scheme: 'file', pattern: '**/*.bdd.md' }, provider),
    languages.registerRenameProvider({ scheme: 'file', pattern: '**/*.steps.ts' }, provider),
  )
}

function innerStringRange(document: TextDocument, fullRange: Range): Range {
  // The string-literal range from the TS AST includes the opening and closing
  // quote characters. Shrink it so the inline rename editor shows only the
  // expression text the user actually wants to edit.
  const text = document.getText(fullRange)
  if (text.length >= 2) {
    const first = text[0]
    const last = text[text.length - 1]
    if ((first === '"' || first === "'" || first === '`') && first === last) {
      return new Range(
        fullRange.start.translate(0, 1),
        fullRange.end.translate(0, -1),
      )
    }
  }
  return fullRange
}

export async function deactivate(): Promise<void> {
  if (client) await client.stop()
}
