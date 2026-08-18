// Whether the logged-in publisher is the one responsible for a territory —
// the gate the map screen and the block-marking flow both check before
// letting anything be drawn or confirmed.
import type { Territory } from './models'

/**
 * `true` only when `territory` has an `assignedUser` and its `id` matches
 * `userId`. `false` when nobody is assigned, and `false` when someone else
 * is.
 */
export function isTerritoryAssignedToMe(territory: Territory, userId: string): boolean {
  return territory.assignedUser?.id === userId
}
