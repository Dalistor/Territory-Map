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

/**
 * Just enough of a campaign to name it where a dirigente would otherwise be
 * named: on a territory in an active campaign, and on the S-13 card line the
 * campaign opened for it.
 */
export interface CampaignBrief {
  readonly id: string
  readonly name: string
}

/** The most recent work recorded on any block in a territory. */
export interface LastWorkSummary {
  readonly publisher: PublisherBrief
  readonly workedAt: Date
}

/**
 * The two statuses the admin can pin a block to, overriding what its work
 * records say. There is deliberately no third value for "recent": forcing a
 * block to look freshly worked is the one thing nobody asked for, and clearing
 * the override (back to `undefined`) is the way back to the derived status.
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

export interface Territory {
  readonly id: string
  readonly name: string
  readonly boundary: LatLng[]
  /** Empty on the listing endpoint, populated on the detail one. */
  readonly blocks: Block[]
  /**
   * `undefined` (absent) means the territory has no publisher assigned --
   * which is also the case while it is in an active campaign (`campaign`).
   */
  readonly assignedUser?: PublisherBrief
  /**
   * The active campaign the territory is in, if any. While it is set, the
   * campaign's publishers hold the territory instead of a dirigente, and
   * `assignedSince` is when the campaign was designated.
   */
  readonly campaign?: CampaignBrief
  /**
   * How many days a full rotation of this territory takes: once a block has
   * gone longer than this without being worked, it shows as overdue on the
   * map. `undefined` (absent) means the territory uses the default rotation
   * (`DEFAULT_ROTATION_DAYS`), which is what every territory did before the
   * setting existed.
   */
  readonly rotationDays?: number
  /** `undefined` (absent) means no block in the territory has been worked. */
  readonly lastWork?: LastWorkSummary
  /**
   * When the assignment in force started -- the "retirada" of the S-13 card.
   * `undefined` (absent) whenever neither `assignedUser` nor `campaign` is.
   */
  readonly assignedSince?: Date
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

/**
 * One line of a territory's assignment history, the way the S-13 card reads:
 * who had it, when they took it and when they gave it back. An absent
 * `completedAt` means the assignment is still **open** — the one in force
 * right now, and the only one that grants the right to mark blocks in that
 * territory.
 *
 * Exactly one of `publisher` and `campaign` is present: an individual
 * designation names its dirigente, a campaign's line names the campaign
 * (whose publishers can change while it runs, so no single name belongs on
 * the card). A campaign line is managed from the campaign, never from the
 * card -- see `assignmentIsCampaign`.
 */
export interface Assignment {
  readonly id: string
  readonly publisher?: PublisherBrief
  readonly campaign?: CampaignBrief
  readonly startedAt: Date
  readonly completedAt?: Date
}

/**
 * The shape of the congregation-wide history listing, where each record has
 * to name its own territory — in the per-territory listing that was already
 * in the context.
 */
export interface AssignmentWithTerritory extends Assignment {
  readonly territory: { readonly id: string; readonly name: string }
}

/**
 * Optional parameters for the congregation-wide assignment history. Dates are
 * instants because callers own the conversion from a selected local day to
 * the half-open interval the API receives.
 */
export interface AssignmentHistoryQuery {
  readonly fromInstant?: Date
  readonly toInstant?: Date
  readonly publisherId?: string
  readonly territoryId?: string
  readonly page?: number
  readonly pageSize?: number
}

/** A server-paginated portion of the congregation-wide assignment history. */
export interface AssignmentHistoryPage {
  readonly items: AssignmentWithTerritory[]
  readonly total: number
  readonly page: number
  readonly pageSize: number
}

/**
 * One period of a campaign: since when, until when, and who works it. An
 * absent `completedAt` means the period is open -- the campaign is active, and
 * these publishers may mark blocks in every territory of it.
 */
export interface CampaignDesignation {
  readonly id: string
  readonly startedAt: Date
  readonly completedAt?: Date
  readonly publishers: PublisherBrief[]
}

/**
 * A group of territories handed to several publishers at once. Designating it
 * replaces the dirigente of every territory in it; completing it leaves them
 * all without one.
 */
export interface Campaign {
  readonly id: string
  readonly name: string
  readonly createdAt: Date
  readonly territories: { readonly id: string; readonly name: string }[]
  /** The open period, also the first item of `designations` (newest first). */
  readonly currentDesignation?: CampaignDesignation
  readonly designations: CampaignDesignation[]
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

/** `true` while this assignment has not been completed — the one in force. */
export function assignmentIsOpen(assignment: Assignment): boolean {
  return assignment.completedAt === undefined || assignment.completedAt === null
}

/** `true` while the campaign has an open period -- its publishers hold its territories. */
export function campaignIsActive(campaign: Campaign): boolean {
  return campaign.currentDesignation !== undefined && campaign.currentDesignation !== null
}

/** `true` for the S-13 line a campaign opened -- edited only through the campaign. */
export function assignmentIsCampaign(assignment: Assignment): boolean {
  return assignment.campaign !== undefined && assignment.campaign !== null
}

/** How a campaign is named where a dirigente's name would go. */
export function campaignHolderLabel(campaign: CampaignBrief): string {
  return `Campanha: ${campaign.name}`
}

/**
 * Who holds the territory on this line of the card, as text: the dirigente's
 * name, or "Campanha: <nome>" for a campaign's line. The one spelling the
 * screens and both S-13 exports share.
 */
export function assignmentHolderName(assignment: Assignment): string {
  if (assignment.campaign !== undefined && assignment.campaign !== null) {
    return campaignHolderLabel(assignment.campaign)
  }
  return assignment.publisher?.name ?? ''
}

/**
 * Returns the Service Year (Ano de Serviço) for a given date.
 * The Service Year begins on September 1st (month 8, 0-indexed) of the previous calendar year
 * and ends on August 31st (month 7, 0-indexed) of the service year.
 * E.g., September 1, 2025 belongs to Service Year 2026; August 31, 2026 belongs to Service Year 2026.
 */
export function getServiceYear(date: Date = new Date()): number {
  return date.getMonth() >= 8 ? date.getFullYear() + 1 : date.getFullYear()
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

/**
 * The sequence number a territory name carries by convention ("Centro - N5",
 * "Santa Helena - N 7"), or `null` when the name has none.
 *
 * Reads the *last* run of digits rather than the first: an area name can hold
 * a number of its own ("Cambé 3 - N1"), and it is the trailing one that
 * identifies the territory. Tolerates the space some names put after the "N",
 * because the names are typed by hand.
 */
export function territoryNumber(name: string): number | null {
  const matches = name.match(/\d+/g)
  if (matches === null) return null
  return Number(matches[matches.length - 1])
}

/**
 * Orders territories by their number, ascending — the order the congregation
 * reads them in, and the reason the number is required when naming one.
 *
 * The area name only breaks ties, so "Próximo ao centro - N12" lands after
 * "Santa Helena - N 7" instead of between "Centro" and "Santa Helena" the way
 * a plain name sort put it. Names with no number at all sort last (they are
 * legacy: the editor now refuses to save one), alphabetically among themselves.
 */
export function compareTerritoriesByNumber(a: string, b: string): number {
  const numberA = territoryNumber(a)
  const numberB = territoryNumber(b)
  if (numberA !== null && numberB !== null && numberA !== numberB) return numberA - numberB
  if (numberA === null && numberB !== null) return 1
  if (numberA !== null && numberB === null) return -1
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
}
