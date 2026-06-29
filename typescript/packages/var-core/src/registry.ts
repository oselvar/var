import {
  CucumberExpression,
  ParameterType,
  ParameterTypeRegistry,
} from '@cucumber/cucumber-expressions'
import type { StepKind } from './step-role.js'

export type StepHandler = (
  ctx: unknown,
  ...args: ReadonlyArray<unknown>
) => unknown | Promise<unknown>

export type StepRegistration = {
  readonly expression: string
  readonly expressionSourceFile: string
  readonly expressionSourceLine: number
  readonly handler: StepHandler
  readonly compiled: CucumberExpression
  readonly kind?: StepKind
}

export type Registry = {
  readonly steps: ReadonlyArray<StepRegistration>
  readonly parameterTypes: ParameterTypeRegistry
}

export function createRegistry(): Registry {
  return { steps: [], parameterTypes: new ParameterTypeRegistry() }
}

export type StepInput = Omit<StepRegistration, 'compiled'>

export function addStep(registry: Registry, input: StepInput): Registry {
  const duplicate = registry.steps.find((s) => s.expression === input.expression)
  if (duplicate) {
    throw new Error(
      `duplicate step definition for "${input.expression}" at ${duplicate.expressionSourceFile}:${duplicate.expressionSourceLine} and ${input.expressionSourceFile}:${input.expressionSourceLine}`,
    )
  }
  const compiled = new CucumberExpression(input.expression, registry.parameterTypes)
  const next: StepRegistration = { ...input, compiled }
  return { steps: [...registry.steps, next], parameterTypes: registry.parameterTypes }
}

export type ParameterTypeInput<T = unknown> = {
  readonly name: string
  readonly regexp: RegExp | string | ReadonlyArray<RegExp | string>
  // Identity by default — turns the matched substring into the handler's
  // argument. Override to coerce (e.g. number, Date, domain object).
  readonly transformer?: (...groups: string[]) => T
  // Whether this type can be auto-suggested when generating a snippet from
  // arbitrary text. Defaults to true.
  readonly useForSnippets?: boolean
  // Take priority over built-in {string}/{int}/etc. when generating a regex
  // for an existing string match. Rarely needed.
  readonly preferForRegexpMatch?: boolean
}

export function defineParameterType<T = unknown>(
  registry: Registry,
  input: ParameterTypeInput<T>,
): Registry {
  // ParameterTypeRegistry.defineParameterType mutates in place; the registry
  // object reference is intentionally shared across all step compilations.
  const pt = new ParameterType<T>(
    input.name,
    input.regexp as RegExp | string | RegExp[] | string[],
    null,
    input.transformer ?? ((raw: string) => raw as unknown as T),
    input.useForSnippets ?? true,
    input.preferForRegexpMatch ?? false,
    false,
  )
  registry.parameterTypes.defineParameterType(pt)
  return registry
}
