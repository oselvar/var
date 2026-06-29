#!/usr/bin/env node
import { loadVarConfig } from '@oselvar/var-core/node'
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node'
import { createNodeFileSystem } from './node-file-system.js'
import { registerHandlers } from './server.js'

const connection = createConnection(ProposedFeatures.all)
registerHandlers(connection, async (rootUri) => {
  const root = (rootUri ?? process.cwd()).replace(/^file:\/\//, '')
  return { fs: createNodeFileSystem(root), config: await loadVarConfig(root) }
})
connection.listen()
