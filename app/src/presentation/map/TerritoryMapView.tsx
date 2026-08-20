// Spec 0005, Task 25: the real map -- OSM raster tiles, the visible
// territories' outlines, their blocks coloured by `blockColorCategory`
// (`domain/blockColor.ts`, Task 17), and the publisher's own live position.
// MapLibre Native (`@maplibre/maplibre-react-native`) is a third-party native
// view this component wraps; per CLAUDE.md's "risco assumido" principle --
// the same one already applied to Leaflet-Geoman in the admin -- it is
// deliberately not exercised by Jest: there is no meaningful way to render a
// native map view in a JS test runner. Verify by eye instead: `npm run
// android` on an emulator or device (see `app/README.md`).
//
// Filtering which territories to draw is the caller's job (`MapScreen.tsx`,
// via `territoryFilter.ts`'s `visibleTerritories`) -- this component only
// draws whatever `territories` it is handed, same split as the admin's
// `TerritoryMap.tsx`/`HomeScreen.tsx`.
//
// OpenStreetMap tile usage policy
// (https://operations.osmfoundation.org/policies/tiles/): identify the app
// with a User-Agent header on every tile request, and show the required
// attribution on screen. This component never pre-fetches or bulk-downloads
// -- only the visible viewport is requested, same restraint as the admin's
// Leaflet map.
//
// Location is sensitive data (CLAUDE.md, "Restrições e Cuidados" /
// "Localização é dado sensível"): the coordinate only ever lives in this
// component's own state, feeding the marker below. It is never sent to the
// server and never written to disk. `watchPosition` starts once permission
// is granted and stops (`clearWatch`) the moment this component unmounts.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PermissionsAndroid,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
} from 'react-native';
import Geolocation, { type GeoPosition } from 'react-native-geolocation-service';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  Marker,
  RasterSource,
  TransformRequestManager,
  type CameraRef,
  type LngLat,
  type LngLatBounds,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native';
import { isTerritoryAssignedToMe } from '../../domain/assignment';
import { blockColorCategory, type BlockColorCategory } from '../../domain/blockColor';
import type { Block, LatLng, Territory } from '../../domain/models';

const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

/**
 * Identifies this app to OSM's tile servers, as their usage policy requires.
 * `@maplibre/maplibre-react-native@11.3.6` has no per-source "user agent"
 * prop on `RasterSource` -- the mechanism this version actually offers is
 * `TransformRequestManager.addHeader`, which rewrites a header on every
 * request matching the given host. If a future version removes this API,
 * that is a real regression worth documenting in `app/README.md` rather than
 * routing around with a native patch.
 */
const OSM_USER_AGENT = 'TerritoryMapApp/1.0 (+https://github.com/dalistor/territory-map)';

const CATEGORY_COLOR: Record<BlockColorCategory, string> = {
  never: '#c62828', // red -- never worked
  // orange -- past the owning territory's rotation (its `rotationDays`, or
  // `DEFAULT_ROTATION_DAYS` when the admin never configured one). No fixed
  // number is spelled out on screen, because it now varies per territory.
  overdue: '#ef6c00',
  recent: '#2e7d32', // green -- worked recently
};

// Mirrors the admin's Designations map: the territory that is "yours" reads
// as a solid, confident blue; everything else is a muted grey the eye skips.
const MY_TERRITORY_COLOR = '#1565c0';
const OTHER_TERRITORY_COLOR = '#78909c';
const FALLBACK_CENTER: LngLat = [-47.93, -15.78]; // Brasília, [lng, lat] -- nothing to centre on yet
const FALLBACK_ZOOM = 4;
/** Keeps a fitted territory clear of the filter bar and the attribution badge. */
const MAP_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };

/**
 * A base style with no sources/layers of its own -- every source and layer
 * this map draws (the OSM raster tiles, territory outlines, blocks) is added
 * declaratively as JSX children below. A module-level constant, not created
 * inline in the JSX, so it does not change identity on every render.
 */
const EMPTY_MAP_STYLE = { version: 8 as const, sources: {}, layers: [] };

function toLngLat(point: LatLng): [number, number] {
  return [point.lng, point.lat];
}

/** Closes the ring if the caller's data did not already repeat the first point. */
function closedRing(ring: readonly LatLng[]): [number, number][] {
  const coords = ring.map(toLngLat);
  if (coords.length === 0) return coords;
  const [firstLng, firstLat] = coords[0];
  const [lastLng, lastLat] = coords[coords.length - 1];
  if (firstLng !== lastLng || firstLat !== lastLat) coords.push([firstLng, firstLat]);
  return coords;
}

/** Average of the vertices -- a cheap stand-in for a true centroid, same shortcut the admin's map takes. */
function averageCentroid(ring: readonly LatLng[]): [number, number] {
  const lng = ring.reduce((sum, point) => sum + point.lng, 0) / ring.length;
  const lat = ring.reduce((sum, point) => sum + point.lat, 0) / ring.length;
  return [lng, lat];
}

/** Bounding box of every visible territory's boundary, or `null` when there is nothing to draw yet. */
function boundsOf(territories: readonly Territory[]): LngLatBounds | null {
  const points = territories.flatMap((territory) => territory.boundary);
  if (points.length === 0) return null;
  const lngs = points.map((point) => point.lng);
  const lats = points.map((point) => point.lat);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

interface BlockLookup {
  readonly territory: Territory;
  readonly block: Block;
}

export interface TerritoryMapViewProps {
  /** Already filtered by the caller (`MapScreen`'s `visibleTerritories`) -- this component draws exactly this list. */
  readonly territories: Territory[];
  /** The publisher looking at the map -- decides which outlines read as "mine". */
  readonly myUserId: string;
  /** Injected so a fixed "now" can drive `blockColorCategory`; defaults to the real clock. */
  readonly now?: Date;
  /**
   * `false` (the overview) draws territory outlines with their name over the
   * centroid, and nothing else. `true` (the detail) adds the blocks and their
   * numbers.
   *
   * The split is what keeps the overview readable: drawing every block of
   * every territory at city zoom is a wall of colour with numbers too small
   * to read, and it is also the moment the label markers are most expensive.
   * The publisher picks a territory -- by tapping it or through the search
   * box -- and only then pays for the detail.
   */
  readonly showBlocks?: boolean;
  readonly onBlockTap?: (territory: Territory, block: Block) => void;
  /** Fired when a territory's outline or name label is tapped -- how the overview drills into the detail. */
  readonly onTerritoryTap?: (territory: Territory) => void;
}

export function TerritoryMapView({
  territories,
  myUserId,
  now,
  showBlocks = false,
  onBlockTap,
  onTerritoryTap,
}: TerritoryMapViewProps): React.JSX.Element {
  // Wrapped in `useMemo` (not just `now ?? new Date()`) so this only changes
  // identity when `now` itself changes -- otherwise every render would mint a
  // fresh `Date`, and the block-colour `useMemo`s below that depend on it
  // would never actually memoize anything.
  const effectiveNow = useMemo(() => now ?? new Date(), [now]);
  const [userLocation, setUserLocation] = useState<LngLat | null>(null);

  useEffect(() => {
    TransformRequestManager.addHeader({
      id: 'osm-user-agent',
      name: 'User-Agent',
      value: OSM_USER_AGENT,
      match: /tile\.openstreetmap\.org/,
    });
  }, []);

  useEffect(() => {
    let watchId: number | null = null;
    let cancelled = false;

    async function startWatching(): Promise<void> {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      if (cancelled || result !== PermissionsAndroid.RESULTS.GRANTED) return;

      watchId = Geolocation.watchPosition(
        (position: GeoPosition) => {
          setUserLocation([position.coords.longitude, position.coords.latitude]);
        },
        () => {
          // No signal, permission revoked mid-session, location services off,
          // etc. -- the map keeps working without a marker; nothing else to
          // surface here.
        },
        { enableHighAccuracy: true, distanceFilter: 5, interval: 5000 },
      );
    }

    startWatching();

    return () => {
      cancelled = true;
      if (watchId !== null) Geolocation.clearWatch(watchId);
    };
  }, []);

  const blockLookup = useMemo(() => {
    const lookup = new Map<string, BlockLookup>();
    for (const territory of territories) {
      for (const block of territory.blocks) {
        lookup.set(block.id, { territory, block });
      }
    }
    return lookup;
  }, [territories]);

  const drawableTerritories = useMemo(
    () => territories.filter((territory) => territory.boundary.length >= 3),
    [territories],
  );

  const territoryOutlines = useMemo(
    (): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: drawableTerritories.map((territory) => ({
        type: 'Feature' as const,
        properties: {
          territoryId: territory.id,
          color: isTerritoryAssignedToMe(territory, myUserId)
            ? MY_TERRITORY_COLOR
            : OTHER_TERRITORY_COLOR,
        },
        geometry: { type: 'Polygon' as const, coordinates: [closedRing(territory.boundary)] },
      })),
    }),
    [drawableTerritories, myUserId],
  );

  /**
   * One name badge per territory, over its centroid -- the same thing the
   * admin's Designations map draws.
   *
   * Overview only. In the detail the territory is already named by the
   * active chip above the map, so the badge would just sit on top of the
   * block numbers it is competing with -- and those are what the publisher
   * came here to read.
   */
  const territoryLabelMarkers = useMemo(
    () =>
      (showBlocks ? [] : drawableTerritories).map((territory) => ({
        territory,
        mine: isTerritoryAssignedToMe(territory, myUserId),
        center: averageCentroid(territory.boundary),
      })),
    [drawableTerritories, showBlocks, myUserId],
  );

  const blockFeatureProperties = useMemo(
    () =>
      (showBlocks ? territories : []).flatMap((territory) =>
        territory.blocks
          .filter((block) => block.polygon.length >= 3)
          .map((block) => ({
            territory,
            block,
            properties: {
              blockId: block.id,
              // The rotation belongs to the territory that owns the block
              // (spec 0009): a block is only "overdue" against its own
              // territory's cycle, not against a single global threshold.
              color:
                CATEGORY_COLOR[blockColorCategory(block, effectiveNow, territory.rotationDays)],
              label: String(block.number),
            },
          })),
      ),
    [territories, showBlocks, effectiveNow],
  );

  const blockPolygons = useMemo(
    (): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: blockFeatureProperties.map(({ block, properties }) => ({
        type: 'Feature' as const,
        properties,
        geometry: { type: 'Polygon' as const, coordinates: [closedRing(block.polygon)] },
      })),
    }),
    [blockFeatureProperties],
  );

  /**
   * The block numbers, as one `Marker` (a real React Native `<Text>`) each.
   *
   * Not a `symbol` layer with `text-field`: MapLibre renders label text from
   * SDF glyphs fetched from the style's `glyphs` URL, and this map's style is
   * raster-only -- it has no `glyphs`, and adding one would mean a font
   * server on the network, which both costs a provider (the project's whole
   * reason for OSM + MapLibre) and would leave the numbers invisible exactly
   * when the publisher is offline in the field. A `<Text>` marker is drawn by
   * React Native itself, so the numbers survive with no signal.
   *
   * The tradeoff is that each marker is a native view; with the "Todos"
   * filter over a congregation with hundreds of blocks this is the heaviest
   * thing on screen. If that ever drags, the fix is to thin the list by
   * viewport or zoom here, not to go back to a glyph server.
   */
  const blockLabelMarkers = useMemo(
    () =>
      blockFeatureProperties.map(({ territory, block, properties }) => ({
        territory,
        block,
        color: properties.color,
        label: properties.label,
        center: averageCentroid(block.polygon),
      })),
    [blockFeatureProperties],
  );

  const bounds = useMemo(() => boundsOf(territories), [territories]);

  const cameraRef = useRef<CameraRef>(null);
  // The territories arrive from the API *after* this component first mounts,
  // so `initialViewState` alone would leave the map parked on the fallback
  // (a country-wide view of Brasília) forever. Keying the refit on the bounds
  // *value* -- not the array identity -- is what keeps the camera still while
  // the publisher marks a block: `territories` gets a new identity on every
  // optimistic update, but the same four numbers mean the same city, so the
  // map does not snap back under the publisher's finger. It refits when the
  // filter changes, which is the point: picking a territory flies to it.
  const boundsKey = bounds?.join(',') ?? null;
  useEffect(() => {
    if (bounds === null) return;
    cameraRef.current?.fitBounds(bounds, { padding: MAP_PADDING, duration: 600 });
    // `bounds` is intentionally absent: `boundsKey` is its value-identity, and
    // depending on the array itself would refit on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey]);

  function handleTerritoryPress(event: NativeSyntheticEvent<PressEventWithFeatures>): void {
    const territoryId = event.nativeEvent.features[0]?.properties?.territoryId as string | undefined;
    if (territoryId === undefined) return;
    const found = territories.find((territory) => territory.id === territoryId);
    if (found === undefined) return;
    onTerritoryTap?.(found);
  }

  function handleBlockPress(event: NativeSyntheticEvent<PressEventWithFeatures>): void {
    const blockId = event.nativeEvent.features[0]?.properties?.blockId as string | undefined;
    if (blockId === undefined) return;
    const found = blockLookup.get(blockId);
    if (found === undefined) return;
    onBlockTap?.(found.territory, found.block);
  }

  return (
    <View style={styles.container}>
      <MapLibreMap mapStyle={EMPTY_MAP_STYLE} style={styles.map}>
        <Camera
          ref={cameraRef}
          initialViewState={
            bounds !== null
              ? { bounds, padding: MAP_PADDING }
              : { center: FALLBACK_CENTER, zoom: FALLBACK_ZOOM }
          }
        />
        <RasterSource
          id="osm-tiles"
          tiles={[OSM_TILE_URL]}
          tileSize={256}
          attribution={OSM_ATTRIBUTION}
        >
          <Layer id="osm-tiles-layer" type="raster" />
        </RasterSource>
        <GeoJSONSource
          id="territory-outlines"
          data={territoryOutlines}
          // Only the overview drills in. In the detail every tap inside the
          // territory is meant for a block, and leaving two pressable
          // sources stacked there is how a tap that misses a block by a few
          // pixels silently re-selects the territory instead.
          onPress={showBlocks ? undefined : handleTerritoryPress}
        >
          {/* A near-transparent fill, not decoration: a line is a few pixels
              wide and impossible to hit with a thumb, so the fill is what
              makes the whole territory tappable. */}
          <Layer
            id="territory-fill-layer"
            type="fill"
            paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': showBlocks ? 0.04 : 0.1 }}
          />
          <Layer
            id="territory-outlines-layer"
            type="line"
            paint={{ 'line-color': ['get', 'color'], 'line-width': 2 }}
          />
        </GeoJSONSource>
        {/* The whole polygon is the target, not just the number badge: a
            thumb is far wider than a 24px circle, and the fill below is what
            the press actually lands on. `hitbox` widens that further, so a
            tap a few pixels outside a small block still counts. */}
        <GeoJSONSource
          id="blocks"
          data={blockPolygons}
          onPress={handleBlockPress}
          hitbox={{ top: 22, right: 22, bottom: 22, left: 22 }}
        >
          <Layer
            id="blocks-fill-layer"
            type="fill"
            paint={{
              'fill-color': ['get', 'color'],
              'fill-opacity': 0.35,
              'fill-outline-color': ['get', 'color'],
            }}
          />
        </GeoJSONSource>
        {territoryLabelMarkers.map(({ territory, mine, center }) => (
          <Marker
            key={`territory-${territory.id}`}
            id={`territory-label-${territory.id}`}
            lngLat={center}
            anchor="center"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Território ${territory.name}`}
              onPress={() => onTerritoryTap?.(territory)}
              style={styles.territoryLabel}
            >
              <Text style={styles.territoryLabelText}>{territory.name}</Text>
              {mine && <Text style={styles.territoryLabelMine}>Seu território</Text>}
            </Pressable>
          </Marker>
        ))}
        {blockLabelMarkers.map(({ territory, block, color, label, center }) => (
          <Marker key={block.id} id={`block-label-${block.id}`} lngLat={center} anchor="center">
            {/* Tappable for the same reason the fill below is: the badge sits
                on top of the polygon and would otherwise be a dead spot right
                where the publisher aims. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Quadra ${label}`}
              onPress={() => onBlockTap?.(territory, block)}
              style={[styles.blockLabel, { backgroundColor: color }]}
            >
              <Text style={styles.blockLabelText}>{label}</Text>
            </Pressable>
          </Marker>
        ))}
        {userLocation !== null && (
          <Marker lngLat={userLocation} anchor="center">
            <View style={styles.userLocationDot} />
          </Marker>
        )}
      </MapLibreMap>
      {/* The other half of the OSM tile usage policy: visible on-screen attribution, not just the native attribution sheet. */}
      <View style={styles.attribution} pointerEvents="none">
        <Text style={styles.attributionText}>{OSM_ATTRIBUTION}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  userLocationDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1565c0',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  territoryLabel: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },
  territoryLabelText: { fontSize: 11, fontWeight: '600', color: '#37474f' },
  territoryLabelMine: { fontSize: 10, color: '#1565c0' },
  blockLabel: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 4,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  blockLabelText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  attribution: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  attributionText: { fontSize: 10, color: '#333333' },
});

export default TerritoryMapView;
