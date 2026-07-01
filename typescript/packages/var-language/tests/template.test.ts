import { expect, test } from 'vitest'
import { renderTemplate } from '../src/template.js'

test('substitutes {{name}} placeholders from vars', () => {
  expect(renderTemplate('Hello {{name}}!', { name: 'world' })).toBe('Hello world!')
})

test('supports multiple distinct placeholders', () => {
  const out = renderTemplate('step({{expression}}, {{args}})', {
    expression: "'I have {int} cukes'",
    args: 'ctx, count: number',
  })
  expect(out).toBe("step('I have {int} cukes', ctx, count: number)")
})

test('replaces every occurrence of the same placeholder', () => {
  expect(renderTemplate('{{x}}/{{x}}/{{x}}', { x: 'a' })).toBe('a/a/a')
})

test('missing keys become empty strings (no throw)', () => {
  expect(renderTemplate('a={{a}} b={{b}}', { a: '1' })).toBe('a=1 b=')
})

test('tolerates whitespace inside the braces', () => {
  expect(renderTemplate('Hello {{ name }}!', { name: 'world' })).toBe('Hello world!')
})

test('leaves text without placeholders untouched', () => {
  expect(renderTemplate('just plain text', {})).toBe('just plain text')
})

test('does not substitute single braces', () => {
  expect(renderTemplate('{not a placeholder}', { 'not a placeholder': 'x' })).toBe(
    '{not a placeholder}',
  )
})
