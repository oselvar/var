import { expectTypeOf, test } from 'vitest'
import type {
  Block,
  Blockquote,
  Fence,
  Heading,
  ListItem,
  Paragraph,
  Row,
  Table,
  ThematicBreak,
} from '../src/ast.js'

test('Block includes all v1 block kinds', () => {
  expectTypeOf<Block>().toEqualTypeOf<
    Heading | Paragraph | ListItem | Blockquote | Table | Fence | ThematicBreak
  >()
})

test('Table rows are readonly arrays of readonly cells', () => {
  expectTypeOf<Table['rows']>().toEqualTypeOf<ReadonlyArray<Row>>()
  expectTypeOf<Row['cells']>().toEqualTypeOf<ReadonlyArray<string>>()
})

test('Fence carries info string and body', () => {
  expectTypeOf<Fence>().toMatchTypeOf<{
    readonly kind: 'fence'
    readonly info: string
    readonly body: string
  }>()
})
