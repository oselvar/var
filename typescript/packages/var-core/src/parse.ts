import type { VarDoc } from './ast.js'
import { type ScannerPlugin, scan } from './scanner.js'
import { structure } from './structurer.js'

export function parse(
  path: string,
  source: string,
  plugins: ReadonlyArray<ScannerPlugin> = [],
): VarDoc {
  return structure(path, source, scan(source, plugins))
}
