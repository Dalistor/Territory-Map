// The domain entities, spelled out exactly as
// `packages/core/lib/models/models.dart` spells them for the Flutter app. Each
// one carries no behaviour beyond the small set of pure derived predicates
// below — parsing these from the API response body lives in Task 04
// (`main/api-client.ts`), next to the HTTP client that receives it.
import type { LatLng } from './geo'

export interface Congregation {
  readonly id: string
  readonly name: string
  readonly city: string
}

/**
 * A publisher, as the admin sees them. `accessCode` is a live credential and
 * is only present while the code has not been redeemed or expired — it must
 * never be logged or put in a URL.
 */
export interface Publisher {
  readonly id: string
  readonly name: string
  readonly isActive: boolean
  readonly accessCode?: string
  readonly accessCodeExpiresAt?: Date
  readonly activatedAt?: Date
}

/** Just the identity of a publisher, as it appears nested in a work log. */
export interface PublisherBrief {
  readonly id: string
  readonly name: string
}

export interface Block {
  readonly id: string
  readonly number: number
  readonly polygon: LatLng[]
  /** `undefined` means never covered — the state the map has to highlight. */
  readonly lastWorkedAt?: Date
}

export interface Territory {
  readonly id: string
  readonly name: string
  readonly boundary: LatLng[]
  /** Empty on the listing endpoint, populated on the detail one. */
  readonly blocks: Block[]
  /** `undefined` (absent) means the territory has no publisher assigned. */
  readonly assignedUser?: PublisherBrief
}

export interface WorkLog {
  readonly id: string
  readonly blockId: string
  readonly publisher: PublisherBrief
  /** When the block was finished, read from the phone's clock. */
  readonly workedAt: Date
  /**
   * When the record reached the server. Later than `workedAt` by however long
   * the phone stayed offline.
   */
  readonly createdAt: Date
}

/** A successful admin login. */
export interface AdminSession {
  readonly accessToken: string
  readonly congregation: Congregation
}

/** Nobody has redeemed a code on a device yet. */
export function publisherIsPending(publisher: Publisher): boolean {
  return publisher.activatedAt === undefined || publisher.activatedAt === null
}

/** `true` when this block has never had a work log recorded against it. */
export function blockWasNeverWorked(block: Block): boolean {
  return block.lastWorkedAt === undefined || block.lastWorkedAt === null
}

/**
 * Whether the admin still has a code to hand over. `now` equal to
 * `accessCodeExpiresAt` counts as expired, not live — the same strict
 * `isAfter` semantics `Publisher.hasLiveCode` uses on the Dart side.
 */
export function publisherHasLiveCode(publisher: Publisher, now: Date): boolean {
  return (
    publisher.accessCode !== undefined &&
    publisher.accessCode !== null &&
    publisher.accessCodeExpiresAt !== undefined &&
    publisher.accessCodeExpiresAt !== null &&
    publisher.accessCodeExpiresAt.getTime() > now.getTime()
  )
}

/**
 * How long since this block was last covered, for the "where do we go today"
 * view. `null` when it has never been worked, which sorts as "longest ago".
 */
export function blockTimeSinceWorked(block: Block, now: Date): number | null {
  if (block.lastWorkedAt === undefined || block.lastWorkedAt === null) {
    return null
  }
  return now.getTime() - block.lastWorkedAt.getTime()
}

const SYNC_LATE_THRESHOLD_MS = 5 * 60 * 1000

/**
 * `true` when the gap between `workedAt` and `createdAt` is more than five
 * minutes — the offline queue draining, not a wrong clock. Exactly five
 * minutes does not count as late.
 */
export function workLogWasSyncedLate(log: WorkLog): boolean {
  return log.createdAt.getTime() - log.workedAt.getTime() > SYNC_LATE_THRESHOLD_MS
}
