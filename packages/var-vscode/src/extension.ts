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
  // The symlink installer (T8) mirrors `packages/var-vscode/` into
  // ~/.vscode/extensions/. Resolve the symlink before walking `..` so we land
  // at the real `packages/` directory; otherwise we'd point at
  // `~/.vscode/extensions/var-lsp/dist/bin.js`, which doesn't exist.
  const extReal = realpathSync(context.extensionPath)
  const serverModule = resolve(extReal, '..', 'var-lsp', 'dist', 'bin.js')
  // `@oselvar/var`'s `exports.import` points at `src/index.ts` so we can run
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
      { scheme: 'file', pattern: '**/*.var.md' },
      { scheme: 'file', pattern: '**/*.steps.ts' },
    ],
  }
  client = new LanguageClient('oselvar-var', 'Vár', serverOptions, clientOptions)
  const started = client.start()
  registerGenerateStepDefinition(context, client, started)
  registerGenerateCodeAction(context)
  registerStepRename(context, client, started)
}

type LspRange = {
  readonly start: { readonly line: number; readonly character: number }
  readonly end: { readonly line: number; readonly character: number }
}

function toVscodeRange(r: LspRange): Range {
  return new Range(r.start.line, r.start.character, r.end.line, r.end.character)
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
        command: 'oselvar-var.generateStepDefinition',
        title: 'Generate Step Definition',
      }
      return [action]
    },
  }
  context.subscriptions.push(
    languages.registerCodeActionsProvider(
      { scheme: 'file', pattern: '**/*.var.md' },
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
  const cmd = commands.registerCommand('oselvar-var.generateStepDefinition', async () => {
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
        'var/generateSnippet',
        { text },
      ),
      lspClient.sendRequest<ReadonlyArray<string>>('var/stepGlobs'),
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
// Rename: F2 on a matched step in .var.md OR on a step('...') expression
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
      const at = await lspClient.sendRequest<StepAtResult>('var/stepAt', {
        uri: document.uri.toString(),
        position: { line: position.line, character: position.character },
      })
      if (!at) {
        throw new Error('Place the cursor on a matched step or a step() expression first.')
      }
      // What VSCode pre-fills the inline editor with:
      //   - in .var.md: the matched substring (a sentence)
      //   - in .steps.ts: the cucumber expression literal WITHOUT its quotes
      if (document.fileName.endsWith('.var.md')) {
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
      const plan = await lspClient.sendRequest<PlanRenameResult>('var/planRename', {
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
          'var/renderExpressionText',
          { expression: plan.newExpression, values },
        )
        if (!rendered.ok) throw new Error(rendered.error)
        edit.replace(Uri.parse(site.uri), toVscodeRange(site.range), rendered.text)
      }
      return edit
    },
  }

  context.subscriptions.push(
    languages.registerRenameProvider({ scheme: 'file', pattern: '**/*.var.md' }, provider),
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
