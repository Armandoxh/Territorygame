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
      waiting[s.id] = 0;
      foodLevel[s.id] = 0;
    }
    unlockedLineIds.add(city.lines.first.id);
    trains.add(_freshTrain(city.lines.first));
    _recomputeServed();
  }

  // ---- Static tuning (the balance harness pins the outcomes) ----
  /// A clean, player-checkable number: riders boarded × \$2 = the pop you see.
  static const double fare = 2.0;

  /// Scales raw station demand so a level-0 line sits just past the
  /// supply/demand balance point: busy stops saturate (cars/speed/trains
  /// pay off) while quieter stops get fully cleared (access pays off).
  /// At 1.0 the whole line saturated and demand upgrades did nothing —
  /// the harness's "access L5 must show up" guard is what pins this.
  static const double demandScale = 0.75;
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
  final Map<String, double> waiting = {};
  final Map<String, int> foodLevel = {};

  /// Stations touched by at least one unlocked line — the only ones riders
  /// show up at — and which unlocked lines serve each.
  Set<String> _served = {};
  Map<String, List<String>> _linesServing = {};

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

  /// This line's cars: riders boarded per stop.
  double capacityFor(String lineId) => 8 + 6.0 * carLevelOf(lineId);

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

  TrainState _freshTrain(LineDef line) => TrainState(
      lineId: line.id, distance: 0, direction: 1, dwell: 0, target: 1);

  void _recomputeServed() {
    _served = {
      for (final id in unlockedLineIds)
        ...city.lineById(id).stationIds,
    };
    _linesServing = {};
    for (final lineId in unlockedLineIds) {
      for (final sid in city.lineById(lineId).stationIds) {
        _linesServing.putIfAbsent(sid, () => []).add(lineId);
      }
    }
  }

  bool isUnlocked(String lineId) => unlockedLineIds.contains(lineId);
  bool isServed(String stationId) => _served.contains(stationId);

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

    // Riders arrive at every served station, up to each platform's cap.
    for (final id in _served) {
      final w = waiting[id]! +
          city.stationById(id).demand * demandScale * demandMultAt(id) * dt;
      waiting[id] = w > stationCap ? stationCap : w;
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
    _board(t.lineId, line.stationIds[t.target]);
    t.dwell = effectiveDwell;
    if (t.target == line.stationIds.length - 1) {
      t.direction = -1;
      t.target -= 1;
    } else if (t.target == 0) {
      t.direction = 1;
      t.target += 1;
    } else {
      t.target += t.direction;
    }
  }

  void _board(String lineId, String stationId) {
    final w = waiting[stationId]!;
    final cap = capacityFor(lineId);
    final take = w < cap ? w : cap;
    if (take <= 0) return;
    waiting[stationId] = w - take;
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
      trains.add(_freshTrain(line));
      _recomputeServed();
    });
  }

  bool buyTrain(String lineId) {
    final line = city.lineById(lineId);
    final path = paths[lineId]!;
    return _buy(isUnlocked(lineId), nextTrainCost(line), () {
      // New trains enter from the far terminal, naturally out of phase.
      trains.add(TrainState(
        lineId: lineId,
        distance: path.length,
        direction: -1,
        dwell: 0,
        target: line.stationIds.length - 2,
      ));
    });
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
  static const int saveVersion = 5;

  Map<String, dynamic> toJson(int nowMs) => {
        'v': saveVersion,
        'cash': cash,
        'totalEarned': totalEarned,
        'totalRiders': totalRiders,
        'unlockedLineIds': unlockedLineIds.toList(),
        'trains': [for (final t in trains) t.toJson()],
        'waiting': waiting,
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
    for (final e in (j['waiting'] as Map).entries) {
      if (g.waiting.containsKey(e.key)) {
        g.waiting[e.key as String] = (e.value as num).toDouble();
      }
    }
    for (final e in (j['foodLevel'] as Map).entries) {
      if (g.foodLevel.containsKey(e.key)) {
        g.foodLevel[e.key as String] = e.value as int;
      }
    }
    g._recomputeServed();
    return g;
  }
}
