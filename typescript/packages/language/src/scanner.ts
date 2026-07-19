import type { ParameterTypeDef, StepDef } from './step-defs.ts'

// The port every step-def extractor implements. The only implementation is the
// tree-sitter scanner (createTreeSitterScanner) — one extractor mechanism for
// every language, TypeScript included.
export interface StepDefScanner {
  discoverStepDefs(path: string, source: string): ReadonlyArray<StepDef>
  discoverParameterTypes(path: string, source: string): ReadonlyArray<ParameterTypeDef>
}
