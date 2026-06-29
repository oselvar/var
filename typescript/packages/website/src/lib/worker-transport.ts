import type { Transport } from '@codemirror/lsp-client'

// @codemirror/lsp-client sends/receives JSON-RPC as strings; the worker's
// BrowserMessageReader/Writer send/receive JSON-RPC as objects via postMessage.
// Bridge by parsing on the way in and stringifying on the way out.
export function workerTransport(worker: Worker): Transport {
  const handlers = new Set<(value: string) => void>()
  worker.addEventListener('message', (e: MessageEvent) => {
    const text = JSON.stringify(e.data)
    for (const h of handlers) h(text)
  })
  return {
    send(message: string) {
      worker.postMessage(JSON.parse(message))
    },
    subscribe(handler) {
      handlers.add(handler)
    },
    unsubscribe(handler) {
      handlers.delete(handler)
    },
  }
}
