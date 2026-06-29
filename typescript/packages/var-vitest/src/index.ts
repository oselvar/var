export type { VarConfig, VarDoc } from '@oselvar/var-core'
export { loadVarConfig } from '@oselvar/var-core/node'
export type { GenerateInput, VarVitestPluginOptions } from './plugin.js'
export { generateVirtualModule } from './plugin.js'
export type { RunPorts } from './runtime.js'
export { runVarSource } from './runtime.js'
export const VERSION = '0.0.0'

import { varVitestPlugin } from './plugin.js'
export default varVitestPlugin
