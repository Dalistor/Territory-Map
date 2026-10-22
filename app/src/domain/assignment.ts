// Whether the logged-in publisher may work a territory -- the gate the map
// screen and the block-marking flow both check before letting a block be
// confirmed. It mirrors the server's own refusal (`403 territory_not_assigned`,
// `WorkLogService`): getting it wrong in either direction either offers a
// confirmation the server will refuse, or hides one it would accept.
import type { Campaign, Territory } from './models'

/**
 * `true` only when `territory` has an `assignedUser` and its `id` matches
 * `userId`. `false` when nobody is assigned, and `false` when someone else
 * is. Says nothing about campaigns -- it answers "is this my individual
 * designation?", which is what the dashboard's list and the map's
 * "Designado a você" badge show.
 */
export function isTerritoryAssignedToMe(territory: Territory, userId: string): boolean {
  return territory.assignedUser?.id === userId
}

/**
 * The campaign among `myCampaigns` that includes `territory`, or `undefined`.
 * `myCampaigns` is what `GET /app/campaigns` answered: only the active
 * campaigns this publisher is designated to, so a match is a permission.
 */
export function myCampaignHolding(
  territory: Territory,
  myCampaigns: readonly Campaign[]
): Campaign | undefined {
  return myCampaigns.find((campaign) => campaign.territoryIds.includes(territory.id))
}

/**
 * Whether the publisher may mark blocks of `territory` as worked: the
 * territory is designated to them individually, or it belongs to one of
 * their active campaigns. Same two paths, and only these two, the server
 * accepts.
 */
export function canMarkBlocksOf(
  territory: Territory,
  userId: string,
  myCampaigns: readonly Campaign[]
): boolean {
  return (
    isTerritoryAssignedToMe(territory, userId) ||
    myCampaignHolding(territory, myCampaigns) !== undefined
  )
}
