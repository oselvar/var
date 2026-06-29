export type AreaId = 'start-here' | 'guides' | 'reference' | 'concepts'

export interface Area {
  readonly id: AreaId
  readonly label: string
  readonly diataxis: string
}

// Fixed reading order: Start here → Guides → Reference → Concepts.
export const AREAS: ReadonlyArray<Area> = [
  { id: 'start-here', label: 'Start here', diataxis: 'tutorials' },
  { id: 'guides', label: 'Guides', diataxis: 'how-to guides' },
  { id: 'reference', label: 'Reference', diataxis: 'reference' },
  { id: 'concepts', label: 'Concepts', diataxis: 'explanation' },
]
