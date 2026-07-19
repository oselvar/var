import { describe, expect, it, vi } from 'vitest'
import { buildWorkspaceIndex } from './index-workspace.ts'
import type { StepDefScanner } from './scanner.ts'

describe('buildWorkspaceIndex scanner injection', () => {
  it('extracts step defs through the injected scanner', () => {
    const scanner: StepDefScanner = {
      discoverStepDefs: vi.fn(() => [
        {
          file: 's.steps.ts',
          expression: 'I greet {string}',
          kind: 'stimulus' as const,
          expressionRange: { start: { line: 1, character: 1 }, end: { line: 1, character: 10 } },
          callRange: { start: { line: 1, character: 1 }, end: { line: 1, character: 10 } },
        },
      ]),
      discoverParameterTypes: vi.fn(() => []),
    }
    const index = buildWorkspaceIndex({
      stepFiles: [{ path: 's.steps.ts', source: 'IGNORED BY FAKE' }],
      varFiles: [{ path: 'a.md', source: 'First I greet "world"' }],
      scanner,
    })
    expect(scanner.discoverStepDefs).toHaveBeenCalledOnce()
    expect(index.matches.length).toBeGreaterThan(0)
  })
})
