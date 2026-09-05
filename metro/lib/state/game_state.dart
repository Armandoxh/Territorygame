import 'dart:math';

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

/// The whole simulation: one city, unlockable lines, any number of trains,
/// per-station food courts. Pure and deterministic — [tick] advances the
/// world by dt seconds with no RNG, so the balance harness replays it
/// exactly. The UI drives it with a Ticker; the tests drive it with a loop.
class GameState extends ChangeNotifier {
  GameState() {
    for (final line in city.lines) {
      paths[line.id] = LinePath(city, line);
    }
    for (final s in city.stations) {
      waiting[s.id] = 0;
      foodLevel[s.id] = 0;
    }
    unlockedLineIds.add(city.lines.first.id);
    trains.add(_freshTrain(city.lines.first));
    _recomputeServed();
  }

  // ---- Static tuning (the balance harness pins the outcomes) ----
  static const double fare = 2.5;
  static const double baseSpeed = 24; // map-units/sec (240-unit world)
  static const double dwellTime = 0.9; // seconds stopped at a station
  static const double stationCap = 30; // waiting riders cap per station
  static const int levelMax = 10;
  static const int foodMax = 5;
  static const double foodBonusPerLevel = 0.4; // extra $ per rider boarding
  static const double offlineEfficiency = 0.5; // idle pays 50% of live rate
  static const int maxOfflineSeconds = 8 * 3600;

  final CityDef city = Cities.newMeridian;
  final Map<String, LinePath> paths = {};

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
  /// show up at.
  Set<String> _served = {};

  /// Bumped on every boarding so the map can spawn a floating "+$" exactly
  /// once per stop.
  int boardSeq = 0;
  String lastBoardStationId = '';
  double lastBoardAmount = 0;

  // ---- Global upgrades ----
  int speedLevel = 0;
  int capacityLevel = 0;
  int accessLevel = 0;

  double get trainSpeed => baseSpeed * (1 + 0.12 * speedLevel);
  double get trainCapacity => 10 + 6.0 * capacityLevel;
  double get demandMult => 1 + 0.10 * accessLevel;

  double speedCost(int level) => 150 * pow(1.9, level).toDouble();
  double capacityCost(int level) => 200 * pow(2.0, level).toDouble();
  double accessCost(int level) => 250 * pow(2.1, level).toDouble();

  double get nextSpeedCost => speedCost(speedLevel);
  double get nextCapacityCost => capacityCost(capacityLevel);
  double get nextAccessCost => accessCost(accessLevel);

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
      final w = waiting[id]! + city.stationById(id).demand * demandMult * dt;
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
    final next = t.distance + trainSpeed * remaining * t.direction;
    final arrived = t.direction > 0 ? next >= targetD : next <= targetD;
    if (!arrived) {
      t.distance = next;
      return;
    }
    t.distance = targetD;
    _board(line.stationIds[t.target]);
    t.dwell = dwellTime;
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

  void _board(String stationId) {
    final w = waiting[stationId]!;
    final take = w < trainCapacity ? w : trainCapacity;
    if (take <= 0) return;
    waiting[stationId] = w - take;
    // Food courts turn boardings into concession money too.
    final perRider = fare + foodBonusPerLevel * (foodLevel[stationId] ?? 0);
    final earned = take * perRider;
    cash += earned;
    totalEarned += earned;
    totalRiders += take;
    _windowEarned += earned;
    boardSeq += 1;
    lastBoardStationId = stationId;
    lastBoardAmount = earned;
  }

  // ---- Purchases ----
  bool buySpeed() => _buy(speedLevel < levelMax, nextSpeedCost, () {
        speedLevel += 1;
      });
  bool buyCapacity() => _buy(capacityLevel < levelMax, nextCapacityCost, () {
        capacityLevel += 1;
      });
  bool buyAccess() => _buy(accessLevel < levelMax, nextAccessCost, () {
        accessLevel += 1;
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
    totalRiders += credit / fare;
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
  static const int saveVersion = 2;

  Map<String, dynamic> toJson(int nowMs) => {
        'v': saveVersion,
        'cash': cash,
        'totalEarned': totalEarned,
        'totalRiders': totalRiders,
        'unlockedLineIds': unlockedLineIds.toList(),
        'trains': [for (final t in trains) t.toJson()],
        'waiting': waiting,
        'foodLevel': foodLevel,
        'speedLevel': speedLevel,
        'capacityLevel': capacityLevel,
        'accessLevel': accessLevel,
        'avgRate': avgRate,
        'lastSeenMs': nowMs,
      };

  static GameState fromJson(Map<String, dynamic> j) {
    final g = GameState();
    g.cash = (j['cash'] as num).toDouble();
    g.totalEarned = (j['totalEarned'] as num).toDouble();
    g.totalRiders = (j['totalRiders'] as num).toDouble();
    g.speedLevel = j['speedLevel'] as int;
    g.capacityLevel = j['capacityLevel'] as int;
    g.accessLevel = j['accessLevel'] as int;
    g.avgRate = (j['avgRate'] as num).toDouble();
    g._loadedLastSeenMs = j['lastSeenMs'] as int?;

    final version = (j['v'] as int?) ?? 1;
    if (version < 2) {
      // v1 saves predate multiple lines: money, upgrades, and the earn rate
      // carry over; the world itself starts fresh on line 1.
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
