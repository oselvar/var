export type { GenerateInput, VararVitestPluginOptions } from './plugin.ts'
export { generateVirtualModule } from './plugin.ts'
export type { CollectedExample, CollectPorts } from './runtime.ts'
export { collectVararExamples } from './runtime.ts'
export const VERSION = '0.7.0'

import { vararVitestPlugin } from './plugin.ts'
export default vararVitestPlugin
