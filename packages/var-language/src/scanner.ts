import {
  discoverParameterTypes,
  discoverStepDefs,
  type ParameterTypeDef,
  type StepDef,
} from './step-defs.js'

export interface StepDefScanner {
  discoverStepDefs(path: string, source: string): ReadonlyArray<StepDef>
  discoverParameterTypes(path: string, source: string): ReadonlyArray<ParameterTypeDef>
}

// Default scanner: the existing TypeScript-compiler-based parser. A lighter
// browser scanner (e.g. tsgo-wasm) can implement the same interface later.
export function createTypeScriptScanner(): StepDefScanner {
  return {
    discoverStepDefs: (path, source) => discoverStepDefs(path, source),
    discoverParameterTypes: (path, source) => discoverParameterTypes(path, source),
  }
}
