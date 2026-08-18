// Which territories the map shows, given the filter the publisher picked.
// Pure decision logic — no MapLibre, no view code — so the map screen (Task
// 25) only has to call `visibleTerritories` and draw whatever comes back.
import type { Territory } from '../../domain/models'
import { isTerritoryAssignedToMe } from '../../domain/assignment'

/**
 * The map's filter state: the publisher's own territory/territories, every
 * territory in the congregation, or one picked by id.
 */
export type MapFilter =
  | { mode: 'assigned' }
  | { mode: 'all' }
  | { mode: 'specific'; territoryId: string }

/**
 * Applies `filter` to `all`. `'specific'` with an id that matches nothing
 * returns an empty list rather than throwing — the territory may have been
 * unassigned or deleted since the filter was picked.
 */
export function visibleTerritories(
  all: Territory[],
  filter: MapFilter,
  myUserId: string
): Territory[] {
  switch (filter.mode) {
    case 'assigned':
      return all.filter((territory) => isTerritoryAssignedToMe(territory, myUserId))
    case 'all':
      return all
    case 'specific':
      return all.filter((territory) => territory.id === filter.territoryId)
  }
}

/**
 * The map screen's initial filter: `'assigned'` when the publisher has at
 * least one territory assigned to them, `'all'` otherwise — opening on
 * `'assigned'` with nothing assigned would show an empty map for no reason.
 */
export function defaultFilter(all: Territory[], myUserId: string): MapFilter {
  const hasAssignment = all.some((territory) => isTerritoryAssignedToMe(territory, myUserId))
  return hasAssignment ? { mode: 'assigned' } : { mode: 'all' }
}
