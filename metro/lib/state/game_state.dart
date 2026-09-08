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

/// One kind of per-station work (food court, fare gates …): the catalog
/// entry the station sheet and the per-line bulk planner both read.
class StationUpgradeDef {
  const StationUpgradeDef(
      this.id, this.name, this.blurb, this.baseCost, this.growth);

  final String id;
  final String name;
  final String blurb;
  final double baseCost;
  final double growth;
}

/// What a city goal measures.
enum GoalKind { riders, earned, lines, trains }

/// One rung of the CITY GOALS ladder — the game's "point". Completing a
/// goal earns a commendation: a PERMANENT multiplicative income bonus.
/// The compounding rewards are the counterweight to exponential upgrade
/// costs: levels are linear, but the goal lane multiplies.
class GoalDef {
  const GoalDef(this.name, this.kind, this.target, this.reward);

  final String name;
  final GoalKind kind;
  final double target;
  final double reward; // income ×reward, forever
}

/// The whole simulation: one city, unlockable lines, any number of trains,
/// per-station food courts. Pure and deterministic — [tick] advances the
/// world by dt seconds with no RNG, so the balance harness replays it
/// exactly. The UI drives it with a Ticker; the tests drive it with a loop.
class GameState extends ChangeNotifier {
  GameState({CityDef? city}) : city = city ?? Cities.newMeridian {
    final c = this.city;
    for (final line in c.lines) {
      paths[line.id] = LinePath(c, line);
    }
    _buildSegmentLanes();
    for (final s in c.stations) {
      waitingUp[s.id] = 0;
      waitingDown[s.id] = 0;
      foodLevel[s.id] = 0;
      gateLevel[s.id] = 0;
      platformLevel[s.id] = 0;
      parkingLevel[s.id] = 0;
      escalatorLevel[s.id] = 0;
      securityLevel[s.id] = 0;
    }
    unlockedLineIds.add(c.lines.first.id);
    _recomputeServed();
    trains.add(_spawnTrain(c.lines.first));
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
  static const double demandScale = 1.3;
  static const double baseSpeed = 24;
  static const double dwellTime = 0.9; // seconds stopped at a station
  static const double stationCapBase = 80; // waiting riders cap per station
  static const int levelMax = 10;

  /// Max level for every per-station upgrade (food, gates, platform).
  static const int foodMax = 5;
  static const double foodBonusPerLevel = 0.4; // extra $ per rider boarding
  static const double offlineEfficiency = 0.5; // idle pays 50% of live rate
  static const int maxOfflineSeconds = 8 * 3600;

  final CityDef city;
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
  final Map<String, int> gateLevel = {};
  final Map<String, int> platformLevel = {};
  final Map<String, int> parkingLevel = {};
  final Map<String, int> escalatorLevel = {};
  final Map<String, int> securityLevel = {};

  // ---- Station works: the catalog + the player's build priority ----
  static const List<StationUpgradeDef> stationUpgrades = [
    StationUpgradeDef('food', 'FOOD COURT',
        '+\$0.40/rider · +10% ridership here', 300, 2.2),
    StationUpgradeDef('gates', 'FARE GATES',
        'Stops fare evasion: +\$0.25/rider here', 400, 2.2),
    StationUpgradeDef('platform', 'PLATFORM WORKS',
        'Trains get in & out 15% faster here', 500, 2.3),
    StationUpgradeDef('parking', 'PARK & RIDE',
        '+6% ridership here', 450, 2.2),
    StationUpgradeDef('escalators', 'ESCALATORS',
        '+8 platform capacity here', 350, 2.15),
    StationUpgradeDef('security', 'SECURITY DESK',
        '+4% income on every fare here', 600, 2.3),
  ];

  static StationUpgradeDef stationUpgradeById(String id) =>
      stationUpgrades.firstWhere((u) => u.id == id);

  /// The order the bulk planner attacks upgrade types in — the player
  /// reorders this from any line sheet; it persists.
  final List<String> stationPriority = [
    for (final u in stationUpgrades) u.id
  ];

  Map<String, int> _stationMapFor(String type) => switch (type) {
        'food' => foodLevel,
        'gates' => gateLevel,
        'platform' => platformLevel,
        'parking' => parkingLevel,
        'escalators' => escalatorLevel,
        _ => securityLevel,
      };

  int stationWorkLevel(String type, String stationId) =>
      _stationMapFor(type)[stationId] ?? 0;

  double stationWorkCost(String type, int level) {
    final def = stationUpgradeById(type);
    return def.baseCost * city.costScale * pow(def.growth, level).toDouble();
  }

  bool buyStationWork(String type, String stationId) {
    final level = stationWorkLevel(type, stationId);
    return _buy(isServed(stationId) && level < foodMax,
        stationWorkCost(type, level), () {
      _stationMapFor(type)[stationId] = level + 1;
    });
  }

  /// Move a work type one slot up the priority list.
  void raisePriority(String type) {
    final i = stationPriority.indexOf(type);
    if (i <= 0) return;
    stationPriority.removeAt(i);
    stationPriority.insert(i - 1, type);
    notifyListeners();
  }

  /// The line's lowest tier of one work type — the tier the bulk buy
  /// levels up. No station advances past it until every station has it.
  int minStationLevel(String lineId, String type) {
    var minL = foodMax;
    final m = _stationMapFor(type);
    for (final sid in city.lineById(lineId).stationIds) {
      final l = m[sid] ?? 0;
      if (l < minL) minL = l;
    }
    return minL;
  }

  /// How many of the line's stations sit at that lowest tier.
  int stationsAtMin(String lineId, String type) {
    final minL = minStationLevel(lineId, type);
    final m = _stationMapFor(type);
    return city
        .lineById(lineId)
        .stationIds
        .where((sid) => (m[sid] ?? 0) == minL)
        .length;
  }

  /// Full price of bringing every lowest-tier station up one level.
  double stationTierCost(String lineId, String type) {
    final minL = minStationLevel(lineId, type);
    if (minL >= foodMax) return 0;
    return stationsAtMin(lineId, type) * stationWorkCost(type, minL);
  }

  /// The bulk buy: raise the line's LOWEST-tier stations of [type] one
  /// level each, in line order, while cash lasts. Never touches a station
  /// above the minimum tier — 8/9 stations at tier 2 means nobody reaches
  /// tier 3 until the 9th catches up. Returns how many stations upgraded.
  int buyStationTier(String lineId, String type) {
    if (!isUnlocked(lineId)) return 0;
    final minL = minStationLevel(lineId, type);
    if (minL >= foodMax) return 0;
    final m = _stationMapFor(type);
    final cost = stationWorkCost(type, minL);
    var bought = 0;
    for (final sid in city.lineById(lineId).stationIds) {
      if ((m[sid] ?? 0) != minL) continue;
      if (cash < cost) break;
      cash -= cost;
      m[sid] = minL + 1;
      bought++;
    }
    if (bought > 0) notifyListeners();
    return bought;
  }

  /// The first work type in the player's priority order that isn't maxed
  /// across this line — what the planner marks NEXT.
  String? nextPlannedType(String lineId) {
    for (final type in stationPriority) {
      if (minStationLevel(lineId, type) < foodMax) return type;
    }
    return null;
  }

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
  String lastBoardLineId = '';
  double lastBoardAmount = 0;
  int lastBoardCount = 0;

  /// Bumped when a line unlocks so the map can play its opening cinema.
  int unlockSeq = 0;
  String lastUnlockedLineId = '';

  // ---- Rush hour: the strategy clock ----
  /// A deterministic 3-minute cycle; the last 45 seconds are RUSH HOUR
  /// on one unlocked line (rotating in ladder order): ×2.5 demand at
  /// every station it serves. Unprepared, a rush pays nothing extra —
  /// the queues cap and the trains are already full. It pays exactly in
  /// proportion to the capacity headroom built on that line.
  static const double rushPeriod = 180;
  static const double rushWindow = 45;
  static const double rushMult = 2.5;

  double rushClock = 0;

  double get _rushPhase => rushClock % rushPeriod;
  bool get rushActive => _rushPhase >= rushPeriod - rushWindow;

  List<String> get _unlockedInOrder =>
      [for (final l in city.lines) if (isUnlocked(l.id)) l.id];

  /// The line this cycle's rush targets (known during the calm too, so
  /// the player can prepare).
  String? get rushLineId {
    final u = _unlockedInOrder;
    if (u.isEmpty) return null;
    return u[(rushClock ~/ rushPeriod) % u.length];
  }

  /// Seconds until the rush ends (while active) or begins (while calm).
  double get rushSecondsLeft => rushActive
      ? rushPeriod - _rushPhase
      : (rushPeriod - rushWindow) - _rushPhase;

  /// The line cycle [offset] cycles from now will rush (0 = current) —
  /// the clock is deterministic, so the OPS board can print a timetable.
  String? rushLineIdForCycle(int offset) {
    final u = _unlockedInOrder;
    if (u.isEmpty) return null;
    return u[((rushClock ~/ rushPeriod) + offset) % u.length];
  }

  /// Seconds until that cycle's rush window opens (negative = already
  /// open, for offset 0 while a rush runs).
  double secondsUntilRushStart(int offset) =>
      ((rushClock ~/ rushPeriod) + offset) * rushPeriod +
      (rushPeriod - rushWindow) -
      rushClock;

  /// The rush multiplier hitting this station right now (1 when calm).
  double rushFactorAt(String stationId) => rushActive &&
          (_linesServing[stationId]?.contains(rushLineId) ?? false)
      ? rushMult
      : 1;

  // ---- City commissions: opt-in directed contracts ----
  /// City hall offers a contract: carry [commissionQuota] riders on ONE
  /// line within [commissionLimit] seconds for a cash bonus. The target
  /// line rotates on a different stride than rush hour, so commissions
  /// pull investment toward lines the rush isn't already favoring. Fully
  /// opt-in: an unaccepted offer does nothing; SKIP shows the next one.
  static const double commissionLimit = 120;

  int commissionIndex = 0;
  int commissionsDone = 0;
  bool commissionActive = false;
  double commissionProgress = 0;
  double commissionTimeLeft = 0;

  /// Bumped when a commission resolves so the UI can celebrate/console.
  int commissionSeq = 0;
  bool lastCommissionWon = false;

  String? get commissionLineId {
    final u = _unlockedInOrder;
    if (u.isEmpty) return null;
    return u[(commissionIndex * 2 + 1) % u.length];
  }

  double get commissionQuota =>
      400 * pow(1.6, commissionIndex < 12 ? commissionIndex : 12).toDouble();

  /// Roughly double what those riders pay at the farebox.
  double get commissionReward =>
      2 * commissionQuota * currentFare * goalMult;

  void acceptCommission() {
    if (commissionActive || commissionLineId == null) return;
    commissionActive = true;
    commissionProgress = 0;
    commissionTimeLeft = commissionLimit;
    notifyListeners();
  }

  void skipCommission() {
    if (commissionActive) return;
    commissionIndex += 1;
    notifyListeners();
  }

  void _tickCommission(double dt) {
    if (!commissionActive) return;
    if (commissionProgress >= commissionQuota) {
      cash += commissionReward;
      totalEarned += commissionReward;
      _windowEarned += commissionReward;
      commissionsDone += 1;
      lastCommissionWon = true;
      commissionSeq += 1;
      commissionActive = false;
      commissionIndex += 1;
      return;
    }
    commissionTimeLeft -= dt;
    if (commissionTimeLeft <= 0) {
      lastCommissionWon = false;
      commissionSeq += 1;
      commissionActive = false;
      commissionIndex += 1;
    }
  }

  /// How far the first-session coach marks have advanced (persisted).
  /// The UI owns the tip texts; each auto-advances when its milestone is
  /// met, so veteran saves skip straight past all of them.
  int coachStep = 0;

  // ---- City goals (sequential; each completion compounds income) ----
  // Riders/earned targets are LIFETIME totals, so each city's ladder
  // starts above where the previous city ended.
  static const List<GoalDef> _newMeridianGoals = [
    GoalDef('OPENING DAY', GoalKind.riders, 1000, 1.25),
    GoalDef('SECOND LINE', GoalKind.lines, 2, 1.25),
    GoalDef('ROLLING STOCK', GoalKind.trains, 4, 1.25),
    GoalDef('CROSSTOWN', GoalKind.lines, 3, 1.3),
    GoalDef('BUSY MORNING', GoalKind.riders, 25000, 1.3),
    GoalDef('FIVE ROUTES', GoalKind.lines, 5, 1.4),
    GoalDef('HALF MILLION', GoalKind.earned, 500000, 1.4),
    GoalDef('SEVEN ROUTES', GoalKind.lines, 7, 1.5),
    GoalDef('TWO MILLION', GoalKind.earned, 2000000, 1.5),
    GoalDef('NINE ROUTES', GoalKind.lines, 9, 1.75),
    GoalDef('MILLION RIDERS', GoalKind.riders, 1000000, 1.75),
    GoalDef('DOWNTOWN COMPLETE', GoalKind.earned, 25000000, 2.0),
    // The XL boroughs (build 24): the ladder keeps climbing past the
    // original twelve rungs, so migrated progress keeps its meaning.
    GoalDef('TWELVE ROUTES', GoalKind.lines, 12, 1.5),
    GoalDef('FIFTY MILLION', GoalKind.earned, 50000000, 1.5),
    GoalDef('SIXTEEN ROUTES', GoalKind.lines, 16, 1.75),
    GoalDef('FIVE MILLION RIDERS', GoalKind.riders, 5000000, 1.75),
    GoalDef('EVERY LINE', GoalKind.lines, 24, 2.0),
    GoalDef('NEW MERIDIAN COMPLETE', GoalKind.earned, 250000000, 2.0),
  ];
  static const List<GoalDef> _angelBayGoals = [
    GoalDef('WEST SHORE OPENS', GoalKind.lines, 2, 1.25),
    GoalDef('BAY CROSSING', GoalKind.riders, 1500000, 1.25),
    GoalDef('SIX TRAINS', GoalKind.trains, 6, 1.25),
    GoalDef('THE NARROWS', GoalKind.lines, 3, 1.3),
    GoalDef('75 MILLION', GoalKind.earned, 75000000, 1.3),
    GoalDef('FIVE ROUTES', GoalKind.lines, 5, 1.4),
    GoalDef('THREE MILLION RIDERS', GoalKind.riders, 3000000, 1.4),
    GoalDef('SEVEN ROUTES', GoalKind.lines, 7, 1.5),
    GoalDef('300 MILLION', GoalKind.earned, 300000000, 1.5),
    GoalDef('EVERY LINE', GoalKind.lines, 9, 1.75),
    GoalDef('TEN MILLION RIDERS', GoalKind.riders, 10000000, 1.75),
    GoalDef('ANGEL BAY COMPLETE', GoalKind.earned, 1500000000, 2.0),
  ];

  static List<GoalDef> goalsFor(String cityId) =>
      cityId == 'angel_bay' ? _angelBayGoals : _newMeridianGoals;

  /// This city's ladder.
  List<GoalDef> get goals => goalsFor(city.id);

  /// Goals completed, per city — commendations from EVERY city compound.
  final Map<String, int> goalsDoneByCity = {};
  int get goalsDone => goalsDoneByCity[city.id] ?? 0;
  double _goalMult = 1;

  void _recomputeGoalMult() {
    _goalMult = 1;
    for (final e in goalsDoneByCity.entries) {
      final ladder = goalsFor(e.key);
      for (var i = 0; i < e.value && i < ladder.length; i++) {
        _goalMult *= ladder[i].reward;
      }
    }
  }

  /// Bumped when a goal completes so the UI can celebrate exactly once.
  int goalSeq = 0;
  String lastGoalName = '';
  double lastGoalReward = 1;

  /// The permanent income multiplier from every commendation earned.
  double get goalMult => _goalMult;

  GoalDef? get currentGoal => goalsDone < goals.length ? goals[goalsDone] : null;

  double goalValue(GoalKind kind) => switch (kind) {
        GoalKind.riders => totalRiders,
        GoalKind.earned => totalEarned,
        GoalKind.lines => unlockedLineIds.length.toDouble(),
        GoalKind.trains => trains.length.toDouble(),
      };

  /// 0–1 progress toward the current goal (1 when the ladder is finished).
  double get goalProgress {
    final goal = currentGoal;
    if (goal == null) return 1;
    return (goalValue(goal.kind) / goal.target).clamp(0.0, 1.0);
  }

  void _checkGoals() {
    while (true) {
      final goal = currentGoal;
      if (goal == null || goalValue(goal.kind) < goal.target) return;
      goalsDoneByCity[city.id] = goalsDone + 1;
      _goalMult *= goal.reward;
      goalSeq += 1;
      lastGoalName = goal.name;
      lastGoalReward = goal.reward;
    }
  }

  // ---- The city ladder ----
  CityDef? get nextCity {
    final idx = Cities.all.indexWhere((c) => c.id == city.id);
    return idx >= 0 && idx + 1 < Cities.all.length
        ? Cities.all[idx + 1]
        : null;
  }

  /// True once this city's ladder is finished and another city awaits.
  bool get canMoveOn => currentGoal == null && nextCity != null;

  /// Hand the keys over and open service in the next city: cash, lifetime
  /// stats, and every commendation carry; the network itself starts fresh
  /// at the new city's (higher) stakes. Returns the new world — the caller
  /// swaps it in and saves.
  GameState moveOn() {
    assert(canMoveOn);
    final g = GameState(city: nextCity);
    g.cash = cash;
    g.totalEarned = totalEarned;
    g.totalRiders = totalRiders;
    g.goalsDoneByCity.addAll(goalsDoneByCity);
    g._recomputeGoalMult();
    g.avgRate = avgRate;
    return g;
  }

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
    GlobalUpgradeDef(
        id: 'billboards',
        name: 'AD BILLBOARDS',
        blurb: '+3% income on every fare',
        baseCost: 3500,
        growth: 2.15,
        maxLevel: 10),
    GlobalUpgradeDef(
        id: 'crowd',
        name: 'CROWD CONTROL',
        blurb: '+8 platform capacity, every station',
        baseCost: 4000,
        growth: 2.2,
        maxLevel: 10),
    GlobalUpgradeDef(
        id: 'yards',
        name: 'RAIL YARDS',
        blurb: 'New trains 4% cheaper',
        baseCost: 6000,
        growth: 2.4,
        maxLevel: 10),
    GlobalUpgradeDef(
        id: 'night',
        name: 'NIGHT SERVICE',
        blurb: '+6% offline earning rate',
        baseCost: 8000,
        growth: 2.6,
        maxLevel: 5),
  ];

  final Map<String, int> globalLevels = {};

  int globalLevelOf(String id) => globalLevels[id] ?? 0;

  static GlobalUpgradeDef globalById(String id) =>
      globalUpgrades.firstWhere((u) => u.id == id);

  double nextGlobalCost(String id) =>
      globalById(id).baseCost *
      city.costScale *
      pow(globalById(id).growth, globalLevelOf(id)).toDouble();

  bool buyGlobal(String id) => _buy(
      globalLevelOf(id) < globalById(id).maxLevel, nextGlobalCost(id), () {
        globalLevels[id] = globalLevelOf(id) + 1;
      });

  /// The fare riders actually pay right now (base + fare reviews, at this
  /// city's rates) — shown live in the header so income stays checkable.
  double get currentFare =>
      (fare + 0.25 * globalLevelOf('fare')) * city.fareScale;

  /// Seconds stopped at each station, after platform doors.
  double get effectiveDwell => dwellTime * (1 - 0.05 * globalLevelOf('doors'));

  // ---- Per-line upgrades (scoped, never blanketed) ----
  final Map<String, int> speedLevels = {};
  final Map<String, int> carLevels = {};
  final Map<String, int> accessLevels = {};
  final Map<String, int> trainsetLevels = {};

  int speedLevelOf(String lineId) => speedLevels[lineId] ?? 0;
  int carLevelOf(String lineId) => carLevels[lineId] ?? 0;
  int accessLevelOf(String lineId) => accessLevels[lineId] ?? 0;
  int trainsetLevelOf(String lineId) => trainsetLevels[lineId] ?? 0;

  /// This line's trains: +15% speed per level, times network signals.
  double trainSpeedFor(String lineId) =>
      baseSpeed *
      (1 + 0.15 * speedLevelOf(lineId)) *
      (1 + 0.04 * globalLevelOf('signal'));

  /// This line's cars: riders boarded per stop (base pinned with
  /// [demandScale] against the XL line-1 geometry — see above).
  double capacityFor(String lineId) => 22 + 6.0 * carLevelOf(lineId);

  /// Ridership multiplier at one station. Every unlocked line serving it
  /// COMPOUNDS its own upgrades (step-free ×, new subway cars ×), then the
  /// station's food court and city-wide marketing multiply on top — so an
  /// interchange rewards investing in each of its lines.
  double demandMultAt(String stationId) {
    var m = 1.0;
    for (final lineId in _linesServing[stationId] ?? const <String>[]) {
      m *= (1 + 0.10 * accessLevelOf(lineId)) *
          (1 + 0.08 * trainsetLevelOf(lineId));
    }
    m *= 1 + 0.10 * (foodLevel[stationId] ?? 0);
    m *= 1 + 0.06 * (parkingLevel[stationId] ?? 0);
    return m * (1 + 0.05 * globalLevelOf('marketing'));
  }

  /// What one rider pays boarding here: live fare + concessions + fare
  /// gates recovering evaded fares, all lifted by ad billboards. The pop
  /// you see is riders × this.
  double incomePerRiderAt(String stationId) =>
      (currentFare +
          (foodBonusPerLevel * (foodLevel[stationId] ?? 0) +
                  0.25 * (gateLevel[stationId] ?? 0)) *
              city.fareScale) *
      (1 + 0.04 * (securityLevel[stationId] ?? 0)) *
      (1 + 0.03 * globalLevelOf('billboards')) *
      _goalMult;

  /// Waiting riders cap per station: CROWD CONTROL city-wide, plus this
  /// station's escalators.
  double get stationCapNow => stationCapBase + 8.0 * globalLevelOf('crowd');
  double stationCapAt(String stationId) =>
      stationCapNow + 8.0 * (escalatorLevel[stationId] ?? 0);

  /// Offline pay rate, grown by NIGHT SERVICE (50% → 80% at max).
  double get offlineEfficiencyNow =>
      offlineEfficiency + 0.06 * globalLevelOf('night');

  /// Upgrade prices scale with the line's tier, so late lines cost more to
  /// tune but earn more too.
  double _upgradeBase(LineDef line) =>
      250 * city.costScale + line.unlockCost * 0.05;
  double speedCost(String lineId, int level) =>
      _upgradeBase(city.lineById(lineId)) * pow(1.9, level).toDouble();
  double carCost(String lineId, int level) =>
      _upgradeBase(city.lineById(lineId)) * 1.2 * pow(2.0, level).toDouble();
  double accessCost(String lineId, int level) =>
      _upgradeBase(city.lineById(lineId)) * 1.5 * pow(2.1, level).toDouble();
  double trainsetCost(String lineId, int level) =>
      _upgradeBase(city.lineById(lineId)) * 1.4 * pow(2.05, level).toDouble();

  double nextSpeedCost(String lineId) =>
      speedCost(lineId, speedLevelOf(lineId));
  double nextCarCost(String lineId) => carCost(lineId, carLevelOf(lineId));
  double nextAccessCost(String lineId) =>
      accessCost(lineId, accessLevelOf(lineId));
  double nextTrainsetCost(String lineId) =>
      trainsetCost(lineId, trainsetLevelOf(lineId));

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
  /// after), discounted by RAIL YARDS.
  double nextTrainCost(LineDef line) =>
      line.trainCost *
      pow(2.5, trainCount(line.id) - 1).toDouble() *
      (1 - 0.04 * globalLevelOf('yards'));

  /// Advance the world by [dt] seconds. Deterministic; safe for any small
  /// positive step (the UI uses frame deltas, tests use 0.1s loops).
  void tick(double dt) {
    if (dt <= 0) return;

    rushClock += dt;

    // Riders arrive at every served station, choosing the platform for
    // their direction — 50/50 where both are served, everyone to the one
    // platform at a line's end — up to the station's total cap.
    for (final id in _served) {
      final add = city.stationById(id).demand *
          demandScale *
          demandMultAt(id) *
          rushFactorAt(id) *
          dt;
      final both = _upServed.contains(id) && _downServed.contains(id);
      var dUp = both ? add / 2 : (_upServed.contains(id) ? add : 0.0);
      var dDown = both ? add / 2 : (_downServed.contains(id) ? add : 0.0);
      final room = stationCapAt(id) - waitingUp[id]! - waitingDown[id]!;
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

    _tickCommission(dt);
    _checkGoals();

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
    final stationId = line.stationIds[t.target];
    _board(t.lineId, stationId, nextDir);
    // Platform works speed this station's boarding on top of city doors.
    t.dwell =
        effectiveDwell * (1 - 0.15 * (platformLevel[stationId] ?? 0));
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
    final earned = take * incomePerRiderAt(stationId);
    cash += earned;
    totalEarned += earned;
    totalRiders += take;
    _windowEarned += earned;
    boardSeq += 1;
    lastBoardStationId = stationId;
    lastBoardLineId = lineId;
    lastBoardAmount = earned;
    lastBoardCount = take.floor();
    if (commissionActive && lineId == commissionLineId) {
      commissionProgress += take;
    }
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
  bool buyTrainset(String lineId) => _buy(
      isUnlocked(lineId) && trainsetLevelOf(lineId) < levelMax,
      nextTrainsetCost(lineId), () {
        trainsetLevels[lineId] = trainsetLevelOf(lineId) + 1;
      });

  bool buyLine(String lineId) {
    final line = city.lineById(lineId);
    return _buy(!isUnlocked(lineId), line.unlockCost, () {
      unlockedLineIds.add(lineId);
      _recomputeServed();
      trains.add(_spawnTrain(line));
      unlockSeq += 1;
      lastUnlockedLineId = lineId;
    });
  }

  bool buyTrain(String lineId) {
    final line = city.lineById(lineId);
    return _buy(isUnlocked(lineId), nextTrainCost(line), () {
      trains.add(_spawnTrain(line));
    });
  }

  /// Where a new train enters service. A ping-pong train is a point on a
  /// circular ROUND-TRIP phase [0, 2L): phase < L is distance-p heading
  /// up, phase ≥ L is heading back. The new train spawns at the midpoint
  /// of the WIDEST phase gap in the line's current fleet — so buying at
  /// any moment places it bidirectionally equidistant from the trains
  /// that are already running (a 2nd train enters exactly opposite the
  /// 1st, wherever it happens to be), never trailing one redundantly.
  /// All trains on a line run the same speed, so the spacing persists.
  TrainState _spawnTrain(LineDef line) {
    final path = paths[line.id]!;
    final len = path.length;
    final phases = [
      for (final t in trains)
        if (t.lineId == line.id)
          t.direction > 0 ? t.distance : 2 * len - t.distance,
    ]..sort();
    double phase;
    if (phases.isEmpty) {
      phase = 0;
    } else {
      var bestGap = -1.0;
      var bestMid = 0.0;
      for (var i = 0; i < phases.length; i++) {
        final a = phases[i];
        final b =
            i + 1 < phases.length ? phases[i + 1] : phases[0] + 2 * len;
        if (b - a > bestGap) {
          bestGap = b - a;
          bestMid = (a + b) / 2 % (2 * len);
        }
      }
      phase = bestMid;
    }
    final direction = phase < len ? 1 : -1;
    final d = phase < len ? phase : 2 * len - phase;
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

  bool buyFood(String stationId) => buyStationWork('food', stationId);
  bool buyGates(String stationId) => buyStationWork('gates', stationId);
  bool buyPlatform(String stationId) => buyStationWork('platform', stationId);

  double foodCost(int level) => stationWorkCost('food', level);
  double gateCost(int level) => stationWorkCost('gates', level);
  double platformCost(int level) => stationWorkCost('platform', level);

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
    final credit = seconds * avgRate * offlineEfficiencyNow;
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
  static const int saveVersion = 14;

  Map<String, dynamic> toJson(int nowMs) => {
        'v': saveVersion,
        'cityId': city.id,
        'cash': cash,
        'totalEarned': totalEarned,
        'totalRiders': totalRiders,
        'unlockedLineIds': unlockedLineIds.toList(),
        'trains': [for (final t in trains) t.toJson()],
        'waitingUp': waitingUp,
        'waitingDown': waitingDown,
        'foodLevel': foodLevel,
        'gateLevel': gateLevel,
        'platformLevel': platformLevel,
        'parkingLevel': parkingLevel,
        'escalatorLevel': escalatorLevel,
        'securityLevel': securityLevel,
        'stationPriority': stationPriority,
        'speedLevels': speedLevels,
        'carLevels': carLevels,
        'accessLevels': accessLevels,
        'trainsetLevels': trainsetLevels,
        'globalLevels': globalLevels,
        'goalsDoneByCity': goalsDoneByCity,
        'coachStep': coachStep,
        'rushClock': rushClock,
        'commissionIndex': commissionIndex,
        'commissionsDone': commissionsDone,
        'commissionActive': commissionActive,
        'commissionProgress': commissionProgress,
        'commissionTimeLeft': commissionTimeLeft,
        'avgRate': avgRate,
        'lastSeenMs': nowMs,
      };

  static GameState fromJson(Map<String, dynamic> j) {
    final cityId = (j['cityId'] as String?) ?? 'new_meridian';
    final g = GameState(city: Cities.byId(cityId));
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
    for (final e in ((j['trainsetLevels'] as Map?) ?? {}).entries) {
      g.trainsetLevels[e.key as String] = e.value as int;
    }
    for (final e in ((j['globalLevels'] as Map?) ?? {}).entries) {
      g.globalLevels[e.key as String] = e.value as int;
    }
    // Pre-v8 saves have no goal state: their counters simply re-complete
    // the ladder on the first tick (an instant commendation cascade).
    // v8 saves carried a single goalsDone int (New Meridian only).
    if (j['goalsDoneByCity'] is Map) {
      for (final e in (j['goalsDoneByCity'] as Map).entries) {
        g.goalsDoneByCity[e.key as String] = e.value as int;
      }
    } else if (j['goalsDone'] is int) {
      g.goalsDoneByCity['new_meridian'] = j['goalsDone'] as int;
    }
    g._recomputeGoalMult();
    g.coachStep = (j['coachStep'] as int?) ?? 0;
    g.rushClock = ((j['rushClock'] as num?) ?? 0).toDouble();
    g.commissionIndex = (j['commissionIndex'] as int?) ?? 0;
    g.commissionsDone = (j['commissionsDone'] as int?) ?? 0;
    g.commissionActive = (j['commissionActive'] as bool?) ?? false;
    g.commissionProgress =
        ((j['commissionProgress'] as num?) ?? 0).toDouble();
    g.commissionTimeLeft =
        ((j['commissionTimeLeft'] as num?) ?? 0).toDouble();
    g.avgRate = (j['avgRate'] as num).toDouble();
    g._loadedLastSeenMs = j['lastSeenMs'] as int?;

    final version = (j['v'] as int?) ?? 1;
    if (version < 3) {
      // Older saves reference the pre-approval network (different stations
      // and line ids): money, upgrades, and the earn rate carry over; the
      // world restarts on line 1 of the approved map.
      return g;
    }

    final lineIds = {for (final l in g.city.lines) l.id};
    g.unlockedLineIds
      ..clear()
      ..addAll([
        for (final id in (j['unlockedLineIds'] as List))
          if (lineIds.contains(id as String)) id
      ]);
    if (g.unlockedLineIds.isEmpty) {
      g.unlockedLineIds.add(g.city.lines.first.id);
    }
    g.trains.clear();
    if (version >= 10) {
      g.trains.addAll([
        for (final t in (j['trains'] as List))
          TrainState.fromJson(t as Map<String, dynamic>)
      ]);
    } else {
      // Pre-XL saves (build <24): line ids survive the bigger map but
      // path geometry does not. Keep each line's train COUNT and respawn
      // the fleets evenly spaced on the new tracks.
      final counts = <String, int>{};
      for (final t in (j['trains'] as List)) {
        final id = (t as Map<String, dynamic>)['lineId'] as String;
        if (lineIds.contains(id)) counts[id] = (counts[id] ?? 0) + 1;
      }
      for (final lineId in g.unlockedLineIds) {
        final n = counts[lineId] ?? 1;
        for (var i = 0; i < n; i++) {
          g.trains.add(g._spawnTrain(g.city.lineById(lineId)));
        }
      }
    }
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
    // Per-station upgrades (v7 added gates/platform, v11 the rest) —
    // absent keys default to zero, unknown station ids drop.
    for (final entry in {
      'gateLevel': g.gateLevel,
      'platformLevel': g.platformLevel,
      'parkingLevel': g.parkingLevel,
      'escalatorLevel': g.escalatorLevel,
      'securityLevel': g.securityLevel,
    }.entries) {
      for (final e in ((j[entry.key] as Map?) ?? {}).entries) {
        if (entry.value.containsKey(e.key)) {
          entry.value[e.key as String] = e.value as int;
        }
      }
    }
    // The player's build priority: keep saved order for known types,
    // append any types added since in catalog order.
    if (j['stationPriority'] is List) {
      final known = {for (final u in stationUpgrades) u.id};
      final saved = [
        for (final id in (j['stationPriority'] as List))
          if (known.contains(id as String)) id
      ];
      final missing = [
        for (final u in stationUpgrades)
          if (!saved.contains(u.id)) u.id
      ];
      g.stationPriority
        ..clear()
        ..addAll([...saved, ...missing]);
    }
    return g;
  }
}
