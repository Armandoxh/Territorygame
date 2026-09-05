import 'dart:ui';

/// One stop on a line. Positions are in a normalized 0–100 map space (the
/// painter scales to the widget); coordinates are chosen so consecutive
/// stations connect at 45°/90° angles — the classic transit-map look.
class StationDef {
  final String id;
  final String name;
  final double x;
  final double y;

  /// Riders per second who want to board here (before upgrades).
  final double demand;

  const StationDef({
    required this.id,
    required this.name,
    required this.x,
    required this.y,
    required this.demand,
  });

  Offset get pos => Offset(x, y);
}

/// A subway line: a colored path through stations. The train ping-pongs from
/// end to end, boarding waiting riders at every stop.
class LineDef {
  final String id;
  final String name;
  final Color color;
  final List<StationDef> stations;

  const LineDef({
    required this.id,
    required this.name,
    required this.color,
    required this.stations,
  });
}

/// A city — one map template in the ladder the player climbs. v0.1 ships New
/// Meridian's first line; the schema already fits the plan: more lines per
/// city (v0.2), then a 4–5 city progression (v0.4) — each city a fresh map
/// with its own flavor (Angel Bay ≈ LA, Lakewind ≈ Chicago, Fogport ≈ SF,
/// Kanto ≈ Tokyo). Fictional names on purpose: real transit branding is
/// trademarked; the *style* is the homage.
class CityDef {
  final String id;
  final String name;
  final String tagline;
  final List<LineDef> lines;

  const CityDef({
    required this.id,
    required this.name,
    required this.tagline,
    required this.lines,
  });
}

class Cities {
  Cities._();

  static const newMeridian = CityDef(
    id: 'new_meridian',
    name: 'New Meridian',
    tagline: 'The city that never stops riding.',
    lines: [
      LineDef(
        id: 'line1',
        name: '1 · Crosstown',
        color: Color(0xFFEE352E), // the classic red line
        stations: [
          StationDef(
              id: 'harbor', name: 'Harbor Yards', x: 15, y: 85, demand: 0.5),
          StationDef(
              id: 'union', name: 'Union Square', x: 40, y: 60, demand: 1.0),
          StationDef(
              id: 'grand', name: 'Grand Terminal', x: 60, y: 60, demand: 0.8),
          StationDef(
              id: 'museum', name: 'Museum Mile', x: 60, y: 35, demand: 0.6),
          StationDef(
              id: 'northgate', name: 'Northgate', x: 80, y: 15, demand: 0.4),
        ],
      ),
    ],
  );

  static const List<CityDef> all = [newMeridian];
}

/// Geometry of a line's path: station positions with cumulative distances, so
/// a train can be placed anywhere along it by a single scalar. Pure math —
/// shared by the economy (station triggers) and the painter (drawing).
class LinePath {
  LinePath(LineDef line) : points = [for (final s in line.stations) s.pos] {
    var d = 0.0;
    stationDistance = [0];
    for (var i = 1; i < points.length; i++) {
      d += (points[i] - points[i - 1]).distance;
      stationDistance.add(d);
    }
  }

  final List<Offset> points;

  /// Distance along the path of each station; last entry is the line length.
  late final List<double> stationDistance;

  double get length => stationDistance.last;

  /// Position on the map for a train [d] units along the path.
  Offset posAt(double d) {
    final clamped = d.clamp(0.0, length);
    for (var i = 1; i < points.length; i++) {
      if (clamped <= stationDistance[i]) {
        final segLen = stationDistance[i] - stationDistance[i - 1];
        final t = segLen == 0 ? 0.0 : (clamped - stationDistance[i - 1]) / segLen;
        return Offset.lerp(points[i - 1], points[i], t)!;
      }
    }
    return points.last;
  }
}
