import type { RunResults } from './run-types.ts'

export type RunInput = {
  varPath: string
  varSource: string
  stepFiles: ReadonlyArray<{ path: string; source: string }>
  exampleIndex?: number
}

let worker: Worker | null = null

function spawn(): Worker {
  worker = new Worker(new URL('./run-worker.ts', import.meta.url), { type: 'module' })
  return worker
}

export function runSpec(input: RunInput, timeoutMs = 5000): Promise<RunResults> {
  const w = worker ?? spawn()
  return new Promise<RunResults>((resolve, reject) => {
    const timer = setTimeout(() => {
      w.terminate()
      worker = null
      reject(new Error(`run timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    w.onmessage = (e: MessageEvent<RunResults>) => {
      clearTimeout(timer)
      resolve(e.data)
    }
    w.onerror = (e) => {
      clearTimeout(timer)
      w.terminate()
      worker = null
      reject(new Error(e.message))
    }
    w.postMessage(input)
  })
}
