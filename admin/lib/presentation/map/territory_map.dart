/// The map itself: territories drawn as outlines, blocks filled and numbered.
///
/// This widget only draws. Editing lives in a separate one, so that swapping the
/// polygon editor later touches a single file.
library;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' as map;
import 'package:territory_core/territory_core.dart' as core;

/// The one place `core.LatLng` becomes what `flutter_map` expects.
///
/// Both are `(lat, lng)`, so nothing is reordered here -- but keeping the bridge
/// in a single function is what stops the conversion from being retyped, which
/// is where the swap would eventually creep in.
map.LatLng toMapPoint(core.LatLng point) => map.LatLng(point.lat, point.lng);

List<map.LatLng> toMapRing(List<core.LatLng> ring) =>
    ring.map(toMapPoint).toList(growable: false);

/// How long a block goes unworked before it is drawn as overdue.
const Duration overdueAfter = Duration(days: 120);

class TerritoryMap extends StatelessWidget {
  const TerritoryMap({
    required this.territories,
    required this.now,
    super.key,
    this.onBlockTap,
  });

  final List<core.Territory> territories;

  /// Injected rather than read here, so a test can place "today" wherever it
  /// needs the colours to land.
  final DateTime now;

  final void Function(core.Territory, core.Block)? onBlockTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return FlutterMap(
      options: MapOptions(
        initialCenter: _initialCenter(),
        initialZoom: territories.isEmpty ? 4 : 15,
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          // The OSM tile policy requires an identifying User-Agent. Bulk
          // downloading is not allowed either.
          userAgentPackageName: 'br.com.dalistor.territory_admin',
        ),
        PolygonLayer(
          polygons: [
            for (final territory in territories)
              Polygon(
                points: toMapRing(territory.boundary),
                borderColor: scheme.primary,
                borderStrokeWidth: 3,
                color: scheme.primary.withValues(alpha: 0.06),
              ),
            for (final territory in territories)
              for (final block in territory.blocks)
                Polygon(
                  points: toMapRing(block.polygon),
                  borderColor: _blockColor(scheme, block),
                  borderStrokeWidth: 1.5,
                  color: _blockColor(scheme, block).withValues(alpha: 0.35),
                ),
          ],
        ),
        MarkerLayer(
          markers: [
            for (final territory in territories)
              for (final block in territory.blocks)
                Marker(
                  point: _centroid(block.polygon),
                  width: 34,
                  height: 34,
                  child: _BlockNumber(
                    block: block,
                    color: _blockColor(scheme, block),
                    onTap: onBlockTap == null
                        ? null
                        : () => onBlockTap!(territory, block),
                  ),
                ),
          ],
        ),
      ],
    );
  }

  /// Red for never worked, amber past [overdueAfter], green otherwise.
  ///
  /// "Last worked" is the most useful fact in the system day to day -- it is
  /// what says where to go today -- so it is what drives the colour.
  Color _blockColor(ColorScheme scheme, core.Block block) {
    final since = block.timeSinceWorked(now);
    if (since == null) return scheme.error;
    return since > overdueAfter
        ? Colors.orange.shade800
        : Colors.green.shade700;
  }

  map.LatLng _initialCenter() {
    final points = [for (final territory in territories) ...territory.boundary];
    if (points.isEmpty) return const map.LatLng(-15.78, -47.93);
    final lat =
        points.map((p) => p.lat).reduce((a, b) => a + b) / points.length;
    final lng =
        points.map((p) => p.lng).reduce((a, b) => a + b) / points.length;
    return map.LatLng(lat, lng);
  }
}

/// The average of the vertices -- close enough to place a label, and far
/// cheaper than a real centroid.
map.LatLng _centroid(List<core.LatLng> ring) {
  final lat = ring.map((p) => p.lat).reduce((a, b) => a + b) / ring.length;
  final lng = ring.map((p) => p.lng).reduce((a, b) => a + b) / ring.length;
  return map.LatLng(lat, lng);
}

class _BlockNumber extends StatelessWidget {
  const _BlockNumber({required this.block, required this.color, this.onTap});

  final core.Block block;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2),
        ),
        child: Text(
          '${block.number}',
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 13,
          ),
        ),
      ),
    );
  }
}
