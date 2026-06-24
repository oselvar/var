import { expectTypeOf, test } from 'vitest'
import type { Block, Example, Heading, Paragraph, VarDoc } from '../src/ast.js'

test('Block is a discriminated union of Heading and Paragraph (Task 3 scope)', () => {
  expectTypeOf<Block>().toEqualTypeOf<Heading | Paragraph>()
})

test('Heading carries level and text', () => {
  expectTypeOf<Heading>().toMatchTypeOf<{
    readonly kind: 'heading'
    readonly level: 1 | 2 | 3 | 4 | 5 | 6
    readonly text: string
  }>()
})

test('VarDoc has readonly examples array', () => {
  expectTypeOf<VarDoc['examples']>().toEqualTypeOf<ReadonlyArray<Example>>()
})
