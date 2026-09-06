import 'dart:math';
import 'dart:ui' show Offset;

import 'package:flutter/foundation.dart';

import '../data/cities.dart';

/// One train ping-ponging a line.
class TrainState {
  TrainState({
    required this.lineId,
    required this.distance,
    required this.direction,
    required this.dwell,
    required this.target,
  });

  final String lineId;
  double distance;
  int direction; // 1 = toward last station, -1 = back
  double dwell;
  int target; // next station index on the line, in travel direction

  Map<String, dynamic> toJson() => {
        'lineId': lineId,
        'distance': distance,
        'direction': direction,
        'dwell': dwell,
        'target': target,
      };

  factory TrainState.fromJson(Map<String, dynamic> j) => TrainState(
        lineId: j['lineId'] as String,
        distance: (j['distance'] as num).toDouble(),
        direction: j['direction'] as int,
        dwell: (j['dwell'] as num).toDouble(),
        target: j['target'] as int,
      );
}

/// A network-wide upgrade: one lever that applies to every line at once —
/// the counterpart to the per-line sheet. Data-only; the engine wires each
/// id to its effect.
class GlobalUpgradeDef {
  const GlobalUpgradeDef({
    required this.id,
    required this.name,
    required this.blurb,
    required this.baseCost,
    required this.growth,
    required this.maxLevel,
  });

  final String id;
  final String name;
  final String blurb;
  final double baseCost;
  final double growth;
  final int maxLevel;
}

/// The whole simulation: one city, unlockable lines, any number of trains,
/// per-station food courts. Pure and deterministic — [tick] advances the
/// world by dt seconds with no RNG, so the balance harness replays it
/// exactly. The UI drives it with a Ticker; the tests drive it with a loop.
class GameState extends ChangeNotifier {
  GameState() {
    for (final line in city.lines) {
      paths[line.id] = LinePath(city, line);
    }
    _buildSegmentLanes();
    for (final s in city.stations) {
      waitingUp[s.id] = 0;
      waitingDown[s.id] = 0;
      foodLevel[s.id] = 0;
    }
    unlockedLineIds.add(city.lines.first.id);
    _recomputeServed();
    trains.add(_spawnTrain(city.lines.first));
  }

  // ---- Static tuning (the balance harness pins the outcomes) ----
  /// A clean, player-checkable number: riders boarded × \$2 = the pop you see.
  static const double fare = 2.0;

  /// Scales raw station demand. Tuned TOGETHER with the base car capacity
  /// below: the pair keeps a level-0 line just past the supply/demand
  /// balance point, where busy stops saturate (cars/speed/trains pay off)
  /// and quieter stops get cleared (access/marketing pay off). Raising
  /// demand without capacity re-saturates everything and kills the
  /// demand-side upgrades — the harness's "must show up" guards pin both.
  static const double demandScale = 1.15;
  static const double baseSpeed = 24;
  static const double dwellTime = 0.9; // seconds stopped at a station
  static const double stationCap = 60; // waiting riders cap per station
  static const int levelMax = 10;
  static const int foodMax = 5;
  static const double foodBonusPerLevel = 0.4; // extra $ per rider boarding
  static const double offlineEfficiency = 0.5; // idle pays 50% of live rate
  static const int maxOfflineSeconds = 8 * 3600;

  final CityDef city = Cities.newMeridian;
  final Map<String, LinePath> paths = {};

  /// Per line, per path segment: the perpendicular lane offset (map units)
  /// used where lines share a corridor — the side-by-side rendering the map
  /// was approved with. Precomputed once; lanes are reserved by ALL lines
  /// (locked included) so geometry never shifts when a line unlocks.
  final Map<String, List<double>> segLane = {};
  static const double laneGap = 3.2;

  String _segKey(Offset a, Offset b) {
    final swap = (a.dx > b.dx) || (a.dx == b.dx && a.dy > b.dy);
    final p = swap ? b : a;
    final q = swap ? a : b;
    return '${p.dx},${p.dy}|${q.dx},${q.dy}';
  }

  void _buildSegmentLanes() {
    final users = <String, List<String>>{};
    for (final line in city.lines) {
      final pts = paths[line.id]!.points;
      for (var i = 0; i < pts.length - 1; i++) {
        users.putIfAbsent(_segKey(pts[i], pts[i + 1]), () => []).add(line.id);
      }
    }
    for (final line in city.lines) {
      final pts = paths[line.id]!.points;
      final lanes = <double>[];
      for (var i = 0; i < pts.length - 1; i++) {
        final u = users[_segKey(pts[i], pts[i + 1])]!..sort();
        lanes.add((u.indexOf(line.id) - (u.length - 1) / 2) * laneGap);
      }
      segLane[line.id] = lanes;
    }
  }

  // ---- Money & lifetime stats ----
  double cash = 0;
  double totalEarned = 0;
  double totalRiders = 0;

  // ---- Live world ----
  final Set<String> unlockedLineIds = {};
  final List<TrainState> trains = [];

  /// Waiting riders per station, split by DEPARTING direction — the uptown
  /// and downtown platforms. A train boards only the bucket matching the
  /// direction it leaves the station with; arrivals fill only platforms an
  /// unlocked line actually departs from.
  final Map<String, double> waitingUp = {};
  final Map<String, double> waitingDown = {};
  final Map<String, int> foodLevel = {};

  /// Stations touched by at least one unlocked line — the only ones riders
  /// show up at — and which unlocked lines serve each.
  Set<String> _served = {};
  Map<String, List<String>> _linesServing = {};

  /// Stations some unlocked line DEPARTS with direction +1 / −1 — the
  /// platforms riders can actually be picked up from.
  Set<String> _upServed = {};
  Set<String> _downServed = {};

  /// Bumped on every boarding so the map can spawn a floating "+$" exactly
  /// once per stop.
  int boardSeq = 0;
  String lastBoardStationId = '';
  double lastBoardAmount = 0;
  int lastBoardCount = 0;

  // ---- Network-wide upgrades (the NETWORK tab) ----
  static const List<GlobalUpgradeDef> globalUpgrades = [
    GlobalUpgradeDef(
        id: 'signal',
        name: 'SIGNAL MODERNIZATION',
        blurb: '+4% train speed, every line',
        baseCost: 2500,
        growth: 2.0,
        maxLevel: 10),
    GlobalUpgradeDef(
        id: 'doors',
        name: 'PLATFORM DOORS',
        blurb: 'Stops 5% shorter at every station',
        baseCost: 2000,
        growth: 2.0,
        maxLevel: 10),
    GlobalUpgradeDef(
        id: 'marketing',
        name: 'CITY MARKETING',
        blurb: '+5% ridership across the city',
        baseCost: 3000,
        growth: 2.1,
        maxLevel: 10),
    GlobalUpgradeDef(
        id: 'fare',
        name: 'FARE REVIEW',
        blurb: '+\$0.25 fare per rider',
        baseCost: 5000,
        growth: 2.5,
        maxLevel: 8),
  ];

  final Map<String, int> globalLevels = {};

  int globalLevelOf(String id) => globalLevels[id] ?? 0;

  static GlobalUpgradeDef globalById(String id) =>
      globalUpgrades.firstWhere((u) => u.id == id);

  double nextGlobalCost(String id) =>
      globalById(id).baseCost *
      pow(globalById(id).growth, globalLevelOf(id)).toDouble();

  bool buyGlobal(String id) => _buy(
      globalLevelOf(id) < globalById(id).maxLevel, nextGlobalCost(id), () {
        globalLevels[id] = globalLevelOf(id) + 1;
      });

  /// The fare riders actually pay right now (base + fare reviews) — shown
  /// live in the header so income stays player-checkable.
  double get currentFare => fare + 0.25 * globalLevelOf('fare');

  /// Seconds stopped at each station, after platform doors.
  double get effectiveDwell => dwellTime * (1 - 0.05 * globalLevelOf('doors'));

  // ---- Per-line upgrades (scoped, never blanketed) ----
  final Map<String, int> speedLevels = {};
  final Map<String, int> carLevels = {};
  final Map<String, int> accessLevels = {};

  int speedLevelOf(String lineId) => speedLevels[lineId] ?? 0;
  int carLevelOf(String lineId) => carLevels[lineId] ?? 0;
  int accessLevelOf(String lineId) => accessLevels[lineId] ?? 0;

  /// This line's trains: +15% speed per level, times network signals.
  double trainSpeedFor(String lineId) =>
      baseSpeed *
      (1 + 0.15 * speedLevelOf(lineId)) *
      (1 + 0.04 * globalLevelOf('signal'));

  /// This line's cars: riders boarded per stop (base pinned with
  /// [demandScale] — see above).
  double capacityFor(String lineId) => 12 + 6.0 * carLevelOf(lineId);

  /// Step-free access on a line lifts ridership at the stations it serves;
  /// interchanges take the best level among their unlocked lines.
  double demandMultAt(String stationId) {
    var best = 0;
    for (final lineId in _linesServing[stationId] ?? const <String>[]) {
      final lvl = accessLevelOf(lineId);
      if (lvl > best) best = lvl;
    }
    return (1 + 0.10 * best) * (1 + 0.05 * globalLevelOf('marketing'));
  }

  /// Upgrade prices scale with the line's tier, so late lines cost more to
  /// tune but earn more too.
  double _upgradeBase(LineDef line) => 250 + line.unlockCost * 0.05;
  double speedCost(String lineId, int level) =>
      _upgradeBase(city.lineById(lineId)) * pow(1.9, level).toDouble();
  double carCost(String lineId, int level) =>
      _upgradeBase(city.lineById(lineId)) * 1.2 * pow(2.0, level).toDouble();
  double accessCost(String lineId, int level) =>
      _upgradeBase(city.lineById(lineId)) * 1.5 * pow(2.1, level).toDouble();

  double nextSpeedCost(String lineId) =>
      speedCost(lineId, speedLevelOf(lineId));
  double nextCarCost(String lineId) => carCost(lineId, carLevelOf(lineId));
  double nextAccessCost(String lineId) =>
      accessCost(lineId, accessLevelOf(lineId));

  // ---- Earn-rate estimate (drives the header and offline earnings) ----
  double avgRate = 0;
  double _windowEarned = 0;
  double _windowTime = 0;
  int? _loadedLastSeenMs;

  void _recomputeServed() {
    _served = {};
    _linesServing = {};
    _upServed = {};
    _downServed = {};
    for (final lineId in unlockedLineIds) {
      final ids = city.lineById(lineId).stationIds;
      for (var i = 0; i < ids.length; i++) {
        _served.add(ids[i]);
        _linesServing.putIfAbsent(ids[i], () => []).add(lineId);
        if (i < ids.length - 1) _upServed.add(ids[i]);
        if (i > 0) _downServed.add(ids[i]);
      }
    }
  }

  bool isUnlocked(String lineId) => unlockedLineIds.contains(lineId);
  bool isServed(String stationId) => _served.contains(stationId);
  bool upServed(String stationId) => _upServed.contains(stationId);
  bool downServed(String stationId) => _downServed.contains(stationId);
  double waitingAt(String stationId) =>
      waitingUp[stationId]! + waitingDown[stationId]!;

  int trainCount(String lineId) =>
      trains.where((t) => t.lineId == lineId).length;

  /// Cost of the NEXT train on a line (2nd costs the line's base, ×2.5 each
  /// after).
  double nextTrainCost(LineDef line) =>
      line.trainCost * pow(2.5, trainCount(line.id) - 1).toDouble();

  /// Advance the world by [dt] seconds. Deterministic; safe for any small
  /// positive step (the UI uses frame deltas, tests use 0.1s loops).
  void tick(double dt) {
    if (dt <= 0) return;

    // Riders arrive at every served station, choosing the platform for
    // their direction — 50/50 where both are served, everyone to the one
    // platform at a line's end — up to the station's total cap.
    for (final id in _served) {
      final add =
          city.stationById(id).demand * demandScale * demandMultAt(id) * dt;
      final both = _upServed.contains(id) && _downServed.contains(id);
      var dUp = both ? add / 2 : (_upServed.contains(id) ? add : 0.0);
      var dDown = both ? add / 2 : (_downServed.contains(id) ? add : 0.0);
      final room = stationCap - waitingUp[id]! - waitingDown[id]!;
      if (room <= 0) continue;
      final want = dUp + dDown;
      if (want > room) {
        final f = room / want;
        dUp *= f;
        dDown *= f;
      }
      waitingUp[id] = waitingUp[id]! + dUp;
      waitingDown[id] = waitingDown[id]! + dDown;
    }

    for (final t in trains) {
      _tickTrain(t, dt);
    }

    // Keep the rolling $/sec estimate fresh.
    _windowTime += dt;
    if (_windowTime >= 5) {
      final sample = _windowEarned / _windowTime;
      avgRate = avgRate == 0 ? sample : 0.3 * sample + 0.7 * avgRate;
      _windowEarned = 0;
      _windowTime = 0;
    }

    notifyListeners();
  }

  void _tickTrain(TrainState t, double dt) {
    final line = city.lineById(t.lineId);
    final path = paths[t.lineId]!;
    var remaining = dt;
    if (t.dwell > 0) {
      final used = t.dwell < remaining ? t.dwell : remaining;
      t.dwell -= used;
      remaining -= used;
    }
    if (remaining <= 0) return;

    final targetD = path.stationDistance[t.target];
    final next =
        t.distance + trainSpeedFor(t.lineId) * remaining * t.direction;
    final arrived = t.direction > 0 ? next >= targetD : next <= targetD;
    if (!arrived) {
      t.distance = next;
      return;
    }
    t.distance = targetD;
    // Riders board for where the train goes NEXT — at a terminal that's
    // the turned-around direction, so the outbound platform gets scooped.
    final int nextDir;
    if (t.target == line.stationIds.length - 1) {
      nextDir = -1;
    } else if (t.target == 0) {
      nextDir = 1;
    } else {
      nextDir = t.direction;
    }
    _board(t.lineId, line.stationIds[t.target], nextDir);
    t.dwell = effectiveDwell;
    t.direction = nextDir;
    t.target += nextDir;
  }

  void _board(String lineId, String stationId, int direction) {
    final bucket = direction > 0 ? waitingUp : waitingDown;
    final w = bucket[stationId]!;
    final cap = capacityFor(lineId);
    final take = w < cap ? w : cap;
    if (take <= 0) return;
    bucket[stationId] = w - take;
    // Food courts turn boardings into concession money too.
    final perRider =
        currentFare + foodBonusPerLevel * (foodLevel[stationId] ?? 0);
    final earned = take * perRider;
    cash += earned;
    totalEarned += earned;
    totalRiders += take;
    _windowEarned += earned;
    boardSeq += 1;
    lastBoardStationId = stationId;
    lastBoardAmount = earned;
    lastBoardCount = take.floor();
  }

  // ---- Purchases ----
  bool buySpeed(String lineId) => _buy(
      isUnlocked(lineId) && speedLevelOf(lineId) < levelMax,
      nextSpeedCost(lineId), () {
        speedLevels[lineId] = speedLevelOf(lineId) + 1;
      });
  bool buyCars(String lineId) => _buy(
      isUnlocked(lineId) && carLevelOf(lineId) < levelMax,
      nextCarCost(lineId), () {
        carLevels[lineId] = carLevelOf(lineId) + 1;
      });
  bool buyAccess(String lineId) => _buy(
      isUnlocked(lineId) && accessLevelOf(lineId) < levelMax,
      nextAccessCost(lineId), () {
        accessLevels[lineId] = accessLevelOf(lineId) + 1;
      });

  bool buyLine(String lineId) {
    final line = city.lineById(lineId);
    return _buy(!isUnlocked(lineId), line.unlockCost, () {
      unlockedLineIds.add(lineId);
      _recomputeServed();
      trains.add(_spawnTrain(line));
    });
  }

  bool buyTrain(String lineId) {
    final line = city.lineById(lineId);
    return _buy(isUnlocked(lineId), nextTrainCost(line), () {
      trains.add(_spawnTrain(line));
    });
  }

  /// Where the line's k-th train enters service: opposite direction from
  /// the previous spawn (1st up, 2nd down, 3rd up …), and trains sharing a
  /// direction are phase-offset along the line by van der Corput fractions
  /// (0, ½, ¼, ¾ …) so a new train never trails an old one scooping
  /// platforms it just emptied.
  TrainState _spawnTrain(LineDef line) {
    final path = paths[line.id]!;
    final k = trainCount(line.id);
    final direction = k.isEven ? 1 : -1;
    final f = _vdc(k >> 1);
    final d = direction > 0 ? path.length * f : path.length * (1 - f);
    var target = direction > 0 ? line.stationIds.length - 1 : 0;
    if (direction > 0) {
      for (var i = 0; i < path.stationDistance.length; i++) {
        if (path.stationDistance[i] > d + 1e-9) {
          target = i;
          break;
        }
      }
    } else {
      for (var i = path.stationDistance.length - 1; i >= 0; i--) {
        if (path.stationDistance[i] < d - 1e-9) {
          target = i;
          break;
        }
      }
    }
    return TrainState(
        lineId: line.id,
        distance: d,
        direction: direction,
        dwell: 0,
        target: target);
  }

  /// Van der Corput base-2: 0, ½, ¼, ¾, ⅛, ⅝ … — evenly self-spacing.
  static double _vdc(int j) {
    var f = 0.0;
    var base = 0.5;
    while (j > 0) {
      if (j.isOdd) f += base;
      j >>= 1;
      base /= 2;
    }
    return f;
  }

  bool buyFood(String stationId) {
    final level = foodLevel[stationId] ?? 0;
    return _buy(isServed(stationId) && level < foodMax, foodCost(level), () {
      foodLevel[stationId] = level + 1;
    });
  }

  double foodCost(int level) => 300 * pow(2.2, level).toDouble();

  bool _buy(bool allowed, double cost, VoidCallback apply) {
    if (!allowed || cash < cost) return false;
    cash -= cost;
    apply();
    notifyListeners();
    return true;
  }

  /// Credit time spent away: the saved live rate, at 50% efficiency, capped
  /// at 8 hours. Returns the amount credited (0 if nothing).
  double applyOfflineEarnings(int nowMs) {
    final last = _loadedLastSeenMs;
    _loadedLastSeenMs = null;
    if (last == null || avgRate <= 0) return 0;
    final seconds =
        ((nowMs - last) / 1000).clamp(0, maxOfflineSeconds).toDouble();
    final credit = seconds * avgRate * offlineEfficiency;
    if (credit < 1) return 0;
    cash += credit;
    totalEarned += credit;
    totalRiders += credit / currentFare;
    notifyListeners();
    return credit;
  }

  /// Highest-demand station your system serves — the welcome-back headline.
  StationDef get busiestStation {
    StationDef? best;
    for (final id in _served) {
      final s = city.stationById(id);
      if (best == null || s.demand > best.demand) best = s;
    }
    return best!;
  }

  // ---- Persistence ----
  static const int saveVersion = 6;

  Map<String, dynamic> toJson(int nowMs) => {
        'v': saveVersion,
        'cash': cash,
        'totalEarned': totalEarned,
        'totalRiders': totalRiders,
        'unlockedLineIds': unlockedLineIds.toList(),
        'trains': [for (final t in trains) t.toJson()],
        'waitingUp': waitingUp,
        'waitingDown': waitingDown,
        'foodLevel': foodLevel,
        'speedLevels': speedLevels,
        'carLevels': carLevels,
        'accessLevels': accessLevels,
        'globalLevels': globalLevels,
        'avgRate': avgRate,
        'lastSeenMs': nowMs,
      };

  static GameState fromJson(Map<String, dynamic> j) {
    final g = GameState();
    g.cash = (j['cash'] as num).toDouble();
    g.totalEarned = (j['totalEarned'] as num).toDouble();
    g.totalRiders = (j['totalRiders'] as num).toDouble();
    // Old saves carried GLOBAL upgrade levels — grant them to line 1.
    if (j.containsKey('speedLevel')) {
      g.speedLevels['1'] = j['speedLevel'] as int;
      g.carLevels['1'] = j['capacityLevel'] as int;
      g.accessLevels['1'] = j['accessLevel'] as int;
    }
    for (final e in ((j['speedLevels'] as Map?) ?? {}).entries) {
      g.speedLevels[e.key as String] = e.value as int;
    }
    for (final e in ((j['carLevels'] as Map?) ?? {}).entries) {
      g.carLevels[e.key as String] = e.value as int;
    }
    for (final e in ((j['accessLevels'] as Map?) ?? {}).entries) {
      g.accessLevels[e.key as String] = e.value as int;
    }
    for (final e in ((j['globalLevels'] as Map?) ?? {}).entries) {
      g.globalLevels[e.key as String] = e.value as int;
    }
    g.avgRate = (j['avgRate'] as num).toDouble();
    g._loadedLastSeenMs = j['lastSeenMs'] as int?;

    final version = (j['v'] as int?) ?? 1;
    if (version < 3) {
      // Older saves reference the pre-approval network (different stations
      // and line ids): money, upgrades, and the earn rate carry over; the
      // world restarts on line 1 of the approved map.
      return g;
    }

    g.unlockedLineIds
      ..clear()
      ..addAll([for (final id in (j['unlockedLineIds'] as List)) id as String]);
    g.trains
      ..clear()
      ..addAll([
        for (final t in (j['trains'] as List))
          TrainState.fromJson(t as Map<String, dynamic>)
      ]);
    // Served-direction flags must exist before queues are restored — the
    // pre-v6 migration splits by them.
    g._recomputeServed();
    if (version >= 6) {
      for (final e in (j['waitingUp'] as Map).entries) {
        if (g.waitingUp.containsKey(e.key)) {
          g.waitingUp[e.key as String] = (e.value as num).toDouble();
        }
      }
      for (final e in (j['waitingDown'] as Map).entries) {
        if (g.waitingDown.containsKey(e.key)) {
          g.waitingDown[e.key as String] = (e.value as num).toDouble();
        }
      }
    } else {
      // v3–v5 kept one queue per station: split it onto the platforms an
      // unlocked line actually departs from (never strand riders on a
      // platform no train will ever leave).
      for (final e in (j['waiting'] as Map).entries) {
        final id = e.key as String;
        if (!g.waitingUp.containsKey(id)) continue;
        final w = (e.value as num).toDouble();
        if (g.upServed(id) && g.downServed(id)) {
          g.waitingUp[id] = w / 2;
          g.waitingDown[id] = w / 2;
        } else if (g.upServed(id)) {
          g.waitingUp[id] = w;
        } else if (g.downServed(id)) {
          g.waitingDown[id] = w;
        }
      }
    }
    for (final e in (j['foodLevel'] as Map).entries) {
      if (g.foodLevel.containsKey(e.key)) {
        g.foodLevel[e.key as String] = e.value as int;
      }
    }
    return g;
  }
}
