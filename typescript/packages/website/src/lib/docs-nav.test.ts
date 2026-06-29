import { describe, expect, it } from 'vitest'
import { breadcrumbFor, buildNav, type DocEntry, docHref, nextInArea } from './docs-nav'

const base = '/var'

const entries: ReadonlyArray<DocEntry> = [
  { id: 'concepts/why-var', area: 'concepts', order: 1, title: 'Why Vár' },
  { id: 'start-here/hello-var', area: 'start-here', order: 1, title: 'Hello Vár' },
  { id: 'guides/drive-feature', area: 'guides', order: 2, title: 'Drive a feature' },
  { id: 'guides/wire-var', area: 'guides', order: 1, title: 'Wire Vár' },
]

describe('docHref', () => {
  it('prefixes the base and docs path', () => {
    expect(docHref(base, 'guides/wire-var')).toBe('/var/docs/guides/wire-var')
  })
})

describe('buildNav', () => {
  it('returns the four areas in fixed reading order', () => {
    const nav = buildNav(entries, base, null)
    expect(nav.map((g) => g.area.id)).toEqual(['start-here', 'guides', 'reference', 'concepts'])
  })

  it('sorts links within an area by order', () => {
    const nav = buildNav(entries, base, null)
    const guides = nav.find((g) => g.area.id === 'guides')!
    expect(guides.links.map((l) => l.title)).toEqual(['Wire Vár', 'Drive a feature'])
  })

  it('builds base-prefixed hrefs', () => {
    const nav = buildNav(entries, base, null)
    const start = nav.find((g) => g.area.id === 'start-here')!
    expect(start.links[0].href).toBe('/var/docs/start-here/hello-var')
  })

  it('marks only the current page', () => {
    const nav = buildNav(entries, base, 'guides/wire-var')
    const current = nav.flatMap((g) => g.links).filter((l) => l.current)
    expect(current.map((l) => l.id)).toEqual(['guides/wire-var'])
  })

  it('leaves areas with no entries empty', () => {
    const nav = buildNav(entries, base, null)
    const reference = nav.find((g) => g.area.id === 'reference')!
    expect(reference.links).toEqual([])
  })
})

describe('breadcrumbFor', () => {
  it('resolves the area and page title', () => {
    const crumb = breadcrumbFor(entries[1])
    expect(crumb.area.label).toBe('Start here')
    expect(crumb.title).toBe('Hello Vár')
  })
})

describe('nextInArea', () => {
  it('returns the next page in the same area by order', () => {
    const next = nextInArea(entries, base, 'guides/wire-var')
    expect(next?.title).toBe('Drive a feature')
    expect(next?.href).toBe('/var/docs/guides/drive-feature')
  })

  it('returns null for the last page in an area', () => {
    expect(nextInArea(entries, base, 'guides/drive-feature')).toBeNull()
  })

  it('returns null for an unknown id', () => {
    expect(nextInArea(entries, base, 'nope/nope')).toBeNull()
  })
})
