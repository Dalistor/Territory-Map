// Spec 0012, Task 09: the assignments map -- OSM raster tiles and the
// territories' demarcations, each with the name of whoever is responsible for
// it written over its centroid.
//
// Spec 0013, Task 04 reverses that spec's "no blocks" decision on purpose: the
// desktop can afford a map that only answers "who has what", because the blocks
// are one click away in another pane. On a phone this map *is* the whole
// context the admin has, so the blocks are drawn here too -- numbered and
// coloured by status, exactly as the publisher's app draws them.
//
// The territory name badges used to step aside whenever a block was on
// screen, to keep them off the block numbers. Rolled back after a field
// report (2026-08-26): with 28 territories on one map, the badge is what
// tells the admin which cluster of blocks he is looking at, and losing it was
// worse than the occasional overlap it was avoiding. The badges draw
// unconditionally now; the caller decides what tapping one does (see
// `DesignationsScreen`, which opens the blocks/work-history screen instead of
// the S-13 card since the same report).
//
// MapLibre Native (`@maplibre/maplibre-react-native`) is a third-party native
// view this component wraps; per AGENTS.md's "risco assumido" principle -- the
// same one already applied to Leaflet-Geoman in the desktop admin and to
// `app/src/presentation/map/TerritoryMapView.tsx` -- it is deliberately not
// exercised by Jest: there is no meaningful way to render a native map view in
// a JS test runner. Every decision it makes (which colour, which label, where
// the label goes, what the camera frames) was pushed into
// `domain/territoryMap.ts`, which *is* tested; what is left here is only the
// drawing. Verify it by eye: `npm run android` on an emulator or device.
//
// OpenStreetMap tile usage policy
// (https://operations.osmfoundation.org/policies/tiles/): identify the app
// with a User-Agent header on every tile request, and show the attribution on
// screen. This component never pre-fetches or bulk-downloads -- only the
// visible viewport is requested.
import { useEffect, useMemo, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
} from 'react-native';
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
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native';
import type { Block, LatLng, Territory } from '../../domain/models';
import {
  FALLBACK_CENTER,
  blockMapFeatures,
  territoriesBounds,
  territoryMapFeatures,
} from '../../domain/territoryMap';
import { MapStatusLegend } from './MapStatusLegend';

const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

/**
 * Identifies this app to OSM's tile servers, as their usage policy requires.
 * `@maplibre/maplibre-react-native@11` has no per-source "user agent" prop on
 * `RasterSource` -- the mechanism this version offers is
 * `TransformRequestManager.addHeader`, which rewrites a header on every request
 * matching the given host. Same approach, and same caveat, as the publisher
 * app's map.
 */
const OSM_USER_AGENT =
  'TerritoryMapAdmin/1.0 (+https://github.com/dalistor/territory-map)';

/** Zoom used when there is no territory to fit the camera to. */
const FALLBACK_ZOOM = 4;

/** Keeps a fitted territory clear of the screen edges and the attribution badge. */
const MAP_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };

/**
 * A base style with no sources or layers of its own -- the tiles and the
 * territory outlines are added declaratively as JSX children below. A
 * module-level constant, not an inline object, so it keeps its identity across
 * renders.
 */
const EMPTY_MAP_STYLE = { version: 8 as const, sources: {}, layers: [] };

function toLngLat(point: LatLng): LngLat {
  return [point.lng, point.lat];
}

export interface AssignmentsMapViewProps {
  /** Drawn exactly as handed over -- filtering, if any, is the caller's job. */
  readonly territories: Territory[];
  /** Fired when a territory's outline or its label is tapped. */
  readonly onSelectTerritory?: (territory: Territory) => void;
  /**
   * Fired when a block is tapped, with the territory that owns it -- the panel
   * that opens acts on both, so both travel together.
   */
  readonly onSelectBlock?: (block: Block, territory: Territory) => void;
  /**
   * The clock the block colours are computed against. Injectable so a caller
   * can pin it; defaults to now, refreshed whenever the territories reload.
   */
  readonly now?: Date;
  /**
   * Where to centre the map while there is no territory to frame -- normally
   * the congregation's city. Falls back to a fixed point when absent, so the
   * map never opens on null island.
   */
  readonly fallbackCenter?: LatLng;
}

export function AssignmentsMapView({
  territories,
  onSelectTerritory,
  onSelectBlock,
  fallbackCenter,
  now,
}: AssignmentsMapViewProps): React.JSX.Element {
  useEffect(() => {
    TransformRequestManager.addHeader({
      id: 'osm-user-agent',
      name: 'User-Agent',
      value: OSM_USER_AGENT,
      match: /tile\.openstreetmap\.org/,
    });
  }, []);

  const features = useMemo(
    () => territoryMapFeatures(territories),
    [territories],
  );

  const outlines = useMemo(
    (): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: features.map(feature => ({
        type: 'Feature' as const,
        properties: {
          territoryId: feature.territory.id,
          color: feature.color,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [feature.ring],
        },
      })),
    }),
    [features],
  );

  // Every decision about the blocks -- which colour, which number, where it
  // sits, which ones are drawable at all -- is made by `blockMapFeatures`,
  // which is tested. Nothing is recomputed here.
  const blocks = useMemo(
    () => blockMapFeatures(territories, now ?? new Date()),
    [territories, now],
  );

  const blockPolygons = useMemo(
    (): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: blocks.map(feature => ({
        type: 'Feature' as const,
        properties: {
          blockId: feature.block.id,
          color: feature.color,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [feature.ring],
        },
      })),
    }),
    [blocks],
  );

  const blockLookup = useMemo(() => {
    const lookup = new Map<string, { block: Block; territory: Territory }>();
    for (const feature of blocks) {
      lookup.set(feature.block.id, {
        block: feature.block,
        territory: feature.territory,
      });
    }
    return lookup;
  }, [blocks]);

  const bounds = useMemo(() => territoriesBounds(territories), [territories]);

  const cameraRef = useRef<CameraRef>(null);
  // The territories arrive from the API *after* this component first mounts,
  // so `initialViewState` alone would leave the map parked on the fallback
  // forever. Keying the refit on the bounds *value* -- not the array identity
  // -- is what keeps the camera still while the admin designates a territory:
  // the list gets a new identity on every reload, but the same four numbers
  // mean the same area, so the map does not snap back under his finger.
  const boundsKey = bounds?.join(',') ?? null;
  useEffect(() => {
    if (bounds === null) {
      return;
    }
    cameraRef.current?.fitBounds(bounds, { padding: MAP_PADDING, duration: 600 });
    // `bounds` is intentionally absent: `boundsKey` is its value-identity, and
    // depending on the array itself would refit on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey]);

  function handleOutlinePress(
    event: NativeSyntheticEvent<PressEventWithFeatures>,
  ): void {
    const territoryId = event.nativeEvent.features[0]?.properties?.territoryId as
      | string
      | undefined;
    if (territoryId === undefined) {
      return;
    }
    const found = territories.find(territory => territory.id === territoryId);
    if (found === undefined) {
      return;
    }
    onSelectTerritory?.(found);
  }

  function handleBlockPress(
    event: NativeSyntheticEvent<PressEventWithFeatures>,
  ): void {
    const blockId = event.nativeEvent.features[0]?.properties?.blockId as
      | string
      | undefined;
    if (blockId === undefined) {
      return;
    }
    const found = blockLookup.get(blockId);
    if (found === undefined) {
      return;
    }
    onSelectBlock?.(found.block, found.territory);
  }

  return (
    <View style={styles.container}>
      <MapLibreMap mapStyle={EMPTY_MAP_STYLE} style={styles.map}>
        <Camera
          ref={cameraRef}
          initialViewState={
            bounds !== null
              ? { bounds, padding: MAP_PADDING }
              : {
                  center: toLngLat(fallbackCenter ?? FALLBACK_CENTER),
                  zoom: FALLBACK_ZOOM,
                }
          }
        />
        <RasterSource
          id="osm-tiles"
          tiles={[OSM_TILE_URL]}
          tileSize={256}
          attribution={OSM_ATTRIBUTION}>
          <Layer id="osm-tiles-layer" type="raster" />
        </RasterSource>
        <GeoJSONSource
          id="territory-outlines"
          data={outlines}
          onPress={handleOutlinePress}>
          {/* A translucent fill, not decoration: an outline is a few pixels
              wide and impossible to hit with a thumb, so the fill is what
              makes the whole territory tappable. */}
          <Layer
            id="territory-fill-layer"
            type="fill"
            paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.12 }}
          />
          <Layer
            id="territory-outline-layer"
            type="line"
            paint={{ 'line-color': ['get', 'color'], 'line-width': 2 }}
          />
        </GeoJSONSource>
        {/* Above the demarcations, so a block reads as sitting inside its
            territory. The whole polygon is the tap target, not just the number
            badge: a thumb is far wider than a 24px circle, and `hitbox` widens
            it further so a tap a few pixels outside a small block still
            counts. Same choice the publisher's map makes. */}
        <GeoJSONSource
          id="blocks"
          data={blockPolygons}
          onPress={handleBlockPress}
          hitbox={{ top: 22, right: 22, bottom: 22, left: 22 }}>
          <Layer
            id="blocks-fill-layer"
            type="fill"
            paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.35 }}
          />
          <Layer
            id="blocks-outline-layer"
            type="line"
            paint={{ 'line-color': ['get', 'color'], 'line-width': 1.5 }}
          />
        </GeoJSONSource>
        {/* The labels are React Native `<Text>` inside a `Marker`, not a
            `symbol` layer: MapLibre renders layer labels from SDF glyphs
            fetched from the style's `glyphs` URL, and this raster-only style
            has none -- adding one would mean depending on a font server, the
            very thing choosing OSM + MapLibre avoids. Same call the
            publisher app's map makes. */}
        {features.map(feature => (
          <Marker
            key={feature.territory.id}
            id={`territory-label-${feature.territory.id}`}
            lngLat={toLngLat(feature.center)}
            anchor="center">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Território ${feature.territory.name}, ${feature.leaderLabel}`}
              onPress={() => onSelectTerritory?.(feature.territory)}
              style={styles.label}>
              <Text style={styles.labelName}>{feature.territory.name}</Text>
              <Text
                style={[
                  styles.labelLeader,
                  feature.hasLeader ? null : styles.labelNoLeader,
                ]}>
                {feature.leaderLabel}
              </Text>
            </Pressable>
          </Marker>
        ))}
        {blocks.map(feature => (
          <Marker
            key={feature.block.id}
            id={`block-label-${feature.block.id}`}
            lngLat={toLngLat(feature.center)}
            anchor="center">
            {/* Tappable for the same reason the fill below is: the badge sits
                on top of the polygon and would otherwise be a dead spot right
                where the admin aims. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Quadra ${feature.label}`}
              onPress={() => onSelectBlock?.(feature.block, feature.territory)}
              style={[styles.blockLabel, { backgroundColor: feature.color }]}>
              <Text style={styles.blockLabelText}>{feature.label}</Text>
            </Pressable>
          </Marker>
        ))}
      </MapLibreMap>
      <MapStatusLegend />
      {/* The other half of the OSM tile usage policy: visible on-screen
          attribution, not just the native attribution sheet. */}
      <View style={styles.attribution} pointerEvents="none">
        <Text style={styles.attributionText}>{OSM_ATTRIBUTION}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  label: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  labelName: { color: '#37474f', fontSize: 11, fontWeight: '600' },
  labelLeader: { color: '#263238', fontSize: 11 },
  labelNoLeader: { color: '#78909c', fontStyle: 'italic' },
  blockLabel: {
    alignItems: 'center',
    borderColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    minWidth: 24,
    paddingHorizontal: 4,
  },
  blockLabelText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  attribution: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 4,
    bottom: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    position: 'absolute',
    right: 4,
  },
  attributionText: { color: '#333333', fontSize: 10 },
});

export default AssignmentsMapView;
