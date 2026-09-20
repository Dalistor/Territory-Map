// The domain entities of the admin app, named to match the server's Pydantic
// schemas (`server/app/schemas/`) but spelled in camelCase, the same way
// `app/src/domain/models.ts` and `admin/src/shared/models.ts` spell theirs.
// The set of entities is what differs: this app designates territories, so it
// needs `Assignment` and `Publisher`, which the publisher's app never sees.
//
// Nothing here carries behaviour beyond the two coordinate conversions at the
// bottom. Parsing these out of an API response body belongs to
// `data/api-client.ts`, next to the HTTP client that receives it.
//
// One deliberate difference from the other two clients: an absent value is
// `null` here, not `undefined`. The API sends JSON `null`, and the parser maps
// it straight through, so "never worked" and "nobody assigned" stay values a
// caller has to handle rather than a key that quietly isn't there.

/**
 * A position on the globe, `{lat, lng}` named rather than a bare pair, so
 * latitude and longitude can never be silently swapped. Same shape as
 * `admin/src/shared/geo.ts` and `app/src/domain/models.ts`.
 */
export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/** The congregation the admin logged into (`CongregationOut`). */
export interface Congregation {
  readonly id: string;
  readonly name: string;
  readonly city: string;
}

/**
 * Just the identity of a publisher (`UserBriefOut`), as it appears nested in a
 * territory, an assignment and a work log. In the two history records the name
 * is a photograph taken when the row was written -- it outlives the person
 * being deleted, which is exactly why the server stores it on the row.
 */
export interface PublisherBrief {
  readonly id: string;
  readonly name: string;
}

/** The most recent work recorded on any block in a territory. */
export interface LastWorkSummary {
  readonly publisher: PublisherBrief;
  readonly workedAt: Date;
}

/**
 * A publisher as the admin sees them. `accessCode` is a live credential and is
 * only present while the code has not been redeemed or expired -- it must
 * never be logged nor put in a URL. This app only ever reads publishers, to
 * pick one; creating, deleting and deactivating stay on the desktop admin.
 */
export interface Publisher {
  readonly id: string;
  readonly name: string;
  readonly accessCode: string | null;
  readonly accessCodeExpiresAt: Date | null;
  /** `null` while nobody has redeemed a code on a device yet. */
  readonly activatedAt: Date | null;
  readonly isActive: boolean;
}

/**
 * The two statuses the admin can pin a block to, overriding what its work
 * records say. There is deliberately no third value for "recent": forcing a
 * block to look freshly worked is the one thing nobody asked for, and clearing
 * the override (back to `null`) is the way back to the derived status.
 */
export type BlockStatusOverride = 'overdue' | 'never';

/** A block, the numbered outline that is the real unit of field work (`BlockOut`). */
export interface Block {
  readonly id: string;
  readonly territoryId: string;
  readonly number: number;
  readonly polygon: LatLng[];
  /** `null` means never covered -- the state the block list has to call out. */
  readonly lastWorkedAt: Date | null;
  /**
   * The status the admin forced on this block, which every client honours
   * above the date calculation. `null` means "derive it from the work
   * records", the behaviour of every block before the override existed. This
   * app displays it but never sets it: forcing a status stays on the desktop.
   */
  readonly statusOverride: BlockStatusOverride | null;
}

/** A territory (`TerritoryOut`). */
export interface Territory {
  readonly id: string;
  readonly name: string;
  readonly boundary: LatLng[];
  /**
   * Who is responsible for it right now, `null` when nobody is. Projected by
   * the server from the open assignment -- the card in `Assignment` is the
   * source of truth, this is the cached read of it.
   */
  readonly assignedPublisher: PublisherBrief | null;
  /**
   * How many days a full rotation of this territory takes: once a block has
   * gone longer than this without being worked, it shows as overdue. `null`
   * means the territory uses the default rotation (`DEFAULT_ROTATION_DAYS` in
   * `blockColor.ts`), which is what every territory did before the setting
   * existed.
   */
  readonly rotationDays: number | null;
  /** `null` means no block in the territory has been worked. */
  readonly lastWork?: LastWorkSummary | null;
  /** Empty on the listing endpoint, populated on the detail one. */
  readonly blocks: Block[];
}

/**
 * One line of a territory's assignment history, the way the S-13 card reads:
 * who had it, when they took it and when they gave it back. A `null`
 * `completedAt` means the assignment is still **open** -- the one in force
 * right now, and the only one that lets that publisher mark blocks there.
 */
export interface Assignment {
  readonly id: string;
  readonly territoryId: string;
  readonly publisher: PublisherBrief;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
}

/** The identity of a territory as it appears in a congregation-wide history row. */
export interface TerritoryBrief {
  readonly id: string;
  readonly name: string;
}

/** An assignment read from the congregation-wide history, together with its territory. */
export interface AssignmentWithTerritory extends Assignment {
  readonly territory: TerritoryBrief;
}

/** Optional server-side filters for the congregation-wide assignment history. */
export interface AssignmentHistoryFilters {
  readonly from?: Date;
  readonly to?: Date;
  readonly publisherId?: string;
  readonly territoryId?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

/** One server-paginated page of the congregation-wide assignment history. */
export interface AssignmentHistoryPage {
  readonly items: AssignmentWithTerritory[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/** A record that a block was worked: who, and when (`BlockWorkLogOut`). */
export interface WorkLog {
  readonly id: string;
  readonly blockId: string;
  readonly publisher: PublisherBrief;
  readonly workedAt: Date;
}

// The two functions below are the only place in this app where the coordinate
// order is inverted. GeoJSON and PostGIS write `[lng, lat]`; MapLibre and this
// domain read `{lat, lng}`. That inversion is the classic bug of this project,
// so it is spelled out once, here, and tested. Every other module converts by
// calling these -- never by hand.

/** Reads the outer ring of a GeoJSON Polygon, which is `[lng, lat]` per position. */
export function toLatLngList(coordinates: number[][]): LatLng[] {
  return coordinates.map(position => ({ lat: position[1], lng: position[0] }));
}

/**
 * Writes a ring back as GeoJSON positions, closing it by repeating the first
 * point when it is not closed already.
 *
 * A ring that already repeats its first vertex is left alone rather than
 * closed twice: a duplicated closing point is a zero-length edge, which PostGIS
 * reads as a shape problem rather than as the harmless typo it is. An empty
 * list returns empty instead of reaching for a first point that isn't there,
 * and a single point has nothing to close.
 */
export function toGeoJsonRing(points: LatLng[]): number[][] {
  if (points.length === 0) {
    return [];
  }
  const ring = points.map(point => [point.lng, point.lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  return ring;
}

/**
 * The sequence number a territory name carries by convention ("Centro - N5",
 * "Santa Helena - N 7"), or `null` when the name has none. Ported verbatim
 * from `admin/src/shared/models.ts`'s `territoryNumber` -- the desktop already
 * solved this, and the congregation reads its territory list the same way on
 * both screens.
 *
 * Reads the *last* run of digits rather than the first: an area name can hold
 * a number of its own ("Cambé 3 - N1"), and it is the trailing one that
 * identifies the territory. Tolerates the space some names put after the "N",
 * because the names are typed by hand.
 */
export function territoryNumber(name: string): number | null {
  const matches = name.match(/\d+/g);
  if (matches === null) {
    return null;
  }
  return Number(matches[matches.length - 1]);
}

/**
 * Orders territories by their number, ascending -- the order the congregation
 * reads them in, and the reason the number is required when naming one on the
 * desktop.
 *
 * The area name only breaks ties, so "Próximo ao centro - N12" lands after
 * "Santa Helena - N 7" instead of between "Centro" and "Santa Helena" the way
 * a plain name sort would put it. Names with no number at all sort last,
 * alphabetically among themselves.
 */
export function compareTerritoriesByNumber(a: string, b: string): number {
  const numberA = territoryNumber(a);
  const numberB = territoryNumber(b);
  if (numberA !== null && numberB !== null && numberA !== numberB) {
    return numberA - numberB;
  }
  if (numberA === null && numberB !== null) {
    return 1;
  }
  if (numberA !== null && numberB === null) {
    return -1;
  }
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}
