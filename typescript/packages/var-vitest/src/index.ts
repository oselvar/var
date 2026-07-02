export type { VarConfig } from '@oselvar/var-config'
export type { VarDoc } from '@oselvar/var-core'
export { readVarConfig } from '@oselvar/var-runner'
export type { GenerateInput, VarVitestPluginOptions } from './plugin.js'
export { generateVirtualModule } from './plugin.js'
export type { CollectedExample, CollectPorts } from './runtime.js'
export { collectVarExamples } from './runtime.js'
export const VERSION = '0.0.0'

import { varVitestPlugin } from './plugin.js'
export default varVitestPlugin
