// The domain entities, spelled out to match what the server's Pydantic schemas
// return: `server/app/schemas/territory.py`, `server/app/schemas/block.py`,
// `server/app/schemas/work_log.py` and `server/app/schemas/user.py::ActivateOut`.
// Same spirit as `admin/src/shared/models.ts` — `camelCase` field names,
// `lastWorkedAt?: Date` for "never worked" rather than a sentinel value.
// Parsing these from the API response body lives in `data/api-client.ts`, next
// to the HTTP client that receives it — this file carries no behaviour beyond
// the small set of pure derived predicates below.

/**
 * A position on the globe, `{lat, lng}` named rather than a bare pair — the
 * same shape `admin/src/shared/geo.ts`'s `LatLng` uses, so latitude and
 * longitude can never be silently swapped. Kept local to this module: the app
 * has no other geometry code yet that would justify its own file.
 */
export interface LatLng {
  readonly lat: number
  readonly lng: number
}

/** A congregation, as both clients see it (`CongregationOut`). */
export interface Congregation {
  readonly id: string
  readonly name: string
  readonly city: string
}

/** Just the identity of a publisher (`UserBriefOut`) — enough to greet them by name. */
export interface PublisherBrief {
  readonly id: string
  readonly name: string
}

/**
 * Just the identity of a campaign (`CampaignBriefOut`) -- what a territory
 * carries to say which active campaign holds it.
 */
export interface CampaignBrief {
  readonly id: string
  readonly name: string
}

/**
 * An active campaign the logged-in publisher is designated to
 * (`AppCampaignOut`, `GET /app/campaigns`): a group of territories handed to
 * several publishers at once. Every territory listed in `territoryIds` is
 * one this publisher may mark blocks in, exactly like a territory designated
 * to them alone. Only active campaigns that include this publisher ever come
 * back, so being in this list *is* the permission.
 */
export interface Campaign {
  readonly id: string
  readonly name: string
  /** When the current period of the campaign began -- "desde" on the dashboard card. */
  readonly startedAt: Date
  readonly territoryIds: readonly string[]
}

/** A block, the numbered outline that is the real unit of field work (`BlockOut`). */
/**
 * The two statuses the admin can pin a block to, overriding what its work
 * records say. There is deliberately no third value for "recent": forcing a
 * block to look freshly worked is the one thing nobody asked for, and clearing
 * the override (back to `undefined`) is the way back to the derived status.
 * Same set as `admin/src/shared/models.ts`'s `BlockStatusOverride`.
 */
export type BlockStatusOverride = 'overdue' | 'never'

export interface Block {
  readonly id: string
  readonly number: number
  readonly polygon: LatLng[]
  /** `undefined` means never covered — the state the map has to highlight. */
  readonly lastWorkedAt?: Date
  /**
   * The status the admin forced on this block, which both clients honour above
   * the date calculation. `undefined` (absent) means "derive it from the work
   * records" — the behaviour of every block before the override existed.
   */
  readonly statusOverride?: BlockStatusOverride
}

/**
 * A territory (`TerritoryOut`). `blocks` defaults to empty on the listing
 * endpoint and is populated on the detail one. `assignedUser` is `undefined`
 * when nobody is currently responsible for it.
 */
export interface Territory {
  readonly id: string
  readonly name: string
  readonly boundary: LatLng[]
  readonly blocks: Block[]
  readonly assignedUser?: PublisherBrief
  /**
   * How many days a full rotation of this territory takes: once a block has
   * gone longer than this without being worked, it shows as overdue on the
   * map. `undefined` (absent) means the territory uses the default rotation
   * (`DEFAULT_ROTATION_DAYS` in `blockColor.ts`), which is what every
   * territory did before the admin could configure the setting.
   */
  readonly rotationDays?: number
  /**
   * The active campaign holding this territory, if any. While a campaign
   * holds it, `assignedUser` is always `undefined`: the campaign replaced the
   * individual designation, and who may mark it is answered by the
   * publisher's own campaigns (`canMarkBlocksOf` in `assignment.ts`).
   */
  readonly campaign?: CampaignBrief
}

/**
 * One territory the publisher has worked at least once, for their dashboard
 * (`WorkedTerritoryOut`). `lastWorkedAt` is never absent — this only ever
 * describes a territory with at least one work log for the publisher.
 */
export interface WorkedTerritory {
  readonly id: string
  readonly name: string
  readonly lastWorkedAt: Date
}

/**
 * A successful code redemption (`ActivateOut`): the permanent app token, plus
 * who and where the publisher is. What `data/session-store.ts` persists in
 * the keychain.
 */
export interface Session {
  readonly token: string
  readonly user: PublisherBrief
  readonly congregation: Congregation
}

/**
 * One block work log record for the publisher's work history timeline (`PublisherWorkHistoryItemOut`).
 */
export interface PublisherWorkHistoryItem {
  readonly id: string
  readonly blockId: string
  readonly blockNumber: number
  readonly territoryId: string
  readonly territoryName: string
  readonly workedAt: Date
  readonly createdAt?: Date
}
