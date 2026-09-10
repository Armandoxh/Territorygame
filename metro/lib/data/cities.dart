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

  /// City-ladder economy scaling: later cities cost more to build in…
  final double costScale;

  /// …and their riders pay more per boarding (shown in the live fare).
  final double fareScale;
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
    this.costScale = 1,
    this.fareScale = 1,
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
    size: 520,
    stations: [
      // GENERATED from the approved design rig (tools/meridian_xl.py) —
      // regenerate there, get approval, then re-emit. Do not hand-edit
      // coordinates.
      StationDef(id: 's126_452', name: 'South Ferry', x: 126, y: 452, demand: 0.7),
      StationDef(id: 's158_452', name: 'Two Bridges', x: 158, y: 452, demand: 0.45),
      StationDef(id: 's158_420', name: 'Bayfront', x: 158, y: 420, demand: 0.45),
      StationDef(id: 's218_360', name: 'South Landing', x: 218, y: 360, demand: 0.45, labelSide: 1),
      StationDef(id: 's206_348', name: '12 St', x: 206, y: 348, demand: 0.7, labelSide: -1),
      StationDef(id: 's206_324', name: '24 St', x: 206, y: 324, demand: 0.45, labelSide: -1),
      StationDef(id: 's206_300', name: '36 St', x: 206, y: 300, demand: 0.45, labelSide: -1),
      StationDef(id: 's224_282', name: '45 St', x: 224, y: 282, demand: 0.7, labelSide: 1),
      StationDef(id: 's224_260', name: '56 St', x: 224, y: 260, demand: 0.7, labelSide: 1),
      StationDef(id: 's224_240', name: '66 St', x: 224, y: 240, demand: 0.7, labelSide: 1),
      StationDef(id: 's206_222', name: '75 St', x: 206, y: 222, demand: 0.45, labelSide: -1),
      StationDef(id: 's206_198', name: '87 St', x: 206, y: 198, demand: 0.7, labelSide: -1),
      StationDef(id: 's206_174', name: '99 St', x: 206, y: 174, demand: 0.45, labelSide: -1),
      StationDef(id: 's224_156', name: '108 St', x: 224, y: 156, demand: 0.45, labelSide: 1),
      StationDef(id: 's224_132', name: '120 St', x: 224, y: 132, demand: 0.7, labelSide: 1),
      StationDef(id: 's224_100', name: 'Half Moon', x: 224, y: 100, demand: 0.7, labelSide: 1),
      StationDef(id: 's224_68', name: 'North Point', x: 224, y: 68, demand: 0.3, labelSide: 1),
      StationDef(id: 's134_346', name: 'Harbor Pier', x: 134, y: 346, demand: 0.7),
      StationDef(id: 's158_346', name: 'Westgate', x: 158, y: 346, demand: 0.45),
      StationDef(id: 's176_328', name: 'Old Mill', x: 176, y: 328, demand: 0.45),
      StationDef(id: 's200_328', name: 'Union Sq', x: 200, y: 328, demand: 0.7),
      StationDef(id: 's224_304', name: '34 St', x: 224, y: 304, demand: 0.7, labelSide: 1),
      StationDef(id: 's236_292', name: 'Riverside', x: 236, y: 292, demand: 0.45),
      StationDef(id: 's266_292', name: 'Bedford Av', x: 266, y: 292, demand: 0.7),
      StationDef(id: 's296_322', name: 'Court Sq', x: 296, y: 322, demand: 0.7),
      StationDef(id: 's320_322', name: 'Steinway St', x: 320, y: 322, demand: 0.7),
      StationDef(id: 's230_348', name: 'Atlantic Av', x: 230, y: 348, demand: 0.45),
      StationDef(id: 's266_348', name: 'Myrtle Av', x: 266, y: 348, demand: 0.45),
      StationDef(id: 's290_348', name: 'DeKalb Av', x: 290, y: 348, demand: 0.45),
      StationDef(id: 's314_372', name: 'Kingsland Rd', x: 314, y: 372, demand: 0.45),
      StationDef(id: 's338_372', name: 'Metropolitan', x: 338, y: 372, demand: 0.3),
      StationDef(id: 's362_396', name: 'Terminal A', x: 362, y: 396, demand: 0.45),
      StationDef(id: 's394_396', name: 'Terminal B', x: 394, y: 396, demand: 0.45),
      StationDef(id: 's426_364', name: 'Airfield', x: 426, y: 364, demand: 0.3),
      StationDef(id: 's134_168', name: 'Seneca Av', x: 134, y: 168, demand: 0.7),
      StationDef(id: 's158_168', name: 'Woodhaven', x: 158, y: 168, demand: 0.45),
      StationDef(id: 's194_132', name: 'Junction Blvd', x: 194, y: 132, demand: 0.45),
      StationDef(id: 's266_132', name: 'Broadway Jct', x: 266, y: 132, demand: 0.45),
      StationDef(id: 's290_132', name: 'Sunset Pk', x: 290, y: 132, demand: 0.3),
      StationDef(id: 's338_84', name: 'Runway Rd', x: 338, y: 84, demand: 0.45),
      StationDef(id: 's386_84', name: 'Customs Hse', x: 386, y: 84, demand: 0.45),
      StationDef(id: 's438_84', name: 'Freight Yd', x: 438, y: 84, demand: 0.45, labelSide: -1),
      StationDef(id: 's438_124', name: 'Cedar Falls', x: 438, y: 124, demand: 0.7, labelSide: -1),
      StationDef(id: 's494_124', name: 'Maple Hts', x: 494, y: 124, demand: 0.7, labelSide: -1),
      StationDef(id: 's200_364', name: 'Bay Pkwy', x: 200, y: 364, demand: 0.3),
      StationDef(id: 's266_198', name: 'Ocean Pkwy', x: 266, y: 198, demand: 0.45, labelSide: -1),
      StationDef(id: 's290_198', name: 'Brighton', x: 290, y: 198, demand: 0.45),
      StationDef(id: 's314_174', name: 'Astoria Blvd', x: 314, y: 174, demand: 0.45),
      StationDef(id: 's338_174', name: 'Ditmars Blvd', x: 338, y: 174, demand: 0.3),
      StationDef(id: 's266_242', name: 'Queensview', x: 266, y: 242, demand: 0.3),
      StationDef(id: 's344_346', name: 'Forest Hls', x: 344, y: 346, demand: 0.45),
      StationDef(id: 's368_346', name: 'Kew Gdns', x: 368, y: 346, demand: 0.3),
      StationDef(id: 's302_138', name: 'Jamaica Ctr', x: 302, y: 138, demand: 0.3),
      StationDef(id: 's302_162', name: 'Greenpoint', x: 302, y: 162, demand: 0.7),
      StationDef(id: 's302_198', name: 'Nassau Av', x: 302, y: 198, demand: 0.45, labelSide: 1),
      StationDef(id: 's284_216', name: 'Classon Av', x: 284, y: 216, demand: 0.45),
      StationDef(id: 's284_252', name: 'Clinton Wash', x: 284, y: 252, demand: 0.45),
      StationDef(id: 's302_270', name: 'Fulton St', x: 302, y: 270, demand: 0.45),
      StationDef(id: 's302_306', name: 'Crown Hts', x: 302, y: 306, demand: 0.3),
      StationDef(id: 's134_146', name: 'Prospect Pk', x: 134, y: 146, demand: 0.3),
      StationDef(id: 's134_190', name: 'Church Av', x: 134, y: 190, demand: 0.45),
      StationDef(id: 's152_208', name: 'Newkirk Av', x: 152, y: 208, demand: 0.45),
      StationDef(id: 's152_252', name: 'Midwood', x: 152, y: 252, demand: 0.45),
      StationDef(id: 's134_270', name: 'Canarsie', x: 134, y: 270, demand: 0.45),
      StationDef(id: 's134_310', name: 'Livonia Av', x: 134, y: 310, demand: 0.45),
      StationDef(id: 's194_198', name: 'East End', x: 194, y: 198, demand: 0.3),
      StationDef(id: 's230_198', name: 'Harbor View', x: 230, y: 198, demand: 0.45),
      StationDef(id: 's266_162', name: 'Palisade', x: 266, y: 162, demand: 0.45),
      StationDef(id: 's326_138', name: 'Iron Docks', x: 326, y: 138, demand: 0.45),
      StationDef(id: 's362_138', name: 'Cargoport', x: 362, y: 138, demand: 0.3),
      StationDef(id: 's128_68', name: 'Birchwood', x: 128, y: 68, demand: 0.3),
      StationDef(id: 's160_68', name: 'Elm Sq', x: 160, y: 68, demand: 0.45),
      StationDef(id: 's192_100', name: 'Ashford', x: 192, y: 100, demand: 0.45),
      StationDef(id: 's272_100', name: 'Willow Bend', x: 272, y: 100, demand: 0.45),
      StationDef(id: 's304_100', name: 'Granite Pk', x: 304, y: 100, demand: 0.45),
      StationDef(id: 's336_100', name: 'Quarry St', x: 336, y: 100, demand: 0.45),
      StationDef(id: 's368_100', name: 'Millbrook', x: 368, y: 100, demand: 0.45),
      StationDef(id: 's400_68', name: 'Foundry Sq', x: 400, y: 68, demand: 0.45),
      StationDef(id: 's432_68', name: 'Steel Pier', x: 432, y: 68, demand: 0.3),
      StationDef(id: 's40_60', name: 'Coke Works', x: 40, y: 60, demand: 0.7, labelSide: -1),
      StationDef(id: 's72_60', name: 'Brickyard', x: 72, y: 60, demand: 0.7, labelSide: 1),
      StationDef(id: 's104_92', name: 'Tannery Row', x: 104, y: 92, demand: 0.45, labelSide: 1),
      StationDef(id: 's104_124', name: 'Wool Exchange', x: 104, y: 124, demand: 0.45, labelSide: 1),
      StationDef(id: 's104_156', name: 'Corn Hill', x: 104, y: 156, demand: 0.7, labelSide: 1),
      StationDef(id: 's104_188', name: 'Market Cross', x: 104, y: 188, demand: 0.3, labelSide: 1),
      StationDef(id: 's40_188', name: 'Fish Wharf', x: 40, y: 188, demand: 0.3, labelSide: -1),
      StationDef(id: 's40_220', name: 'Oyster Bay', x: 40, y: 220, demand: 0.45, labelSide: -1),
      StationDef(id: 's40_252', name: 'Clam Cove', x: 40, y: 252, demand: 0.45, labelSide: -1),
      StationDef(id: 's72_252', name: 'Herring Run', x: 72, y: 252, demand: 0.7, labelSide: 1),
      StationDef(id: 's104_252', name: 'Salmon Falls', x: 104, y: 252, demand: 0.45, labelSide: 1),
      StationDef(id: 's136_284', name: 'Trout Brook', x: 136, y: 284, demand: 0.45),
      StationDef(id: 's160_284', name: 'Beaver Dam', x: 160, y: 284, demand: 0.3),
      StationDef(id: 's20_140', name: 'Otter Creek', x: 20, y: 140, demand: 0.3, labelSide: 1),
      StationDef(id: 's20_172', name: 'Fox Hollow', x: 20, y: 172, demand: 0.45, labelSide: 1),
      StationDef(id: 's20_204', name: 'Wolf Point', x: 20, y: 204, demand: 0.45, labelSide: 1),
      StationDef(id: 's20_236', name: 'Bear Ridge', x: 20, y: 236, demand: 0.45, labelSide: 1),
      StationDef(id: 's20_268', name: 'Eagle Hts', x: 20, y: 268, demand: 0.45, labelSide: 1),
      StationDef(id: 's20_300', name: 'Hawk Hill', x: 20, y: 300, demand: 0.3, labelSide: 1),
      StationDef(id: 's270_266', name: 'Raven Ct', x: 270, y: 266, demand: 0.3),
      StationDef(id: 's302_234', name: 'Sparrow Ln', x: 302, y: 234, demand: 0.45),
      StationDef(id: 's334_234', name: 'Finch Grove', x: 334, y: 234, demand: 0.45),
      StationDef(id: 's366_234', name: 'Wren St', x: 366, y: 234, demand: 0.45),
      StationDef(id: 's398_234', name: 'Robin Rd', x: 398, y: 234, demand: 0.45),
      StationDef(id: 's430_266', name: 'Cardinal Sq', x: 430, y: 266, demand: 0.3),
      StationDef(id: 's72_92', name: 'Bluebird Av', x: 72, y: 92, demand: 0.45, labelSide: 1),
      StationDef(id: 's72_124', name: 'Dove Ct', x: 72, y: 124, demand: 0.45, labelSide: 1),
      StationDef(id: 's72_156', name: 'North Meadow', x: 72, y: 156, demand: 0.7, labelSide: 1),
      StationDef(id: 's72_188', name: 'South Meadow', x: 72, y: 188, demand: 0.45, labelSide: 1),
      StationDef(id: 's72_220', name: 'East Meadow', x: 72, y: 220, demand: 0.45, labelSide: 1),
      StationDef(id: 's72_284', name: 'West Meadow', x: 72, y: 284, demand: 0.45, labelSide: 1),
      StationDef(id: 's72_316', name: 'Long Acre', x: 72, y: 316, demand: 0.45, labelSide: 1),
      StationDef(id: 's72_348', name: 'Short Acre', x: 72, y: 348, demand: 0.45, labelSide: 1),
      StationDef(id: 's96_372', name: 'Broad Acre', x: 96, y: 372, demand: 0.3),
      StationDef(id: 's40_92', name: 'Green Acre', x: 40, y: 92, demand: 0.45, labelSide: -1),
      StationDef(id: 's40_124', name: 'Stone Acre', x: 40, y: 124, demand: 0.45, labelSide: -1),
      StationDef(id: 's40_156', name: 'High Acre', x: 40, y: 156, demand: 0.45, labelSide: -1),
      StationDef(id: 's134_378', name: 'Kingsbridge', x: 134, y: 378, demand: 0.45),
      StationDef(id: 's158_402', name: 'Queensbridge', x: 158, y: 402, demand: 0.45),
      StationDef(id: 's158_434', name: 'Dukes Ct', x: 158, y: 434, demand: 0.45),
      StationDef(id: 's270_434', name: 'Earls Ct', x: 270, y: 434, demand: 0.45),
      StationDef(id: 's302_466', name: 'Barons Gate', x: 302, y: 466, demand: 0.45),
      StationDef(id: 's334_466', name: 'Regent Row', x: 334, y: 466, demand: 0.45),
      StationDef(id: 's366_466', name: 'Crown Point', x: 366, y: 466, demand: 0.7),
      StationDef(id: 's318_282', name: 'Scepter St', x: 318, y: 282, demand: 0.3),
      StationDef(id: 's350_282', name: 'Orb Lane', x: 350, y: 282, demand: 0.45),
      StationDef(id: 's382_314', name: 'Throne Hill', x: 382, y: 314, demand: 0.45),
      StationDef(id: 's414_314', name: 'Anchor Wharf', x: 414, y: 314, demand: 0.45),
      StationDef(id: 's414_346', name: 'Beacon Pt', x: 414, y: 346, demand: 0.45),
      StationDef(id: 's414_378', name: 'Compass Rose', x: 414, y: 378, demand: 0.3),
      StationDef(id: 's302_36', name: 'Davit St', x: 302, y: 36, demand: 0.3),
      StationDef(id: 's334_36', name: 'Ensign Av', x: 334, y: 36, demand: 0.45),
      StationDef(id: 's366_36', name: 'Fathom Ct', x: 366, y: 36, demand: 0.45),
      StationDef(id: 's398_36', name: 'Galley Rd', x: 398, y: 36, demand: 0.45),
      StationDef(id: 's430_36', name: 'Helm St', x: 430, y: 36, demand: 0.45),
      StationDef(id: 's462_68', name: 'Inlet Av', x: 462, y: 68, demand: 0.7, labelSide: -1),
      StationDef(id: 's46_364', name: 'Jetty Rd', x: 46, y: 364, demand: 0.3, labelSide: 1),
      StationDef(id: 's46_396', name: 'Keel Ct', x: 46, y: 396, demand: 0.45, labelSide: 1),
      StationDef(id: 's46_428', name: 'Lighthouse', x: 46, y: 428, demand: 0.45, labelSide: 1),
      StationDef(id: 's78_428', name: 'Mast Hill', x: 78, y: 428, demand: 0.45),
      StationDef(id: 's102_452', name: 'Nautilus Sq', x: 102, y: 452, demand: 0.45),
      StationDef(id: 's346_404', name: 'Outrigger', x: 346, y: 404, demand: 0.45),
      StationDef(id: 's378_404', name: 'Porthole Pl', x: 378, y: 404, demand: 0.45),
      StationDef(id: 's410_436', name: 'Quarterdeck', x: 410, y: 436, demand: 0.45),
      StationDef(id: 's442_436', name: 'Rudder Row', x: 442, y: 436, demand: 0.3),
      StationDef(id: 's462_100', name: 'Spinnaker', x: 462, y: 100, demand: 0.45, labelSide: -1),
      StationDef(id: 's438_156', name: 'Tiller St', x: 438, y: 156, demand: 0.45, labelSide: -1),
      StationDef(id: 's462_180', name: 'Windlass Ct', x: 462, y: 180, demand: 0.45, labelSide: -1),
      StationDef(id: 's462_212', name: 'Alder Grove', x: 462, y: 212, demand: 0.45, labelSide: -1),
      StationDef(id: 's462_244', name: 'Basil Ct', x: 462, y: 244, demand: 0.45, labelSide: -1),
      StationDef(id: 's462_276', name: 'Clove Hill', x: 462, y: 276, demand: 0.45, labelSide: -1),
      StationDef(id: 's462_308', name: 'Dill Lane', x: 462, y: 308, demand: 0.45, labelSide: -1),
      StationDef(id: 's462_340', name: 'Fennel Sq', x: 462, y: 340, demand: 0.7, labelSide: -1),
      StationDef(id: 's398_466', name: 'Ginger Row', x: 398, y: 466, demand: 0.45),
      StationDef(id: 's430_466', name: 'Hazel Wood', x: 430, y: 466, demand: 0.45),
      StationDef(id: 's462_434', name: 'Ivy Ridge', x: 462, y: 434, demand: 0.45, labelSide: -1),
      StationDef(id: 's462_402', name: 'Juniper Av', x: 462, y: 402, demand: 0.45, labelSide: -1),
      StationDef(id: 's462_370', name: 'Kale Yard', x: 462, y: 370, demand: 0.45, labelSide: -1),
      StationDef(id: 's494_156', name: 'Laurel Pk', x: 494, y: 156, demand: 0.45, labelSide: -1),
      StationDef(id: 's494_188', name: 'Mint Hollow', x: 494, y: 188, demand: 0.45, labelSide: -1),
      StationDef(id: 's494_220', name: 'Nutmeg St', x: 494, y: 220, demand: 0.45, labelSide: -1),
      StationDef(id: 's494_252', name: 'Olive Branch', x: 494, y: 252, demand: 0.45, labelSide: -1),
      StationDef(id: 's494_284', name: 'Pepper Hill', x: 494, y: 284, demand: 0.3, labelSide: -1),
    ],
    lines: [
      LineDef(
        id: '1',
        name: 'Meridian Local',
        bullet: '1',
        color: Color(0xFFEE352E),
        stationIds: ['s126_452', 's158_452', 's158_420', 's218_360', 's206_348', 's206_324', 's206_300', 's224_282', 's224_260', 's224_240', 's206_222', 's206_198', 's206_174', 's224_156', 's224_132', 's224_100', 's224_68'],
        unlockCost: 0,
        trainCost: 750,
        plateX: 260,
        plateY: 146,
      ),
      LineDef(
        id: 'A',
        name: 'Harbor Runner',
        bullet: 'A',
        color: Color(0xFF0039A6),
        stationIds: ['s134_346', 's158_346', 's176_328', 's200_328', 's224_304', 's236_292', 's266_292', 's296_322', 's320_322'],
        unlockCost: 4000,
        trainCost: 1500,
        plateX: 150,
        plateY: 366,
      ),
      LineDef(
        id: 'L',
        name: 'South Crosstown',
        bullet: 'L',
        color: Color(0xFFA7A9AC),
        stationIds: ['s206_348', 's230_348', 's266_348', 's290_348', 's314_372', 's338_372', 's362_396', 's394_396', 's426_364'],
        unlockCost: 15000,
        trainCost: 4000,
        plateX: 260,
        plateY: 362,
      ),
      LineDef(
        id: 'M',
        name: 'Bridge Express',
        bullet: 'M',
        color: Color(0xFFFF6319),
        stationIds: ['s134_168', 's158_168', 's194_132', 's224_132', 's266_132', 's290_132', 's338_84', 's386_84', 's438_84', 's438_124', 's494_124'],
        unlockCost: 45000,
        trainCost: 12000,
        plateX: 162,
        plateY: 150,
      ),
      LineDef(
        id: 'N',
        name: 'Broadway Flyer',
        bullet: 'N',
        color: Color(0xFFFCCC0A),
        stationIds: ['s200_364', 's200_328', 's224_304', 's224_282', 's224_260', 's224_240', 's266_198', 's290_198', 's314_174', 's338_174'],
        unlockCost: 120000,
        trainCost: 30000,
        plateX: 306,
        plateY: 154,
      ),
      LineDef(
        id: 'J',
        name: 'Southeast Arrow',
        bullet: 'J',
        color: Color(0xFF996633),
        stationIds: ['s266_242', 's266_292', 's296_322', 's320_322', 's344_346', 's368_346'],
        unlockCost: 300000,
        trainCost: 75000,
        plateX: 354,
        plateY: 364,
      ),
      LineDef(
        id: 'G',
        name: 'Haven Loop',
        bullet: 'G',
        color: Color(0xFF6CBE45),
        stationIds: ['s302_138', 's302_162', 's302_198', 's284_216', 's284_252', 's302_270', 's302_306'],
        unlockCost: 700000,
        trainCost: 175000,
        plateX: 324,
        plateY: 230,
      ),
      LineDef(
        id: 'E',
        name: 'Westbank Line',
        bullet: 'E',
        color: Color(0xFF00933C),
        stationIds: ['s134_146', 's134_168', 's134_190', 's152_208', 's152_252', 's134_270', 's134_310', 's134_346'],
        unlockCost: 1500000,
        trainCost: 400000,
        plateX: 120,
        plateY: 230,
      ),
      LineDef(
        id: '7',
        name: 'North Crosstown',
        bullet: '7',
        color: Color(0xFFB933AD),
        stationIds: ['s194_198', 's206_198', 's230_198', 's266_162', 's302_162', 's326_138', 's362_138'],
        unlockCost: 3000000,
        trainCost: 750000,
        plateX: 260,
        plateY: 178,
      ),
      LineDef(
        id: '2',
        name: 'Northgate Limited',
        bullet: '2',
        color: Color(0xFF00A1DE),
        stationIds: ['s128_68', 's160_68', 's192_100', 's224_100', 's272_100', 's304_100', 's336_100', 's368_100', 's400_68', 's432_68'],
        unlockCost: 6000000,
        trainCost: 1500000,
        plateX: 250,
        plateY: 84,
      ),
      LineDef(
        id: 'C',
        name: 'Coke Works Local',
        bullet: 'C',
        color: Color(0xFF26A69A),
        stationIds: ['s40_60', 's40_92', 's40_124', 's40_156', 's72_156', 's104_156'],
        unlockCost: 10000000,
        trainCost: 2500000,
        plateX: 30,
        plateY: 36,
      ),
      LineDef(
        id: '3',
        name: 'Brickyard Branch',
        bullet: '3',
        color: Color(0xFFC60C30),
        stationIds: ['s40_60', 's72_60', 's104_92', 's104_124', 's104_156', 's104_188'],
        unlockCost: 16000000,
        trainCost: 4000000,
        plateX: 66,
        plateY: 32,
      ),
      LineDef(
        id: 'Q',
        name: 'Sound Ferryway',
        bullet: 'Q',
        color: Color(0xFF4A148C),
        stationIds: ['s46_364', 's46_396', 's46_428', 's78_428', 's102_452', 's126_452'],
        unlockCost: 25000000,
        trainCost: 6000000,
        plateX: 24,
        plateY: 380,
      ),
      LineDef(
        id: 'B',
        name: 'Westbank Trunk',
        bullet: 'B',
        color: Color(0xFF3F51B5),
        stationIds: ['s72_60', 's72_92', 's72_124', 's72_156', 's72_188', 's72_220', 's72_252', 's72_284', 's72_316', 's72_348', 's96_372'],
        unlockCost: 40000000,
        trainCost: 10000000,
        plateX: 114,
        plateY: 336,
      ),
      LineDef(
        id: '8',
        name: 'Haven Heights',
        bullet: '8',
        color: Color(0xFFC2185B),
        stationIds: ['s270_266', 's302_234', 's334_234', 's366_234', 's398_234', 's430_266'],
        unlockCost: 60000000,
        trainCost: 15000000,
        plateX: 344,
        plateY: 210,
      ),
      LineDef(
        id: '4',
        name: 'Meadow Crosstown',
        bullet: '4',
        color: Color(0xFF00695C),
        stationIds: ['s40_188', 's40_220', 's40_252', 's72_252', 's104_252', 's136_284', 's160_284'],
        unlockCost: 90000000,
        trainCost: 22000000,
        plateX: 54,
        plateY: 204,
      ),
      LineDef(
        id: 'H',
        name: 'Freight Harbor',
        bullet: 'H',
        color: Color(0xFF37474F),
        stationIds: ['s302_36', 's334_36', 's366_36', 's398_36', 's430_36', 's462_68'],
        unlockCost: 130000000,
        trainCost: 32000000,
        plateX: 350,
        plateY: 20,
      ),
      LineDef(
        id: 'D',
        name: 'Bay Bridge Express',
        bullet: 'D',
        color: Color(0xFF808000),
        stationIds: ['s134_346', 's134_378', 's158_402', 's158_434', 's270_434', 's302_466', 's334_466', 's366_466'],
        unlockCost: 190000000,
        trainCost: 47000000,
        plateX: 204,
        plateY: 418,
      ),
      LineDef(
        id: 'F',
        name: 'Airfield Flyer',
        bullet: 'F',
        color: Color(0xFFFFB300),
        stationIds: ['s318_282', 's350_282', 's382_314', 's414_314', 's414_346', 's414_378'],
        unlockCost: 280000000,
        trainCost: 70000000,
        plateX: 352,
        plateY: 332,
      ),
      LineDef(
        id: 'R',
        name: 'Terminal Runner',
        bullet: 'R',
        color: Color(0xFFE91E8C),
        stationIds: ['s290_348', 's314_372', 's346_404', 's378_404', 's410_436', 's442_436'],
        unlockCost: 400000000,
        trainCost: 100000000,
        plateX: 232,
        plateY: 408,
      ),
      LineDef(
        id: 'V',
        name: 'Eastport Trunk',
        bullet: 'V',
        color: Color(0xFF001F5B),
        stationIds: ['s462_68', 's462_100', 's438_124', 's438_156', 's462_180', 's462_212', 's462_244', 's462_276', 's462_308', 's462_340'],
        unlockCost: 550000000,
        trainCost: 140000000,
        plateX: 430,
        plateY: 200,
      ),
      LineDef(
        id: 'W',
        name: 'South Shoreline',
        bullet: 'W',
        color: Color(0xFF5A6B7A),
        stationIds: ['s366_466', 's398_466', 's430_466', 's462_434', 's462_402', 's462_370', 's462_340'],
        unlockCost: 750000000,
        trainCost: 190000000,
        plateX: 416,
        plateY: 490,
      ),
      LineDef(
        id: '6',
        name: 'Sound Coast Local',
        bullet: '6',
        color: Color(0xFF9575CD),
        stationIds: ['s20_140', 's20_172', 's20_204', 's20_236', 's20_268', 's20_300'],
        unlockCost: 1000000000,
        trainCost: 250000000,
        plateX: 44,
        plateY: 286,
      ),
      LineDef(
        id: 'Z',
        name: 'Eastport Local',
        bullet: 'Z',
        color: Color(0xFF6D4C41),
        stationIds: ['s494_124', 's494_156', 's494_188', 's494_220', 's494_252', 's494_284'],
        unlockCost: 1400000000,
        trainCost: 350000000,
        plateX: 486,
        plateY: 88,
      ),
    ],
    lands: [
      [
        Offset(16, 44),
        Offset(136, 44),
        Offset(168, 76),
        Offset(168, 464),
        Offset(136, 496),
        Offset(16, 496),
      ],
      [
        Offset(196, 56),
        Offset(228, 56),
        Offset(236, 64),
        Offset(236, 336),
        Offset(224, 372),
        Offset(206, 384),
        Offset(194, 372),
        Offset(188, 336),
        Offset(188, 64),
      ],
      [
        Offset(290, 20),
        Offset(500, 20),
        Offset(500, 500),
        Offset(300, 500),
        Offset(262, 462),
        Offset(262, 48),
      ],
    ],
    districts: [
      WaterLabel('WESTBANK', 48, 330, rotDeg: -90),
      WaterLabel('NORTHGATE', 380, 60),
      WaterLabel('LONG HAVEN', 330, 190),
      WaterLabel('EASTPORT', 462, 230, rotDeg: -90),
      WaterLabel('SOUTH SHORE', 380, 480),
      WaterLabel('MERIDIAN', 212, 220, rotDeg: -90),
    ],
    waterLabels: [
      WaterLabel('WEST RIVER', 176, 240, rotDeg: -90),
      WaterLabel('EAST RIVER', 249, 220, rotDeg: -90),
      WaterLabel('MERIDIAN BAY', 212, 460),
      WaterLabel('THE SOUND', 80, 508),
    ],
    parks: [
      ParkDef(340, 150, 26, 16, 6),
      ParkDef(140, 170, 13, 20, 4),
      ParkDef(316, 80, 14, 10, -5),
      ParkDef(368, 250, 12, 18, 9),
      ParkDef(212, 150, 10, 7, -3),
      ParkDef(60, 120, 12, 14, 5),
      ParkDef(420, 220, 14, 12, -6),
      ParkDef(330, 420, 16, 12, 4),
      ParkDef(90, 250, 10, 12, -3),
    ],
  );

  static const angelBay = CityDef(
    id: 'angel_bay',
    name: 'Angel Bay',
    size: 300,
    costScale: 10,
    fareScale: 8,
    stations: [
      // GENERATED from the approved design rig (tools/angelbay.py) —
      // regenerate there, get approval, then re-emit. Do not hand-edit
      // coordinates.
      StationDef(id: 's16_132', name: 'Angel Pier', x: 16, y: 132, demand: 0.7, labelSide: 1),
      StationDef(id: 's44_132', name: 'Twin Rocks', x: 44, y: 132, demand: 0.45),
      StationDef(id: 's68_156', name: 'Cannery Row', x: 68, y: 156, demand: 0.7, labelSide: -1),
      StationDef(id: 's96_156', name: 'Marina', x: 96, y: 156, demand: 0.7),
      StationDef(id: 's120_180', name: 'Bayview', x: 120, y: 180, demand: 0.45),
      StationDef(id: 's152_212', name: 'Costa Bella', x: 152, y: 212, demand: 0.45, labelSide: 1),
      StationDef(id: 's152_240', name: 'Anchor St', x: 152, y: 240, demand: 0.45, labelSide: 1),
      StationDef(id: 's176_264', name: 'Pelican Cove', x: 176, y: 264, demand: 0.45),
      StationDef(id: 's176_288', name: 'Boardwalk', x: 176, y: 288, demand: 0.7, labelSide: -1),
      StationDef(id: 's16_40', name: 'Cliffside', x: 16, y: 40, demand: 0.3, labelSide: 1),
      StationDef(id: 's16_72', name: 'Oak Knoll', x: 16, y: 72, demand: 0.45, labelSide: 1),
      StationDef(id: 's16_104', name: 'Laurel Cyn', x: 16, y: 104, demand: 0.45, labelSide: 1),
      StationDef(id: 's16_204', name: 'Presidio', x: 16, y: 204, demand: 0.45, labelSide: 1),
      StationDef(id: 's16_240', name: 'Fort Sur', x: 16, y: 240, demand: 0.45, labelSide: 1),
      StationDef(id: 's40_264', name: 'Lands End', x: 40, y: 264, demand: 0.3),
      StationDef(id: 's24_232', name: 'Ferry Landing', x: 24, y: 232, demand: 0.3),
      StationDef(id: 's48_232', name: 'Old Mission', x: 48, y: 232, demand: 0.45),
      StationDef(id: 's72_232', name: 'Punta Este', x: 72, y: 232, demand: 0.45),
      StationDef(id: 's104_232', name: 'Isla Chica', x: 104, y: 232, demand: 0.7),
      StationDef(id: 's140_232', name: 'Narrows East', x: 140, y: 232, demand: 0.7),
      StationDef(id: 's172_232', name: 'Copper Gate', x: 172, y: 232, demand: 0.45),
      StationDef(id: 's196_232', name: 'Union Depot', x: 196, y: 232, demand: 0.3),
      StationDef(id: 's60_40', name: 'Grand Mesa', x: 60, y: 40, demand: 0.7, labelSide: -1),
      StationDef(id: 's92_40', name: 'Roseland', x: 92, y: 40, demand: 0.45),
      StationDef(id: 's124_40', name: 'Falcon Ridge', x: 124, y: 40, demand: 0.45),
      StationDef(id: 's156_40', name: 'Deer Park', x: 156, y: 40, demand: 0.45),
      StationDef(id: 's188_40', name: 'Stonebridge', x: 188, y: 40, demand: 0.7, labelSide: 1),
      StationDef(id: 's220_72', name: 'Palm Ct', x: 220, y: 72, demand: 0.45),
      StationDef(id: 's252_72', name: 'Orchard', x: 252, y: 72, demand: 0.45),
      StationDef(id: 's284_104', name: 'Silver Lake', x: 284, y: 104, demand: 0.7, labelSide: -1),
      StationDef(id: 's60_16', name: 'Echo Hts', x: 60, y: 16, demand: 0.3, labelSide: -1),
      StationDef(id: 's60_72', name: 'Crescent', x: 60, y: 72, demand: 0.45, labelSide: -1),
      StationDef(id: 's60_104', name: 'Windward', x: 60, y: 104, demand: 0.45, labelSide: -1),
      StationDef(id: 's84_128', name: 'Salt Pt', x: 84, y: 128, demand: 0.45),
      StationDef(id: 's112_128', name: 'Coral Way', x: 112, y: 128, demand: 0.45),
      StationDef(id: 's112_156', name: 'Fog Pt', x: 112, y: 156, demand: 0.3, labelSide: 1),
      StationDef(id: 's284_16', name: 'Kings Rd', x: 284, y: 16, demand: 0.3, labelSide: -1),
      StationDef(id: 's284_48', name: 'Verano', x: 284, y: 48, demand: 0.45, labelSide: -1),
      StationDef(id: 's284_80', name: 'La Cumbre', x: 284, y: 80, demand: 0.45, labelSide: -1),
      StationDef(id: 's284_152', name: 'Estrella', x: 284, y: 152, demand: 0.45, labelSide: -1),
      StationDef(id: 's260_176', name: 'Camino Alto', x: 260, y: 176, demand: 0.45),
      StationDef(id: 's236_176', name: 'Puerto Sol', x: 236, y: 176, demand: 0.7, labelSide: -1),
      StationDef(id: 's236_208', name: 'Solano', x: 236, y: 208, demand: 0.7, labelSide: -1),
      StationDef(id: 's236_240', name: 'Alta Vista', x: 236, y: 240, demand: 0.7, labelSide: -1),
      StationDef(id: 's188_16', name: 'Seaglass', x: 188, y: 16, demand: 0.3, labelSide: 1),
      StationDef(id: 's188_64', name: 'Tidewater', x: 188, y: 64, demand: 0.45, labelSide: 1),
      StationDef(id: 's188_96', name: 'Pier Nine', x: 188, y: 96, demand: 0.45, labelSide: 1),
      StationDef(id: 's212_120', name: 'Wharf End', x: 212, y: 120, demand: 0.45),
      StationDef(id: 's212_152', name: 'El Dorado', x: 212, y: 152, demand: 0.45),
      StationDef(id: 's212_264', name: 'Sunset Clfs', x: 212, y: 264, demand: 0.3),
      StationDef(id: 's208_288', name: 'Gaviota', x: 208, y: 288, demand: 0.45),
      StationDef(id: 's240_288', name: 'Miramar', x: 240, y: 288, demand: 0.45),
      StationDef(id: 's268_260', name: 'Los Robles', x: 268, y: 260, demand: 0.45, labelSide: -1),
      StationDef(id: 's268_228', name: 'Cortez', x: 268, y: 228, demand: 0.45, labelSide: -1),
      StationDef(id: 's268_196', name: 'Halcyon', x: 268, y: 196, demand: 0.3, labelSide: -1),
      StationDef(id: 's36_28', name: 'Rincon', x: 36, y: 28, demand: 0.3, labelSide: -1),
      StationDef(id: 's36_60', name: 'Sea Cliff', x: 36, y: 60, demand: 0.45, labelSide: -1),
      StationDef(id: 's36_92', name: 'Junipero', x: 36, y: 92, demand: 0.45, labelSide: -1),
      StationDef(id: 's36_124', name: 'Terraza', x: 36, y: 124, demand: 0.45, labelSide: -1),
    ],
    lines: [
      LineDef(
        id: '1',
        name: 'Bayshore Local',
        bullet: '1',
        color: Color(0xFFEE352E),
        stationIds: ['s16_132', 's44_132', 's68_156', 's96_156', 's120_180', 's152_212', 's152_240', 's176_264', 's176_288'],
        unlockCost: 0,
        trainCost: 7500,
        plateX: 150,
        plateY: 20,
      ),
      LineDef(
        id: 'B',
        name: 'West Shore Line',
        bullet: 'B',
        color: Color(0xFF0039A6),
        stationIds: ['s16_40', 's16_72', 's16_104', 's16_132', 's16_204', 's16_240', 's40_264'],
        unlockCost: 40000,
        trainCost: 15000,
        plateX: 24,
        plateY: 24,
      ),
      LineDef(
        id: 'K',
        name: 'Narrows Line',
        bullet: 'K',
        color: Color(0xFF6CBE45),
        stationIds: ['s24_232', 's48_232', 's72_232', 's104_232', 's140_232', 's172_232', 's196_232'],
        unlockCost: 150000,
        trainCost: 40000,
        plateX: 104,
        plateY: 204,
      ),
      LineDef(
        id: '5',
        name: 'Uptown Express',
        bullet: '5',
        color: Color(0xFF00933C),
        stationIds: ['s60_40', 's92_40', 's124_40', 's156_40', 's188_40', 's220_72', 's252_72', 's284_104'],
        unlockCost: 450000,
        trainCost: 120000,
        plateX: 146,
        plateY: 58,
      ),
      LineDef(
        id: 'C',
        name: 'Westhill Local',
        bullet: 'C',
        color: Color(0xFFFF6319),
        stationIds: ['s60_16', 's60_40', 's60_72', 's60_104', 's84_128', 's112_128', 's112_156'],
        unlockCost: 1200000,
        trainCost: 300000,
        plateX: 88,
        plateY: 96,
      ),
      LineDef(
        id: 'T',
        name: 'Eastside Flyer',
        bullet: 'T',
        color: Color(0xFFFCCC0A),
        stationIds: ['s284_16', 's284_48', 's284_80', 's284_104', 's284_152', 's260_176', 's236_176', 's236_208', 's236_240'],
        unlockCost: 3000000,
        trainCost: 750000,
        plateX: 260,
        plateY: 130,
      ),
      LineDef(
        id: 'R',
        name: 'Midtown Arrow',
        bullet: 'R',
        color: Color(0xFFB933AD),
        stationIds: ['s188_16', 's188_40', 's188_64', 's188_96', 's212_120', 's212_152', 's236_176', 's236_208', 's236_240', 's212_264'],
        unlockCost: 7000000,
        trainCost: 1750000,
        plateX: 166,
        plateY: 118,
      ),
      LineDef(
        id: 'W',
        name: 'South Shore',
        bullet: 'W',
        color: Color(0xFFA7A9AC),
        stationIds: ['s176_288', 's208_288', 's240_288', 's268_260', 's268_228', 's268_196'],
        unlockCost: 15000000,
        trainCost: 4000000,
        plateX: 226,
        plateY: 266,
      ),
      LineDef(
        id: '9',
        name: 'Hillside Local',
        bullet: '9',
        color: Color(0xFF996633),
        stationIds: ['s36_28', 's36_60', 's36_92', 's36_124', 's68_156', 's96_156'],
        unlockCost: 30000000,
        trainCost: 7500000,
        plateX: 48,
        plateY: 142,
      ),
    ],
    lands: [
      [
        Offset(0, 0),
        Offset(300, 0),
        Offset(300, 300),
        Offset(168, 300),
        Offset(140, 272),
        Offset(140, 208),
        Offset(112, 180),
        Offset(64, 180),
        Offset(36, 152),
        Offset(0, 152),
      ],
      [
        Offset(0, 204),
        Offset(44, 204),
        Offset(72, 232),
        Offset(72, 252),
        Offset(48, 276),
        Offset(0, 276),
      ],
      [
        Offset(96, 216),
        Offset(114, 216),
        Offset(122, 224),
        Offset(122, 240),
        Offset(114, 248),
        Offset(96, 248),
        Offset(88, 240),
        Offset(88, 224),
      ],
    ],
    districts: [
      WaterLabel('WESTHILL', 48, 84, rotDeg: -90),
      WaterLabel('UPTOWN', 224, 124),
      WaterLabel('BAY FLATS', 216, 270),
    ],
    waterLabels: [
      WaterLabel('ANGEL BAY', 64, 194),
      WaterLabel('THE NARROWS', 131, 230, rotDeg: -90),
      WaterLabel('PACIFIC REACH', 64, 292),
    ],
    parks: [
      ParkDef(250, 132, 20, 14, 5),
      ParkDef(84, 60, 12, 16, -4),
      ParkDef(160, 84, 10, 8, 6),
      ParkDef(248, 220, 12, 16, -7),
      ParkDef(210, 60, 10, 7, 3),
    ],
  );

  /// The city ladder, in play order.
  static const List<CityDef> all = [newMeridian, angelBay];

  static CityDef byId(String id) => all.firstWhere((c) => c.id == id);
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
