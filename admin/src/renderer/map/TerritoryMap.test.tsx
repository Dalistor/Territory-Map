// react-leaflet is stubbed here rather than rendered for real: a Leaflet map
// needs a laid-out container jsdom does not provide, and what this test is
// about is the *decision* `TerritoryMap` makes -- which colour each block is
// drawn in -- not how Leaflet paints it. The stubs expose the same props the
// component passes, so the assertion still reads off the rendered output.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PathOptions } from 'leaflet'
import type { Block, Territory } from '../../shared/models'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  Polygon: ({ positions, pathOptions }: { positions: unknown; pathOptions?: PathOptions }) => (
    <div
      data-testid="polygon"
      data-color={pathOptions?.color}
      data-points={(positions as unknown[]).length}
    />
  ),
  useMapEvents: () => null
}))

const { CATEGORY_COLOR } = await import('./blockColor')
const { TerritoryMap } = await import('./TerritoryMap')

const NOW = new Date(2026, 7, 19)
const DAY_MS = 24 * 60 * 60 * 1000

const RING = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 1 },
  { lat: 1, lng: 1 }
]

function makeBlock(daysAgo: number): Block {
  return {
    id: 'block-1',
    number: 1,
    polygon: RING,
    lastWorkedAt: new Date(NOW.getTime() - daysAgo * DAY_MS)
  }
}

function makeTerritory(block: Block, rotationDays?: number): Territory {
  return { id: 'territory-1', name: 'Centro', boundary: RING, blocks: [block], rotationDays }
}

/** The block polygon is the second one drawn -- the territory outline comes first. */
function blockColor(): string | null {
  const polygons = screen.getAllByTestId('polygon')
  return polygons[polygons.length - 1]?.getAttribute('data-color') ?? null
}

describe('TerritoryMap block colours', () => {
  it('draws a block worked 45 days ago as overdue when the territory rotates every 30 days', () => {
    render(<TerritoryMap territories={[makeTerritory(makeBlock(45), 30)]} now={NOW} />)

    expect(blockColor()).toBe(CATEGORY_COLOR.overdue)
  })

  it('draws the same block as recent when the territory has no rotation configured', () => {
    render(<TerritoryMap territories={[makeTerritory(makeBlock(45))]} now={NOW} />)

    expect(blockColor()).toBe(CATEGORY_COLOR.recent)
  })
})
