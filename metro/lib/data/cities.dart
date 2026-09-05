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

  /// Hand-tuned label placement (map units). labelDy > 0: label sits below
  /// the dot at that offset; labelDy < 0: label sits above with its bottom at
  /// that offset; 0 = automatic (below, or above near the map's bottom edge).
  /// Dense corridors NEED these — three stations on one row will otherwise
  /// stack their labels.
  final double labelDx;
  final double labelDy;

  const StationDef({
    required this.id,
    required this.name,
    required this.x,
    required this.y,
    required this.demand,
    this.labelDx = 0,
    this.labelDy = 0,
  });

  Offset get pos => Offset(x, y);
}

/// A park block: flat green, each with its own size and slight rotation
/// (STYLE.md: asymmetrical variation — no two alike).
class ParkDef {
  final double cx;
  final double cy;
  final double w;
  final double h;
  final double rotDeg;
  const ParkDef(this.cx, this.cy, this.w, this.h, this.rotDeg);
}

/// A water-body label ("MERIDIAN HARBOR"), optionally rotated for rivers.
class WaterLabel {
  final String text;
  final double x;
  final double y;
  final double rotDeg;
  const WaterLabel(this.text, this.x, this.y, {this.rotDeg = 0});
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

  /// Where the on-map price plate sits while locked — hand-placed in open
  /// land (the path midpoint landed on interchanges and made a pileup).
  final double plateX;
  final double plateY;

  const LineDef({
    required this.id,
    required this.name,
    required this.bullet,
    required this.color,
    required this.stationIds,
    required this.unlockCost,
    required this.trainCost,
    this.plateX = 0,
    this.plateY = 0,
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

  /// Flat water polygons (closed), drawn under everything — the geography
  /// that makes the landmass read as a city.
  final List<List<Offset>> waters;
  final List<ParkDef> parks;
  final List<WaterLabel> waterLabels;

  const CityDef({
    required this.id,
    required this.name,
    required this.tagline,
    required this.stations,
    required this.lines,
    this.waters = const [],
    this.parks = const [],
    this.waterLabels = const [],
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
      // Line 1 corridor. Label offsets are hand-tuned: three stations share
      // the y=60 row, so their labels fan out instead of stacking.
      StationDef(
          id: 'harbor',
          name: 'Harbor Yards',
          x: 15,
          y: 85,
          demand: 0.4,
          labelDx: 2.5,
          labelDy: 3.8),
      StationDef(
          id: 'union',
          name: 'Union Square',
          x: 40,
          y: 60,
          demand: 0.9,
          labelDx: -9,
          labelDy: 4.5),
      StationDef(
          id: 'grand',
          name: 'Grand Terminal',
          x: 60,
          y: 60,
          demand: 0.7,
          labelDx: 13,
          labelDy: -6.5),
      StationDef(
          id: 'museum',
          name: 'Museum Mile',
          x: 60,
          y: 35,
          demand: 0.5,
          labelDx: -9.5,
          labelDy: 0),
      StationDef(
          id: 'northgate', name: 'Northgate', x: 80, y: 15, demand: 0.35),
      StationDef(
          id: 'brookside', name: 'Brookside', x: 27, y: 73, demand: 0.2),
      StationDef(
          id: 'cityhall',
          name: 'City Hall',
          x: 60,
          y: 47,
          demand: 0.3,
          labelDx: -8.5,
          labelDy: 4.5),
      StationDef(
          id: 'highridge',
          name: 'High Ridge',
          x: 70,
          y: 25,
          demand: 0.15,
          labelDx: -3,
          labelDy: 0),
      StationDef(
          id: 'ferryst',
          name: 'Ferry St',
          x: 40,
          y: 75,
          demand: 0.45,
          labelDx: -7,
          labelDy: 0),
      StationDef(
          id: 'westgate',
          name: 'Westgate',
          x: 32,
          y: 52,
          demand: 0.55,
          labelDx: -7,
          labelDy: 0),
      StationDef(
          id: 'riverbend',
          name: 'Riverbend',
          x: 82.5,
          y: 67.5,
          demand: 0.45),
      StationDef(
          id: 'garment',
          name: 'Garment Dist',
          x: 45,
          y: 30,
          demand: 0.55,
          labelDx: -8,
          labelDy: 0),
      // Line A corridor (interchange at Union Square).
      StationDef(
          id: 'southport',
          name: 'Southport',
          x: 40,
          y: 90,
          demand: 0.5,
          labelDx: 10,
          labelDy: -4.5),
      StationDef(
          id: 'midwest',
          name: 'Midtown West',
          x: 25,
          y: 45,
          demand: 0.7,
          labelDx: -8,
          labelDy: 4.5),
      StationDef(
          id: 'cathedral', name: 'Cathedral', x: 25, y: 25, demand: 0.5),
      StationDef(id: 'airport', name: 'Airport', x: 40, y: 10, demand: 0.9),
      // Line 7 corridor (interchange at Grand Terminal).
      StationDef(
          id: 'eastdocks', name: 'East Docks', x: 90, y: 75, demand: 0.6),
      StationDef(
          id: 'gaslight',
          name: 'Gaslight Qtr',
          x: 75,
          y: 60,
          demand: 0.7,
          labelDx: 3,
          labelDy: 4.5),
      StationDef(id: 'oldtown', name: 'Old Town', x: 45, y: 45, demand: 0.6),
      StationDef(id: 'stadium', name: 'Stadium', x: 45, y: 20, demand: 1.1),
    ],
    // Geography: a harbor along the south-west shore, the East River on the
    // right, a corner inlet up north — flat, textureless water — plus park
    // blocks, each its own size and tilt.
    waters: [
      [
        Offset(0, 68),
        Offset(6, 74),
        Offset(10, 84),
        Offset(13, 94),
        Offset(14, 100),
        Offset(0, 100),
      ],
      [
        Offset(100, 58),
        Offset(95, 64),
        Offset(93, 76),
        Offset(96, 90),
        Offset(100, 94),
      ],
      [
        Offset(86, 0),
        Offset(100, 0),
        Offset(100, 14),
      ],
    ],
    parks: [
      ParkDef(50, 73, 15, 8, 7),
      ParkDef(14, 16, 8, 11, 5),
      ParkDef(34, 30, 10, 6, -4),
      ParkDef(83, 42, 9, 7, 11),
    ],
    waterLabels: [
      WaterLabel('MERIDIAN\nHARBOR', 6.5, 86),
      WaterLabel('EAST RIVER', 96.5, 76, rotDeg: -90),
    ],
    lines: [
      LineDef(
        id: 'line1',
        name: 'Crosstown Local',
        bullet: '1',
        color: Color(0xFFEE352E),
        stationIds: ['harbor', 'brookside', 'union', 'grand', 'cityhall', 'museum', 'highridge', 'northgate'],
        unlockCost: 0,
        trainCost: 750,
      ),
      LineDef(
        id: 'lineA',
        name: 'Airport Express',
        bullet: 'A',
        color: Color(0xFF0039A6),
        stationIds: ['southport', 'ferryst', 'union', 'westgate', 'midwest', 'cathedral', 'airport'],
        unlockCost: 4000,
        trainCost: 1500,
        plateX: 13,
        plateY: 35,
      ),
      LineDef(
        id: 'line7',
        name: 'Stadium Flyer',
        bullet: '7',
        color: Color(0xFFB933AD),
        stationIds: ['eastdocks', 'riverbend', 'gaslight', 'grand', 'oldtown', 'garment', 'stadium'],
        unlockCost: 40000,
        trainCost: 12000,
        plateX: 69,
        plateY: 76.5,
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
