import 'dart:ui';

/// One stop in the city. Positions are in a normalized 0–[CityDef.size] map
/// space; all coordinates are chosen so consecutive stations on a line
/// connect at 45°/90° angles — the transit-diagram look. Stations are
/// city-level so two lines can share one (an interchange).
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

/// A text placed on the geography (water bodies, district names).
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

/// A city — one map template in the ladder. New Meridian is now a 240-unit
/// metropolis: the default view is the whole diagram (tiny, top-down, like
/// the real map) and you zoom all the way in. The 4–5 city progression
/// (Angel Bay ≈ LA, Lakewind ≈ Chicago, Fogport ≈ SF, Kanto ≈ Tokyo) lands
/// in v0.4 — each with its own size, coastlines, and districts, all data.
/// Fictional names on purpose: real transit branding is trademarked.
class CityDef {
  final String id;
  final String name;
  final String tagline;

  /// Side length of the square map space (station coords live in 0..size).
  final double size;
  final List<StationDef> stations;
  final List<LineDef> lines;

  /// The landmass outline (45°-cornered, floating in water).
  final List<Offset> land;

  /// Water channels cut into the land (closed polygons).
  final List<List<Offset>> waters;
  final List<ParkDef> parks;
  final List<WaterLabel> waterLabels;

  /// Big soft district names drawn UNDER the network, real-diagram style.
  final List<WaterLabel> districts;

  const CityDef({
    required this.id,
    required this.name,
    required this.tagline,
    this.size = 100,
    required this.stations,
    required this.lines,
    this.land = const [],
    this.waters = const [],
    this.parks = const [],
    this.waterLabels = const [],
    this.districts = const [],
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
    size: 240,
    stations: [
      // ---- Line 1 corridor (south-west to north-east) ----
      StationDef(id: 'battery', name: 'Battery Pt', x: 36, y: 228, demand: 0.3),
      StationDef(
          id: 'harbor',
          name: 'Harbor Yards',
          x: 36,
          y: 204,
          demand: 0.4,
          labelDx: 2.5,
          labelDy: 3.8),
      StationDef(
          id: 'brookside', name: 'Brookside', x: 65, y: 175, demand: 0.2),
      StationDef(
          id: 'union',
          name: 'Union Square',
          x: 96,
          y: 144,
          demand: 0.9,
          labelDx: -9,
          labelDy: 4.5),
      StationDef(
          id: 'grand',
          name: 'Grand Terminal',
          x: 144,
          y: 144,
          demand: 0.7,
          labelDx: 13,
          labelDy: -6.5),
      StationDef(
          id: 'cityhall',
          name: 'City Hall',
          x: 144,
          y: 113,
          demand: 0.3,
          labelDx: -8.5,
          labelDy: 4.5),
      StationDef(
          id: 'museum',
          name: 'Museum Mile',
          x: 144,
          y: 84,
          demand: 0.5,
          labelDx: -9.5,
          labelDy: 0),
      StationDef(
          id: 'highridge',
          name: 'High Ridge',
          x: 168,
          y: 60,
          demand: 0.15,
          labelDx: -3,
          labelDy: 0),
      StationDef(
          id: 'northgate', name: 'Northgate', x: 192, y: 36, demand: 0.35),
      StationDef(
          id: 'ironhills',
          name: 'Iron Hills',
          x: 204,
          y: 24,
          demand: 0.2,
          labelDx: 9,
          labelDy: 0),
      StationDef(
          id: 'palisade',
          name: 'Palisade',
          x: 216,
          y: 12,
          demand: 0.25,
          labelDx: 0,
          labelDy: 4.2),
      // ---- Line A corridor (south to north-west) ----
      StationDef(
          id: 'boardwalk', name: 'Boardwalk', x: 96, y: 228, demand: 0.4),
      StationDef(
          id: 'southport',
          name: 'Southport',
          x: 96,
          y: 216,
          demand: 0.5,
          labelDx: 10,
          labelDy: -4.5),
      StationDef(
          id: 'ferryst',
          name: 'Ferry St',
          x: 96,
          y: 180,
          demand: 0.45,
          labelDx: -7,
          labelDy: 0),
      StationDef(
          id: 'westgate',
          name: 'Westgate',
          x: 77,
          y: 125,
          demand: 0.55,
          labelDx: -7,
          labelDy: 0),
      StationDef(
          id: 'midwest',
          name: 'Midtown West',
          x: 60,
          y: 108,
          demand: 0.7,
          labelDx: -8,
          labelDy: 4.5),
      StationDef(
          id: 'cathedral', name: 'Cathedral', x: 60, y: 60, demand: 0.5),
      StationDef(id: 'airport', name: 'Airport', x: 96, y: 24, demand: 0.9),
      StationDef(
          id: 'cargocity',
          name: 'Cargo City',
          x: 120,
          y: 24,
          demand: 0.3,
          labelDx: 9,
          labelDy: 0),
      // ---- Line 7 corridor (east to south-center) ----
      StationDef(
          id: 'eastdocks', name: 'East Docks', x: 216, y: 180, demand: 0.6),
      StationDef(
          id: 'riverbend', name: 'Riverbend', x: 198, y: 162, demand: 0.45),
      StationDef(
          id: 'gaslight',
          name: 'Gaslight Qtr',
          x: 180,
          y: 144,
          demand: 0.7,
          labelDx: 3,
          labelDy: 4.5),
      StationDef(
          id: 'oldtown', name: 'Old Town', x: 108, y: 108, demand: 0.6),
      StationDef(
          id: 'garment',
          name: 'Garment Dist',
          x: 108,
          y: 72,
          demand: 0.55,
          labelDx: -8,
          labelDy: 0),
      StationDef(id: 'stadium', name: 'Stadium', x: 108, y: 48, demand: 1.1),
      StationDef(
          id: 'expo',
          name: 'Expo Park',
          x: 108,
          y: 24,
          demand: 0.35,
          labelDx: -9,
          labelDy: 0),
    ],
    lines: [
      LineDef(
        id: 'line1',
        name: 'Crosstown Local',
        bullet: '1',
        color: Color(0xFFEE352E),
        stationIds: [
          'battery', 'harbor', 'brookside', 'union', 'grand', 'cityhall',
          'museum', 'highridge', 'northgate', 'ironhills', 'palisade',
        ],
        unlockCost: 0,
        trainCost: 750,
      ),
      LineDef(
        id: 'lineA',
        name: 'Airport Express',
        bullet: 'A',
        color: Color(0xFF0039A6),
        stationIds: [
          'boardwalk', 'southport', 'ferryst', 'union', 'westgate',
          'midwest', 'cathedral', 'airport', 'cargocity',
        ],
        unlockCost: 4000,
        trainCost: 1500,
        plateX: 31,
        plateY: 84,
      ),
      LineDef(
        id: 'line7',
        name: 'Stadium Flyer',
        bullet: '7',
        color: Color(0xFFB933AD),
        stationIds: [
          'eastdocks', 'riverbend', 'gaslight', 'grand', 'oldtown',
          'garment', 'stadium', 'expo',
        ],
        unlockCost: 40000,
        trainCost: 12000,
        plateX: 166,
        plateY: 184,
      ),
    ],
    land: [
      Offset(19, 0),
      Offset(221, 0),
      Offset(240, 19),
      Offset(240, 221),
      Offset(221, 240),
      Offset(19, 240),
      Offset(0, 221),
      Offset(0, 19),
    ],
    districts: [
      WaterLabel('HARBORSIDE', 65, 158),
      WaterLabel('EASTBANK', 190, 125),
      WaterLabel('NORTH HEIGHTS', 160, 18),
    ],
    waters: [
      [
        Offset(0, 132),
        Offset(14, 149),
        Offset(14, 178),
        Offset(29, 197),
        Offset(29, 240),
        Offset(0, 240),
      ],
      [
        Offset(240, 115),
        Offset(223, 134),
        Offset(221, 168),
        Offset(228, 206),
        Offset(240, 221),
      ],
      [
        Offset(216, 0),
        Offset(240, 0),
        Offset(240, 24),
      ],
      [
        Offset(0, 0),
        Offset(38, 0),
        Offset(0, 38),
      ],
    ],
    parks: [
      ParkDef(120, 175, 26, 14, 7),
      ParkDef(34, 38, 14, 19, 5),
      ParkDef(82, 72, 17, 10, -4),
      ParkDef(199, 101, 15, 12, 11),
    ],
    waterLabels: [
      WaterLabel('MERIDIAN\nHARBOR', 15, 206),
      WaterLabel('EAST RIVER', 232, 182, rotDeg: -90),
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
