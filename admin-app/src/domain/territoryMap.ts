// Everything the assignments map needs to *decide* -- which colour a
// territory reads as, what its label says, where that label sits, and which
// rectangle the camera should frame -- lives here, as plain functions over
// plain data.
//
// It is deliberately separated from `presentation/map/AssignmentsMapView.tsx`:
// that component wraps a native MapLibre view, which no JS test runner can
// meaningfully render (CLAUDE.md, "Testes"), so it is the one file in this app
// without automated coverage. Keeping every calculation out of it is what
// makes that untested surface as small as it can be -- the component ends up
// only translating the values below into JSX.
//
// Pure module: no react-native, no HTTP, no storage.
import type { Block, LatLng, Territory } from './models';
import { toGeoJsonRing } from './models';
import { blockColorCategory, type BlockColorCategory } from './blockColor';

/** Solid blue: somebody is responsible for this territory right now. */
export const ASSIGNED_TERRITORY_COLOR = '#1565c0';
/** Muted grey: nobody is. The same pair the desktop's Designations map uses. */
export const UNASSIGNED_TERRITORY_COLOR = '#78909c';

/** Written under the territory's name when no assignment is open. */
export const NO_LEADER_LABEL = 'Sem dirigente';

/**
 * A polygon needs three distinct vertices to be a polygon at all -- the same
 * floor the server enforces on a demarcation. A territory that somehow arrives
 * with fewer is skipped rather than drawn as a degenerate shape.
 */
export const MIN_BOUNDARY_VERTICES = 3;

/** Brasília, the last-resort centre when there is nothing at all to frame. */
export const FALLBACK_CENTER: LatLng = { lat: -15.78, lng: -47.93 };

/** Everything the map draws for one territory, already computed. */
export interface TerritoryMapFeature {
  readonly territory: Territory;
  /** The boundary as a closed GeoJSON ring, `[lng, lat]` per position. */
  readonly ring: number[][];
  /** Where the label goes. */
  readonly center: LatLng;
  readonly color: string;
  /** Whether an assignment is open -- drives the colour and the second label line. */
  readonly hasLeader: boolean;
  /** The publisher's name, or {@link NO_LEADER_LABEL}. */
  readonly leaderLabel: string;
}

/** Blue when a publisher is responsible for it, grey when nobody is. */
export function territoryColor(territory: Territory): string {
  return territory.assignedPublisher
    ? ASSIGNED_TERRITORY_COLOR
    : UNASSIGNED_TERRITORY_COLOR;
}

/** The second line of the label: who has it, or that nobody does. */
export function territoryLeaderLabel(territory: Territory): string {
  return territory.assignedPublisher?.name ?? NO_LEADER_LABEL;
}

/**
 * The average of the vertices -- a cheap stand-in for a true geometric
 * centroid, close enough to place a label on a territory-sized shape, and the
 * same shortcut both the publisher's app and the desktop admin already take.
 * An empty ring has no centre, and says so instead of returning `NaN`.
 */
export function averageCentroid(ring: readonly LatLng[]): LatLng | null {
  if (ring.length === 0) {
    return null;
  }
  const lat = ring.reduce((sum, point) => sum + point.lat, 0) / ring.length;
  const lng = ring.reduce((sum, point) => sum + point.lng, 0) / ring.length;
  return { lat, lng };
}

/**
 * The drawable territories, each with its ring, centre, colour and label.
 * Territories without a usable boundary are dropped here rather than in the
 * component, so the component never has to reason about them.
 */
export function territoryMapFeatures(
  territories: readonly Territory[],
): TerritoryMapFeature[] {
  const features: TerritoryMapFeature[] = [];
  for (const territory of territories) {
    if (territory.boundary.length < MIN_BOUNDARY_VERTICES) {
      continue;
    }
    const center = averageCentroid(territory.boundary);
    if (center === null) {
      continue;
    }
    features.push({
      territory,
      ring: toGeoJsonRing(territory.boundary),
      center,
      color: territoryColor(territory),
      hasLeader: Boolean(territory.assignedPublisher),
      leaderLabel: territoryLeaderLabel(territory),
    });
  }
  return features;
}

/**
 * The three status colours, ported value for value from the publisher's app
 * (`app/src/presentation/map/TerritoryMapView.tsx`, `CATEGORY_COLOR`) and from
 * the desktop admin. They are domain values rather than theme values -- the
 * note at the top of `presentation/theme.ts` says so on purpose: red, orange
 * and green here mean "never worked", "past its rotation" and "worked
 * recently", not "danger", "warning" and "success", and re-skinning the app
 * must not repaint them.
 */
export const BLOCK_CATEGORY_COLOR: Record<BlockColorCategory, string> = {
  never: '#c62828', // red -- never worked
  overdue: '#ef6c00', // orange -- past the owning territory's rotation
  recent: '#2e7d32', // green -- worked recently
};

/** Everything the map draws for one block, already computed. */
export interface BlockMapFeature {
  readonly block: Block;
  /** The territory that owns it -- what the tap opens the panel on. */
  readonly territory: Territory;
  /** The polygon as a closed GeoJSON ring, `[lng, lat]` per position. */
  readonly ring: number[][];
  /** Where the number goes. */
  readonly center: LatLng;
  readonly color: string;
  /** The block number, as the text the marker renders. */
  readonly label: string;
}

/**
 * Every block of every territory, flattened into drawable features.
 *
 * The rotation used is always the one of the territory that owns the block
 * (spec 0009): a block is late against its own cycle, never against a single
 * global threshold. Blocks whose polygon is not a polygon are dropped here for
 * the same reason `territoryMapFeatures` drops a degenerate boundary -- the
 * component should never have to reason about them -- and dropping one does
 * not cost the other blocks of the same territory.
 */
export function blockMapFeatures(
  territories: readonly Territory[],
  now: Date,
): BlockMapFeature[] {
  const features: BlockMapFeature[] = [];
  for (const territory of territories) {
    for (const block of territory.blocks) {
      if (block.polygon.length < MIN_BOUNDARY_VERTICES) {
        continue;
      }
      const center = averageCentroid(block.polygon);
      if (center === null) {
        continue;
      }
      features.push({
        block,
        territory,
        ring: toGeoJsonRing(block.polygon),
        center,
        color:
          BLOCK_CATEGORY_COLOR[
            blockColorCategory(block, now, territory.rotationDays)
          ],
        label: String(block.number),
      });
    }
  }
  return features;
}

/**
 * The bounding box of every territory's boundary, as MapLibre wants it:
 * `[west, south, east, north]`. `null` when there is nothing to frame -- the
 * caller then falls back to a fixed centre and zoom, because fitting the
 * camera to an empty box would put it nowhere.
 */
export function territoriesBounds(
  territories: readonly Territory[],
): [number, number, number, number] | null {
  const points = territories.flatMap(territory => territory.boundary);
  if (points.length === 0) {
    return null;
  }
  const lngs = points.map(point => point.lng);
  const lats = points.map(point => point.lat);
  return [
    Math.min(...lngs),
    Math.min(...lats),
    Math.max(...lngs),
    Math.max(...lats),
  ];
}
