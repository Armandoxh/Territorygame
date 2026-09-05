import 'dart:ui';

/// One stop in the city. Positions live in a normalized 0–[CityDef.size] map
/// space; all line segments run at 45°/90° only, and no line makes a 90°
/// turn — direction changes are 45° per bend, like real track.
class StationDef {
  final String id;
  final String name;
  final double x;
  final double y;

  /// Riders per second who want to board here (before upgrades).
  final double demand;

  /// Label placement: 0 = auto below/above; -1 = left of the dot; 1 = right.
  final int labelSide;

  const StationDef({
    required this.id,
    required this.name,
    required this.x,
    required this.y,
    required this.demand,
    this.labelSide = 0,
  });

  Offset get pos => Offset(x, y);
}

/// A park block: flat green, each its own size and slight rotation.
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

/// A subway line: a unique-color route through station ids. Short shared
/// corridors (≤3 stops) with another line render side-by-side; trains
/// ping-pong end to end, boarding at every stop.
class LineDef {
  final String id;
  final String name;
  final String bullet;
  final Color color;
  final List<String> stationIds;

  /// 0 = you start with it; otherwise buy it in the LINES panel.
  final double unlockCost;

  /// Cost of the line's 2nd train (each further train ×2.5).
  final double trainCost;

  /// Where the on-map price plate sits while locked (hand-placed).
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

/// A city — the player-approved scattered network: 9 unique-color lines,
/// each with its own territory, meeting at interchanges and briefly pairing
/// on shared corridors. Fictional names on purpose (real transit branding is
/// trademarked). Future cities are new data files, same schema.
class CityDef {
  final String id;
  final String name;

  /// Side length of the square map space.
  final double size;
  final List<StationDef> stations;
  final List<LineDef> lines;

  /// Land masses (45°-cornered), floating in the water frame.
  final List<List<Offset>> lands;
  final List<ParkDef> parks;
  final List<WaterLabel> waterLabels;

  /// Big soft district names drawn UNDER the network.
  final List<WaterLabel> districts;

  const CityDef({
    required this.id,
    required this.name,
    this.size = 100,
    required this.stations,
    required this.lines,
    this.lands = const [],
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
    size: 300,
    stations: [
      // GENERATED from the approved design rig (tools/mapmock.py) —
      // regenerate there, get approval, then re-emit. Do not hand-edit
      // coordinates.
      StationDef(id: 's96_238', name: '12 St', x: 96, y: 238, demand: 0.7, labelSide: -1),
      StationDef(id: 's96_214', name: '24 St', x: 96, y: 214, demand: 0.45, labelSide: -1),
      StationDef(id: 's96_190', name: '36 St', x: 96, y: 190, demand: 0.45, labelSide: -1),
      StationDef(id: 's114_172', name: '45 St', x: 114, y: 172, demand: 0.7, labelSide: 1),
      StationDef(id: 's114_150', name: '56 St', x: 114, y: 150, demand: 0.7, labelSide: 1),
      StationDef(id: 's114_130', name: '66 St', x: 114, y: 130, demand: 0.7, labelSide: 1),
      StationDef(id: 's96_112', name: '75 St', x: 96, y: 112, demand: 0.45, labelSide: -1),
      StationDef(id: 's96_88', name: '87 St', x: 96, y: 88, demand: 0.7, labelSide: -1),
      StationDef(id: 's96_64', name: '99 St', x: 96, y: 64, demand: 0.45, labelSide: -1),
      StationDef(id: 's114_46', name: '108 St', x: 114, y: 46, demand: 0.45, labelSide: 1),
      StationDef(id: 's114_22', name: '120 St', x: 114, y: 22, demand: 0.7, labelSide: 1),
      StationDef(id: 's24_236', name: 'Harbor Pier', x: 24, y: 236, demand: 0.7),
      StationDef(id: 's48_236', name: 'Westgate', x: 48, y: 236, demand: 0.45),
      StationDef(id: 's66_218', name: 'Old Mill', x: 66, y: 218, demand: 0.45),
      StationDef(id: 's90_218', name: 'Union Sq', x: 90, y: 218, demand: 0.7, labelSide: -1),
      StationDef(id: 's114_194', name: '34 St', x: 114, y: 194, demand: 0.7, labelSide: 1),
      StationDef(id: 's126_182', name: 'Riverside', x: 126, y: 182, demand: 0.45),
      StationDef(id: 's156_182', name: 'Bedford Av', x: 156, y: 182, demand: 0.7),
      StationDef(id: 's186_212', name: 'Court Sq', x: 186, y: 212, demand: 0.7),
      StationDef(id: 's210_212', name: 'Steinway St', x: 210, y: 212, demand: 0.7),
      StationDef(id: 's120_238', name: 'Atlantic Av', x: 120, y: 238, demand: 0.45),
      StationDef(id: 's156_238', name: 'Myrtle Av', x: 156, y: 238, demand: 0.45),
      StationDef(id: 's180_238', name: 'DeKalb Av', x: 180, y: 238, demand: 0.45),
      StationDef(id: 's204_262', name: 'Kingsland Rd', x: 204, y: 262, demand: 0.45),
      StationDef(id: 's228_262', name: 'Metropolitan', x: 228, y: 262, demand: 0.3),
      StationDef(id: 's24_58', name: 'Seneca Av', x: 24, y: 58, demand: 0.7),
      StationDef(id: 's48_58', name: 'Woodhaven', x: 48, y: 58, demand: 0.45),
      StationDef(id: 's84_22', name: 'Junction Blvd', x: 84, y: 22, demand: 0.45),
      StationDef(id: 's156_22', name: 'Broadway Jct', x: 156, y: 22, demand: 0.45),
      StationDef(id: 's180_22', name: 'Sunset Pk', x: 180, y: 22, demand: 0.3),
      StationDef(id: 's90_254', name: 'Bay Pkwy', x: 90, y: 254, demand: 0.3),
      StationDef(id: 's156_88', name: 'Ocean Pkwy', x: 156, y: 88, demand: 0.45, labelSide: -1),
      StationDef(id: 's180_88', name: 'Brighton', x: 180, y: 88, demand: 0.45),
      StationDef(id: 's204_64', name: 'Astoria Blvd', x: 204, y: 64, demand: 0.45),
      StationDef(id: 's228_64', name: 'Ditmars Blvd', x: 228, y: 64, demand: 0.3),
      StationDef(id: 's156_132', name: 'Queensview', x: 156, y: 132, demand: 0.3),
      StationDef(id: 's234_236', name: 'Forest Hls', x: 234, y: 236, demand: 0.45),
      StationDef(id: 's258_236', name: 'Kew Gdns', x: 258, y: 236, demand: 0.3),
      StationDef(id: 's192_28', name: 'Jamaica Ctr', x: 192, y: 28, demand: 0.3),
      StationDef(id: 's192_52', name: 'Greenpoint', x: 192, y: 52, demand: 0.7),
      StationDef(id: 's192_88', name: 'Nassau Av', x: 192, y: 88, demand: 0.45, labelSide: 1),
      StationDef(id: 's174_106', name: 'Classon Av', x: 174, y: 106, demand: 0.45),
      StationDef(id: 's174_142', name: 'Clinton Wash', x: 174, y: 142, demand: 0.45),
      StationDef(id: 's192_160', name: 'Fulton St', x: 192, y: 160, demand: 0.45),
      StationDef(id: 's192_196', name: 'Crown Hts', x: 192, y: 196, demand: 0.3),
      StationDef(id: 's24_36', name: 'Prospect Pk', x: 24, y: 36, demand: 0.3),
      StationDef(id: 's24_80', name: 'Church Av', x: 24, y: 80, demand: 0.45),
      StationDef(id: 's42_98', name: 'Newkirk Av', x: 42, y: 98, demand: 0.45),
      StationDef(id: 's42_142', name: 'Midwood', x: 42, y: 142, demand: 0.45),
      StationDef(id: 's24_160', name: 'Canarsie', x: 24, y: 160, demand: 0.45),
      StationDef(id: 's24_200', name: 'Livonia Av', x: 24, y: 200, demand: 0.45),
      StationDef(id: 's84_88', name: 'East End', x: 84, y: 88, demand: 0.3, labelSide: -1),
      StationDef(id: 's120_88', name: 'Harbor View', x: 120, y: 88, demand: 0.45),
      StationDef(id: 's156_52', name: 'Palisade', x: 156, y: 52, demand: 0.45),
      StationDef(id: 's216_28', name: 'Iron Docks', x: 216, y: 28, demand: 0.45),
      StationDef(id: 's252_28', name: 'Cargoport', x: 252, y: 28, demand: 0.3),
    ],
    lines: [
      LineDef(
        id: '1',
        name: 'Meridian Local',
        bullet: '1',
        color: Color(0xFFEE352E),
        stationIds: ['s96_238', 's96_214', 's96_190', 's114_172', 's114_150', 's114_130', 's96_112', 's96_88', 's96_64', 's114_46', 's114_22'],
        unlockCost: 0,
        trainCost: 750,
        plateX: 150,
        plateY: 36,
      ),
      LineDef(
        id: 'A',
        name: 'Harbor Runner',
        bullet: 'A',
        color: Color(0xFF0039A6),
        stationIds: ['s24_236', 's48_236', 's66_218', 's90_218', 's114_194', 's126_182', 's156_182', 's186_212', 's210_212'],
        unlockCost: 4000,
        trainCost: 1500,
        plateX: 40,
        plateY: 256,
      ),
      LineDef(
        id: 'L',
        name: 'South Crosstown',
        bullet: 'L',
        color: Color(0xFFA7A9AC),
        stationIds: ['s96_238', 's120_238', 's156_238', 's180_238', 's204_262', 's228_262'],
        unlockCost: 15000,
        trainCost: 4000,
        plateX: 150,
        plateY: 252,
      ),
      LineDef(
        id: 'M',
        name: 'Bridge Express',
        bullet: 'M',
        color: Color(0xFFFF6319),
        stationIds: ['s24_58', 's48_58', 's84_22', 's114_22', 's156_22', 's180_22'],
        unlockCost: 45000,
        trainCost: 12000,
        plateX: 52,
        plateY: 40,
      ),
      LineDef(
        id: 'N',
        name: 'Broadway Flyer',
        bullet: 'N',
        color: Color(0xFFFCCC0A),
        stationIds: ['s90_254', 's90_218', 's114_194', 's114_172', 's114_150', 's114_130', 's156_88', 's180_88', 's204_64', 's228_64'],
        unlockCost: 120000,
        trainCost: 30000,
        plateX: 196,
        plateY: 44,
      ),
      LineDef(
        id: 'J',
        name: 'Southeast Arrow',
        bullet: 'J',
        color: Color(0xFF996633),
        stationIds: ['s156_132', 's156_182', 's186_212', 's210_212', 's234_236', 's258_236'],
        unlockCost: 300000,
        trainCost: 75000,
        plateX: 244,
        plateY: 254,
      ),
      LineDef(
        id: 'G',
        name: 'Haven Loop',
        bullet: 'G',
        color: Color(0xFF6CBE45),
        stationIds: ['s192_28', 's192_52', 's192_88', 's174_106', 's174_142', 's192_160', 's192_196'],
        unlockCost: 700000,
        trainCost: 175000,
        plateX: 214,
        plateY: 120,
      ),
      LineDef(
        id: 'E',
        name: 'Westbank Line',
        bullet: 'E',
        color: Color(0xFF00933C),
        stationIds: ['s24_36', 's24_58', 's24_80', 's42_98', 's42_142', 's24_160', 's24_200', 's24_236'],
        unlockCost: 1500000,
        trainCost: 400000,
        plateX: 10,
        plateY: 120,
      ),
      LineDef(
        id: '7',
        name: 'North Crosstown',
        bullet: '7',
        color: Color(0xFFB933AD),
        stationIds: ['s84_88', 's96_88', 's120_88', 's156_52', 's192_52', 's216_28', 's252_28'],
        unlockCost: 3000000,
        trainCost: 750000,
        plateX: 150,
        plateY: 68,
      ),
    ],
    lands: [
      [
        Offset(0, 0),
        Offset(46, 0),
        Offset(58, 46),
        Offset(58, 254),
        Offset(46, 300),
        Offset(0, 300),
      ],
      [
        Offset(78, 14),
        Offset(114, 14),
        Offset(126, 26),
        Offset(126, 214),
        Offset(114, 250),
        Offset(96, 262),
        Offset(84, 250),
        Offset(78, 214),
      ],
      [
        Offset(158, 0),
        Offset(300, 0),
        Offset(300, 300),
        Offset(170, 300),
        Offset(152, 272),
        Offset(152, 28),
      ],
    ],
    districts: [
      WaterLabel('WESTBANK', 24, 150, rotDeg: -90),
      WaterLabel('LONG HAVEN', 240, 140),
    ],
    waterLabels: [
      WaterLabel('WEST RIVER', 68, 120, rotDeg: -90),
      WaterLabel('EAST RIVER', 139, 110, rotDeg: -90),
      WaterLabel('MERIDIAN BAY', 105, 287),
    ],
    parks: [
      ParkDef(230, 180, 26, 16, 6),
      ParkDef(30, 60, 13, 20, 4),
      ParkDef(206, 70, 14, 10, -5),
      ParkDef(258, 140, 12, 18, 9),
      ParkDef(102, 40, 10, 7, -3),
    ],
  );
}

/// Geometry of a line's path: station positions with cumulative distances.
/// Pure math — shared by the economy (station triggers) and the painter.
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

  /// Index of the segment containing distance [d] (0-based; clamped).
  int segmentAt(double d) {
    for (var i = 1; i < stationDistance.length; i++) {
      if (d <= stationDistance[i]) return i - 1;
    }
    return stationDistance.length - 2;
  }

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
