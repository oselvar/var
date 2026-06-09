import { CucumberExpression, ParameterTypeRegistry } from '@cucumber/cucumber-expressions'

export type StepHandler = (ctx: unknown, ...args: ReadonlyArray<unknown>) => void | Promise<void>

export type StepRegistration = {
  readonly expression: string
  readonly expressionSourceFile: string
  readonly expressionSourceLine: number
  readonly handler: StepHandler
  readonly compiled: CucumberExpression
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
