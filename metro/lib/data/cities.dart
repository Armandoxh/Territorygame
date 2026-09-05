import 'dart:ui';

/// One stop in the city. Positions are in a normalized 0–100 map space; all
/// coordinates are chosen so consecutive stations on a line connect at
/// 45°/90° angles — the classic transit-map look. Stations are city-level so
/// two lines can share one (an interchange).
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

/// A subway line: a colored path through station ids. Trains ping-pong end to
/// end, boarding waiting riders at every stop.
class LineDef {
  final String id;
  final String name;

  /// The route-bullet letter/number ("1", "A", "7").
  final String bullet;
  final Color color;
  final List<String> stationIds;

  /// 0 = you start with it; otherwise buy it in the LINES panel.
  final double unlockCost;

  /// Cost of the line's 2nd train (each further train ×2.5).
  final double trainCost;

  const LineDef({
    required this.id,
    required this.name,
    required this.bullet,
    required this.color,
    required this.stationIds,
    required this.unlockCost,
    required this.trainCost,
  });
}

/// A city — one map template in the ladder. v0.2 fills New Meridian out to
/// three lines; the 4–5 city progression (Angel Bay ≈ LA, Lakewind ≈ Chicago,
/// Fogport ≈ SF, Kanto ≈ Tokyo) lands in v0.4. Fictional names on purpose:
/// real transit branding is trademarked; the *style* is the homage.
class CityDef {
  final String id;
  final String name;
  final String tagline;
  final List<StationDef> stations;
  final List<LineDef> lines;

  const CityDef({
    required this.id,
    required this.name,
    required this.tagline,
    required this.stations,
    required this.lines,
  });

  StationDef stationById(String id) =>
      stations.firstWhere((s) => s.id == id);

  LineDef lineById(String id) => lines.firstWhere((l) => l.id == id);
}

class Cities {
  Cities._();

  static const newMeridian = CityDef(
    id: 'new_meridian',
    name: 'New Meridian',
    tagline: 'The city that never stops riding.',
    stations: [
      // Line 1 corridor.
      StationDef(id: 'harbor', name: 'Harbor Yards', x: 15, y: 85, demand: 0.5),
      StationDef(id: 'union', name: 'Union Square', x: 40, y: 60, demand: 1.0),
      StationDef(id: 'grand', name: 'Grand Terminal', x: 60, y: 60, demand: 0.8),
      StationDef(id: 'museum', name: 'Museum Mile', x: 60, y: 35, demand: 0.6),
      StationDef(
          id: 'northgate', name: 'Northgate', x: 80, y: 15, demand: 0.4),
      // Line A corridor (interchange at Union Square).
      StationDef(
          id: 'southport', name: 'Southport', x: 40, y: 90, demand: 0.5),
      StationDef(
          id: 'midwest', name: 'Midtown West', x: 25, y: 45, demand: 0.7),
      StationDef(
          id: 'cathedral', name: 'Cathedral', x: 25, y: 25, demand: 0.5),
      StationDef(id: 'airport', name: 'Airport', x: 40, y: 10, demand: 0.9),
      // Line 7 corridor (interchange at Grand Terminal).
      StationDef(
          id: 'eastdocks', name: 'East Docks', x: 90, y: 75, demand: 0.6),
      StationDef(
          id: 'gaslight', name: 'Gaslight Qtr', x: 75, y: 60, demand: 0.7),
      StationDef(id: 'oldtown', name: 'Old Town', x: 45, y: 45, demand: 0.6),
      StationDef(id: 'stadium', name: 'Stadium', x: 45, y: 20, demand: 1.1),
    ],
    lines: [
      LineDef(
        id: 'line1',
        name: 'Crosstown Local',
        bullet: '1',
        color: Color(0xFFEE352E),
        stationIds: ['harbor', 'union', 'grand', 'museum', 'northgate'],
        unlockCost: 0,
        trainCost: 750,
      ),
      LineDef(
        id: 'lineA',
        name: 'Airport Express',
        bullet: 'A',
        color: Color(0xFF0039A6),
        stationIds: ['southport', 'union', 'midwest', 'cathedral', 'airport'],
        unlockCost: 4000,
        trainCost: 1500,
      ),
      LineDef(
        id: 'line7',
        name: 'Stadium Flyer',
        bullet: '7',
        color: Color(0xFFB933AD),
        stationIds: ['eastdocks', 'gaslight', 'grand', 'oldtown', 'stadium'],
        unlockCost: 40000,
        trainCost: 12000,
      ),
    ],
  );

  static const List<CityDef> all = [newMeridian];
}

/// Geometry of a line's path: station positions with cumulative distances, so
/// a train can be placed anywhere along it by a single scalar. Pure math —
/// shared by the economy (station triggers) and the painter (drawing).
class LinePath {
  LinePath(CityDef city, LineDef line)
      : points = [for (final id in line.stationIds) city.stationById(id).pos] {
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
        final t =
            segLen == 0 ? 0.0 : (clamped - stationDistance[i - 1]) / segLen;
        return Offset.lerp(points[i - 1], points[i], t)!;
      }
    }
    return points.last;
  }
}
