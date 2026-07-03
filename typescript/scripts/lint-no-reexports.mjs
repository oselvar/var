#!/usr/bin/env node
// Architecture gate: a package must never re-export another package's API.
// Consumers import each package's types and functions from the package that
// defines them — re-exports create parallel import paths, hide real
// dependencies (a package can reach functionality it never declares), and
// grow the public API surface beyond the minimum.
//
// Two forms are rejected in packages/*/src:
//   1. export ... from '<bare specifier>'        (including `export * from`)
//   2. import { x } from '<bare specifier>' ... export { x }
//
// Relative re-exports (export { x } from './x.js') are the normal way a
// package assembles its own entry point and are allowed. A package's own
// subpaths (e.g. '@oselvar/var-vitest/runtime' from inside var-vitest) count
// as self, not cross-package.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGES_DIR = join(ROOT, 'packages')

function tsFilesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.d.ts'))
    .map((e) => join(e.parentPath, e.name))
}

function isBare(specifier) {
  return !specifier.startsWith('./') && !specifier.startsWith('../')
}

function isSelf(specifier, ownName) {
  return specifier === ownName || specifier.startsWith(`${ownName}/`)
}

function checkFile(path, ownName) {
  const sourceFile = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ESNext)
  const violations = []
  const violate = (node, message) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    violations.push(`${relative(ROOT, path)}:${line + 1} ${message}`)
  }
  const foreign = (specifier) => isBare(specifier) && !isSelf(specifier, ownName)

  // Local binding name -> the bare specifier it was imported from.
  const importedFrom = new Map()
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue
    const specifier = stmt.moduleSpecifier.text
    if (!foreign(specifier)) continue
    const clause = stmt.importClause
    if (!clause) continue
    if (clause.name) importedFrom.set(clause.name.text, specifier)
    if (clause.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        importedFrom.set(clause.namedBindings.name.text, specifier)
      } else {
        for (const el of clause.namedBindings.elements) importedFrom.set(el.name.text, specifier)
      }
    }
  }

  for (const stmt of sourceFile.statements) {
    if (ts.isExportDeclaration(stmt)) {
      if (stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
        const specifier = stmt.moduleSpecifier.text
        if (foreign(specifier)) {
          violate(stmt, `re-exports from '${specifier}'`)
        }
      } else if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          const local = (el.propertyName ?? el.name).text
          const specifier = importedFrom.get(local)
          if (specifier) {
            violate(el, `re-exports '${local}' imported from '${specifier}'`)
          }
        }
      }
    } else if (ts.isExportAssignment(stmt) && ts.isIdentifier(stmt.expression)) {
      const specifier = importedFrom.get(stmt.expression.text)
      if (specifier) {
        violate(stmt, `default-exports '${stmt.expression.text}' imported from '${specifier}'`)
      }
    }
  }
  return violations
}

const violations = []
for (const entry of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const pkgDir = join(PACKAGES_DIR, entry.name)
  let ownName
  try {
    ownName = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).name
  } catch {
    continue
  }
  let files
  try {
    files = tsFilesUnder(join(pkgDir, 'src'))
  } catch {
    continue
  }
  for (const file of files) violations.push(...checkFile(file, ownName))
}

if (violations.length > 0) {
  process.stderr.write(
    `${violations.join('\n')}\n\n` +
      `${violations.length} cross-package re-export(s). Packages must not re-export another ` +
      `package's API — consumers import it from the defining package instead.\n`,
  )
  process.exit(1)
}
process.stdout.write('no cross-package re-exports\n')
