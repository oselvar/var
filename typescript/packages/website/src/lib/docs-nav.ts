import { AREAS, type Area, type AreaId } from './docs-areas'

export type { AreaId } from './docs-areas'

// Minimal shape needed from a docs collection entry. Kept independent of
// astro:content types so these functions stay pure and unit-testable.
export interface DocEntry {
  readonly id: string
  readonly area: AreaId
  readonly order: number
  readonly title: string
}

export interface NavLink {
  readonly id: string
  readonly title: string
  readonly href: string
  readonly current: boolean
}

export interface NavGroup {
  readonly area: Area
  readonly links: ReadonlyArray<NavLink>
}

export interface Breadcrumb {
  readonly area: Area
  readonly title: string
}

export function docHref(base: string, id: string): string {
  return `${base}/docs/${id}`
}

function sortedAreaEntries(
  entries: ReadonlyArray<DocEntry>,
  area: AreaId,
): ReadonlyArray<DocEntry> {
  return entries.filter((e) => e.area === area).sort((a, b) => a.order - b.order)
}

export function buildNav(
  entries: ReadonlyArray<DocEntry>,
  base: string,
  currentId: string | null,
): ReadonlyArray<NavGroup> {
  return AREAS.map((area) => ({
    area,
    links: sortedAreaEntries(entries, area.id).map((e) => ({
      id: e.id,
      title: e.title,
      href: docHref(base, e.id),
      current: e.id === currentId,
    })),
  }))
}

export function breadcrumbFor(entry: DocEntry): Breadcrumb {
  const area = AREAS.find((a) => a.id === entry.area)
  if (!area) throw new Error(`Unknown area: ${entry.area}`)
  return { area, title: entry.title }
}

export function nextInArea(
  entries: ReadonlyArray<DocEntry>,
  base: string,
  currentId: string,
): NavLink | null {
  const current = entries.find((e) => e.id === currentId)
  if (!current) return null
  const sameArea = sortedAreaEntries(entries, current.area)
  const idx = sameArea.findIndex((e) => e.id === currentId)
  const next = sameArea[idx + 1]
  if (!next) return null
  return { id: next.id, title: next.title, href: docHref(base, next.id), current: false }
}
