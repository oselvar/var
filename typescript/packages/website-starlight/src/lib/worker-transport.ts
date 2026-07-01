import type { Transport } from '@codemirror/lsp-client'

// Structurally, a dedicated MessagePort and a Worker are both fine here —
// this only ever calls postMessage/addEventListener('message', …), which
// both support identically.
type PortLike = Pick<Worker, 'postMessage' | 'addEventListener'>

// @codemirror/lsp-client sends/receives JSON-RPC as strings; the worker's
// BrowserMessageReader/Writer send/receive JSON-RPC as objects via postMessage.
// Bridge by parsing on the way in and stringifying on the way out.
export function workerTransport(port: PortLike): Transport {
  const handlers = new Set<(value: string) => void>()
  port.addEventListener('message', (e: Event) => {
    const text = JSON.stringify((e as MessageEvent).data)
    for (const h of handlers) h(text)
  })
  return {
    send(message: string) {
      port.postMessage(JSON.parse(message))
    },
    subscribe(handler) {
      handlers.add(handler)
    },
    unsubscribe(handler) {
      handlers.delete(handler)
    },
  }
}
