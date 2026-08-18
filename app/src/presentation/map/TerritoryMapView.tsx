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
import { useEffect, useMemo, useState } from 'react';
import { PermissionsAndroid, StyleSheet, Text, View, type NativeSyntheticEvent } from 'react-native';
import Geolocation, { type GeoPosition } from 'react-native-geolocation-service';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  Marker,
  RasterSource,
  TransformRequestManager,
  type LngLat,
  type LngLatBounds,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native';
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
  overdue: '#ef6c00', // orange -- past the 120-day threshold
  recent: '#2e7d32', // green -- worked recently
};

const TERRITORY_OUTLINE_COLOR = '#1565c0';
const FALLBACK_CENTER: LngLat = [-47.93, -15.78]; // Brasília, [lng, lat] -- nothing to centre on yet
const FALLBACK_ZOOM = 4;

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
  /** Injected so a fixed "now" can drive `blockColorCategory`; defaults to the real clock. */
  readonly now?: Date;
  readonly onBlockTap?: (territory: Territory, block: Block) => void;
}

export function TerritoryMapView({
  territories,
  now,
  onBlockTap,
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

  const territoryOutlines = useMemo(
    (): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: territories
        .filter((territory) => territory.boundary.length >= 3)
        .map((territory) => ({
          type: 'Feature' as const,
          properties: { territoryId: territory.id },
          geometry: { type: 'Polygon' as const, coordinates: [closedRing(territory.boundary)] },
        })),
    }),
    [territories],
  );

  const blockFeatureProperties = useMemo(
    () =>
      territories.flatMap((territory) =>
        territory.blocks
          .filter((block) => block.polygon.length >= 3)
          .map((block) => ({
            block,
            properties: {
              blockId: block.id,
              color: CATEGORY_COLOR[blockColorCategory(block, effectiveNow)],
              label: String(block.number),
            },
          })),
      ),
    [territories, effectiveNow],
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

  const blockLabels = useMemo(
    (): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: blockFeatureProperties.map(({ block, properties }) => ({
        type: 'Feature' as const,
        properties,
        geometry: { type: 'Point' as const, coordinates: averageCentroid(block.polygon) },
      })),
    }),
    [blockFeatureProperties],
  );

  const bounds = useMemo(() => boundsOf(territories), [territories]);

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
          initialViewState={
            bounds !== null ? { bounds } : { center: FALLBACK_CENTER, zoom: FALLBACK_ZOOM }
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
        <GeoJSONSource id="territory-outlines" data={territoryOutlines}>
          <Layer
            id="territory-outlines-layer"
            type="line"
            paint={{ 'line-color': TERRITORY_OUTLINE_COLOR, 'line-width': 2 }}
          />
        </GeoJSONSource>
        <GeoJSONSource id="blocks" data={blockPolygons} onPress={handleBlockPress}>
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
        <GeoJSONSource id="block-labels" data={blockLabels}>
          <Layer
            id="block-labels-circle-layer"
            type="circle"
            paint={{
              'circle-color': ['get', 'color'],
              'circle-radius': 12,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
            }}
          />
          <Layer
            id="block-labels-text-layer"
            type="symbol"
            layout={{ 'text-field': ['get', 'label'], 'text-size': 11, 'text-allow-overlap': true }}
            paint={{ 'text-color': '#ffffff' }}
          />
        </GeoJSONSource>
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
