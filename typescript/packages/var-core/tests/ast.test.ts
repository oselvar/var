import { expectTypeOf, test } from 'vitest'
import type { Block, Example, Heading, Paragraph, VarDoc } from '../src/ast.js'

test('Heading and Paragraph are members of the Block union', () => {
  expectTypeOf<Heading>().toMatchTypeOf<Block>()
  expectTypeOf<Paragraph>().toMatchTypeOf<Block>()
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
