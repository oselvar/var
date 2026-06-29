import { getCollection } from 'astro:content'
import type { DocEntry } from './docs-nav'

// Imperative shell: reads the docs collection and maps entries to the pure
// DocEntry shape the nav library operates on.
export async function loadDocEntries(): Promise<ReadonlyArray<DocEntry>> {
  const docs = await getCollection('docs')
  return docs.map((d) => ({
    id: d.id,
    area: d.data.area,
    order: d.data.order,
    title: d.data.title,
  }))
}
