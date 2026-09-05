import 'dart:math';

import 'package:flutter/foundation.dart';

import '../data/cities.dart';

/// The whole simulation for v0.1: one city, one line, one train. Pure and
/// deterministic — [tick] advances the world by dt seconds with no RNG, so
/// the balance harness can replay it exactly. The UI drives it with a Ticker;
/// the tests drive it with a loop.
class GameState extends ChangeNotifier {
  GameState() {
    _resetRun();
  }

  // ---- Static tuning (the balance harness pins the outcomes) ----
  static const double fare = 2.5;
  static const double baseSpeed = 10; // map-units/sec along the line
  static const double dwellTime = 0.9; // seconds stopped at a station
  static const double stationCap = 30; // waiting riders cap per station
  static const int levelMax = 10;
  static const double offlineEfficiency = 0.5; // idle pays 50% of live rate
  static const int maxOfflineSeconds = 8 * 3600;

  final CityDef city = Cities.newMeridian;
  LineDef get line => city.lines.first;
  late LinePath path;

  // ---- Money & lifetime stats ----
  double cash = 0;
  double totalEarned = 0;
  double totalRiders = 0;

  // ---- Live world ----
  late List<double> waiting; // riders queued per station
  double trainDistance = 0; // along the path
  int direction = 1; // 1 = toward last station, -1 = back
  double dwellRemaining = 0;
  late int _targetStation; // next station index in travel direction

  /// Bumped on every boarding so the map can spawn a floating "+$" exactly
  /// once per stop.
  int boardSeq = 0;
  int lastBoardStation = 0;
  double lastBoardAmount = 0;

  // ---- Upgrades ----
  /// Express Motors: faster trains, more laps.
  int speedLevel = 0;

  /// Bigger Cars: more riders scooped per stop.
  int capacityLevel = 0;

  /// Step-Free Stations (elevators/ramps): accessibility opens the system to
  /// more riders — +10% demand everywhere per level.
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
  /// Exponential moving average of $/sec, updated every 5 sim-seconds.
  double avgRate = 0;
  double _windowEarned = 0;
  double _windowTime = 0;

  /// Set from the save file; consumed by [applyOfflineEarnings].
  int? _loadedLastSeenMs;

  void _resetRun() {
    path = LinePath(line);
    waiting = List.filled(line.stations.length, 0);
    trainDistance = 0;
    direction = 1;
    dwellRemaining = 0;
    _targetStation = 1;
  }

  /// Advance the world by [dt] seconds. Deterministic; safe to call with any
  /// small positive step (the UI uses frame deltas, tests use 0.1s loops).
  void tick(double dt) {
    if (dt <= 0) return;

    // Riders arrive at every station, up to each platform's cap.
    for (var i = 0; i < waiting.length; i++) {
      final w = waiting[i] + line.stations[i].demand * demandMult * dt;
      waiting[i] = w > stationCap ? stationCap : w;
    }

    // Train: sit out the dwell, then move toward the next station.
    var remaining = dt;
    if (dwellRemaining > 0) {
      final used = dwellRemaining < remaining ? dwellRemaining : remaining;
      dwellRemaining -= used;
      remaining -= used;
    }
    if (remaining > 0) {
      final target = path.stationDistance[_targetStation];
      final travel = trainSpeed * remaining * direction;
      final next = trainDistance + travel;
      final arrived = direction > 0 ? next >= target : next <= target;
      if (arrived) {
        trainDistance = target;
        _board(_targetStation);
        dwellRemaining = dwellTime;
        if (_targetStation == line.stations.length - 1) {
          direction = -1;
          _targetStation -= 1;
        } else if (_targetStation == 0) {
          direction = 1;
          _targetStation += 1;
        } else {
          _targetStation += direction;
        }
      } else {
        trainDistance = next;
      }
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

  void _board(int station) {
    final take =
        waiting[station] < trainCapacity ? waiting[station] : trainCapacity;
    if (take <= 0) return;
    waiting[station] -= take;
    final earned = take * fare;
    cash += earned;
    totalEarned += earned;
    totalRiders += take;
    _windowEarned += earned;
    boardSeq += 1;
    lastBoardStation = station;
    lastBoardAmount = earned;
  }

  bool buySpeed() => _buy(speedLevel, nextSpeedCost, () => speedLevel += 1);
  bool buyCapacity() =>
      _buy(capacityLevel, nextCapacityCost, () => capacityLevel += 1);
  bool buyAccess() => _buy(accessLevel, nextAccessCost, () => accessLevel += 1);

  bool _buy(int level, double cost, VoidCallback apply) {
    if (level >= levelMax || cash < cost) return false;
    cash -= cost;
    apply();
    notifyListeners();
    return true;
  }

  /// Credit time spent away: the saved live rate, at 50% efficiency, capped
  /// at 8 hours. Returns the amount credited (0 if nothing) so the UI can
  /// show the welcome-back moment.
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

  /// The station with the highest effective demand — the welcome-back
  /// headline ("busiest station").
  StationDef get busiestStation =>
      line.stations.reduce((a, b) => a.demand >= b.demand ? a : b);

  // ---- Persistence ----
  static const int saveVersion = 1;

  Map<String, dynamic> toJson(int nowMs) => {
        'v': saveVersion,
        'cash': cash,
        'totalEarned': totalEarned,
        'totalRiders': totalRiders,
        'waiting': waiting,
        'trainDistance': trainDistance,
        'direction': direction,
        'dwellRemaining': dwellRemaining,
        'targetStation': _targetStation,
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
    final w = [for (final v in (j['waiting'] as List)) (v as num).toDouble()];
    for (var i = 0; i < g.waiting.length && i < w.length; i++) {
      g.waiting[i] = w[i];
    }
    g.trainDistance = (j['trainDistance'] as num).toDouble();
    g.direction = j['direction'] as int;
    g.dwellRemaining = (j['dwellRemaining'] as num).toDouble();
    g._targetStation = (j['targetStation'] as int)
        .clamp(0, g.line.stations.length - 1);
    g.speedLevel = j['speedLevel'] as int;
    g.capacityLevel = j['capacityLevel'] as int;
    g.accessLevel = j['accessLevel'] as int;
    g.avgRate = (j['avgRate'] as num).toDouble();
    g._loadedLastSeenMs = j['lastSeenMs'] as int?;
    return g;
  }
}
