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

/** A block, the numbered outline that is the real unit of field work (`BlockOut`). */
export interface Block {
  readonly id: string
  readonly number: number
  readonly polygon: LatLng[]
  /** `undefined` means never covered — the state the map has to highlight. */
  readonly lastWorkedAt?: Date
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
