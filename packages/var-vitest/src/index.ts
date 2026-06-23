export type { VarDoc } from '@oselvar/var'
export { step, defineContext, defineParameterType } from './api.js'
export type { Step } from './api.js'
export { loadVarConfig } from '@oselvar/var/node'
export type { VarConfig } from '@oselvar/var'
export { runVarSource } from './runtime.js'
export type { RunPorts } from './runtime.js'
export { varVitestPlugin, generateVirtualModule } from './plugin.js'
export type { VarVitestPluginOptions, GenerateInput } from './plugin.js'
export const VERSION = '0.0.0'

import { varVitestPlugin } from './plugin.js'
export default varVitestPlugin
