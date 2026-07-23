import type { VarDoc } from './ast.ts'
import { scan } from './scanner.ts'
import { structure } from './structurer.ts'

export function parse(path: string, source: string): VarDoc {
  return structure(path, source, scan(source))
}
