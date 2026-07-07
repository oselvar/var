import { expect, test } from 'vitest'
import { _callerLocationFromStack } from '../src/registry.ts'

// Real-world stack shapes for the browser worker: the package is bundled into
// one chunk (`run-worker-*.js`) whose frames contain NO `/var/src/internal`
// substring, while the step file is eval'd with `//# sourceURL=library.steps.ts`
// so its frame reports that clean path. The registered sourceFile MUST resolve
// to the steps file for BOTH call depths (steps directly from the module,
// and stimulus → registerStep), otherwise the context factory keys mismatch and
// the state factory is lost (`state.loans is undefined`).

test('V8 bundled: steps and registerStep both resolve to the steps file', () => {
  // Chrome/V8 prefixes an `Error: locate` header line.
  const stepsStack = [
    'Error: locate',
    '    at Pr (http://localhost:4321/_astro/run-worker-abc.js:1:1000)',
    '    at Ar (http://localhost:4321/_astro/run-worker-abc.js:1:1100)', // steps
    '    at library.steps.ts:8:20',
    '    at Ir (http://localhost:4321/_astro/run-worker-abc.js:1:2000)',
  ].join('\n')
  const registerStepStack = [
    'Error: locate',
    '    at Pr (http://localhost:4321/_astro/run-worker-abc.js:1:1000)',
    '    at Kr (http://localhost:4321/_astro/run-worker-abc.js:1:1200)', // registerStep
    '    at Object.stimulus (http://localhost:4321/_astro/run-worker-abc.js:1:1250)',
    '    at library.steps.ts:47:5',
  ].join('\n')

  expect(_callerLocationFromStack(stepsStack)).toEqual({
    sourceFile: 'library.steps.ts',
    sourceLine: 8,
  })
  expect(_callerLocationFromStack(registerStepStack)).toEqual({
    sourceFile: 'library.steps.ts',
    sourceLine: 47,
  })
})

test('Firefox bundled (no Error header): both depths resolve to the steps file', () => {
  // The regression: Firefox/SpiderMonkey stacks have no header line, so a blind
  // `.slice(1)` used to drop callerLocation's own frame and expose the differing
  // steps vs registerStep frames.
  const stepsStack = [
    'Pr@http://localhost:4321/_astro/run-worker-abc.js:1:1000',
    'Ar@http://localhost:4321/_astro/run-worker-abc.js:1:1100',
    '@library.steps.ts:8:20',
  ].join('\n')
  const registerStepStack = [
    'Pr@http://localhost:4321/_astro/run-worker-abc.js:1:1000',
    'Kr@http://localhost:4321/_astro/run-worker-abc.js:1:1200',
    'stimulus@http://localhost:4321/_astro/run-worker-abc.js:1:1250',
    '@library.steps.ts:47:5',
  ].join('\n')

  expect(_callerLocationFromStack(stepsStack)).toEqual({
    sourceFile: 'library.steps.ts',
    sourceLine: 8,
  })
  expect(_callerLocationFromStack(registerStepStack)).toEqual({
    sourceFile: 'library.steps.ts',
    sourceLine: 47,
  })
})

test('unbundled dist (V8): skips internal frames, returns the caller module', () => {
  const stack = [
    'Error: locate',
    '    at callerLocation (/repo/typescript/packages/var/dist/internal.js:400:15)',
    '    at registerStep (/repo/typescript/packages/var/dist/internal.js:30:20)',
    '    at Object.stimulus (/repo/typescript/packages/var/dist/internal.js:250:10)',
    '    at /repo/app/tests/library.steps.ts:45:3',
  ].join('\n')
  expect(_callerLocationFromStack(stack)).toEqual({
    sourceFile: '/repo/app/tests/library.steps.ts',
    sourceLine: 45,
  })
})

test('empty/garbage stack yields <unknown>', () => {
  expect(_callerLocationFromStack('')).toEqual({ sourceFile: '<unknown>', sourceLine: 0 })
})
