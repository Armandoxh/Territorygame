import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:metro_magnate/state/game_state.dart';

/// Save guard (pure encode→decode): the running multi-line system must come
/// back mid-lap; pre-approval saves (v1/v2, different network) must migrate
/// their money and upgrades onto the new map without crashing.
void main() {
  test('save round-trips a played-in system', () {
    final g = GameState();
    g.cash = 60000;
    g.buyLine(g.city.lines[1].id);
    g.buyTrain('1');
    g.buyFood('s224_282');
    g.buyFood('s224_282');
    g.buyGates('s224_282');
    g.buyPlatform('s224_282');
    g.buyStationWork('parking', 's224_282');
    g.buyStationWork('escalators', 's224_282');
    g.buyStationWork('security', 's224_282');
    g.raisePriority('security');
    g.buyTrainset('1');
    for (var i = 0; i < 2000; i++) {
      g.tick(0.1);
      g.buySpeed('1');
      g.buyAccess('1');
      g.buyGlobal('signal');
      g.buyGlobal('fare');
    }

    final r = GameState.fromJson(
        jsonDecode(jsonEncode(g.toJson(123456789))) as Map<String, dynamic>);

    expect(r.cash, closeTo(g.cash, 0.001));
    expect(r.totalEarned, closeTo(g.totalEarned, 0.001));
    expect(r.totalRiders, closeTo(g.totalRiders, 0.001));
    expect(r.unlockedLineIds, g.unlockedLineIds);
    expect(r.trains.length, g.trains.length);
    for (var i = 0; i < g.trains.length; i++) {
      expect(r.trains[i].lineId, g.trains[i].lineId);
      expect(r.trains[i].distance, closeTo(g.trains[i].distance, 0.001));
      expect(r.trains[i].direction, g.trains[i].direction);
      expect(r.trains[i].target, g.trains[i].target);
    }
    expect(r.foodLevel['s224_282'], 2);
    expect(r.gateLevel['s224_282'], 1);
    expect(r.platformLevel['s224_282'], 1);
    expect(r.parkingLevel['s224_282'], 1);
    expect(r.escalatorLevel['s224_282'], 1);
    expect(r.securityLevel['s224_282'], 1);
    expect(r.stationPriority, orderedEquals(g.stationPriority),
        reason: 'my works priority order survives the reload');
    g.coachStep = 3;
    final r2 = GameState.fromJson(
        jsonDecode(jsonEncode(g.toJson(1))) as Map<String, dynamic>);
    expect(r2.coachStep, 3, reason: 'coach marks never repeat themselves');
    expect(r.trainsetLevelOf('1'), g.trainsetLevelOf('1'));
    expect(r.goalsDone, g.goalsDone);
    expect(r.goalMult, closeTo(g.goalMult, 1e-9));
    expect(g.goalsDone, greaterThanOrEqualTo(1),
        reason: 'the played-in system should have earned a commendation');
    expect(r.speedLevelOf('1'), g.speedLevelOf('1'));
    expect(r.accessLevelOf('1'), g.accessLevelOf('1'));
    expect(r.globalLevelOf('signal'), g.globalLevelOf('signal'));
    expect(r.globalLevelOf('fare'), g.globalLevelOf('fare'));
    expect(r.currentFare, closeTo(g.currentFare, 0.001));
    expect(r.avgRate, closeTo(g.avgRate, 0.001));
    expect(r.rushClock, closeTo(g.rushClock, 0.001),
        reason: 'the rush schedule continues where it left off');
    expect(r.rushEarnings, closeTo(g.rushEarnings, 0.001));
    for (final e in g.waitingUp.entries) {
      expect(r.waitingUp[e.key], closeTo(e.value, 0.001));
      expect(r.waitingDown[e.key], closeTo(g.waitingDown[e.key]!, 0.001));
    }

    // And the restored world must keep running.
    final before = r.totalEarned;
    for (var i = 0; i < 600; i++) {
      r.tick(0.1);
    }
    expect(r.totalEarned, greaterThan(before));
  });

  test('pre-approval saves (v1/v2) migrate: money survives, world restarts',
      () {
    for (final old in [
      {
        'v': 1,
        'cash': 1234.5,
        'totalEarned': 9999.0,
        'totalRiders': 4000.0,
        'waiting': [1.0, 2.0, 3.0],
        'trainDistance': 50.0,
        'direction': -1,
        'dwellRemaining': 0.2,
        'targetStation': 2,
        'speedLevel': 4,
        'capacityLevel': 3,
        'accessLevel': 2,
        'avgRate': 5.5,
        'lastSeenMs': 1000,
      },
      {
        'v': 2,
        'cash': 777.0,
        'totalEarned': 5000.0,
        'totalRiders': 2000.0,
        'unlockedLineIds': ['line1', 'lineA'],
        'trains': [
          {
            'lineId': 'line1',
            'distance': 10.0,
            'direction': 1,
            'dwell': 0.0,
            'target': 1
          }
        ],
        'waiting': {'union': 3.0},
        'foodLevel': {'union': 2},
        'speedLevel': 1,
        'capacityLevel': 0,
        'accessLevel': 1,
        'avgRate': 4.0,
        'lastSeenMs': 1000,
      },
    ]) {
      final g = GameState.fromJson(old);
      expect(g.cash, closeTo((old['cash'] as num).toDouble(), 0.001));
      // Old GLOBAL upgrade levels land on line 1.
      expect(g.speedLevelOf('1'), old['speedLevel']);
      expect(g.globalLevelOf('fare'), 0,
          reason: 'saves from before the NETWORK tab start with no globals');
      expect(g.avgRate, closeTo((old['avgRate'] as num).toDouble(), 0.001));
      expect(g.unlockedLineIds, {'1'},
          reason: 'migrated worlds restart on line 1 of the approved map');
      expect(g.trains.length, 1);
      for (var i = 0; i < 600; i++) {
        g.tick(0.1);
      }
      expect(g.totalEarned,
          greaterThan((old['totalEarned'] as num).toDouble()));
    }
  });

  test('v5 saves split their single queue onto the served platforms', () {
    final played = GameState();
    played.cash = 100000;
    played.buyTrain('1');
    for (var i = 0; i < 1200; i++) {
      played.tick(0.1);
    }
    final j = jsonDecode(jsonEncode(played.toJson(1))) as Map<String, dynamic>;
    final combined = {
      for (final id in played.waitingUp.keys) id: played.waitingAt(id),
    };
    j['v'] = 5;
    j.remove('waitingUp');
    j.remove('waitingDown');
    j['waiting'] = combined;

    final g = GameState.fromJson(j);
    for (final e in combined.entries) {
      expect(g.waitingAt(e.key), closeTo(e.value, 0.001),
          reason: 'no rider lost migrating ${e.key}');
      if (!g.upServed(e.key)) expect(g.waitingUp[e.key], 0);
      if (!g.downServed(e.key)) expect(g.waitingDown[e.key], 0);
    }
  });

  test('an Angel Bay world round-trips with its city and ladder intact', () {
    // Arrive the honest way: finish New Meridian and move on.
    final nm = GameState();
    nm.cash = 1e12;
    for (final line in nm.city.lines) {
      if (!nm.isUnlocked(line.id)) nm.buyLine(line.id);
    }
    nm.totalRiders = 5000000;
    nm.totalEarned = 250000000;
    nm.commissionsDone = 99;
    nm.rushEarnings = 1e9;
    for (final l in ['1', 'A', 'L', 'M', 'N', 'J']) {
      nm.speedLevels[l] = 10;
    }
    final nmStops = nm.city.lineById('1').stationIds;
    for (var i = 0; i < 8; i++) {
      nm.parkingLevel[nmStops[i]] = 5;
    }
    nm.tick(0.1);
    final g = nm.moveOn();
    expect(g.buyLine('B'), isTrue);
    for (var i = 0; i < 1200; i++) {
      g.tick(0.1);
    }
    final r = GameState.fromJson(
        jsonDecode(jsonEncode(g.toJson(99))) as Map<String, dynamic>);
    expect(r.city.id, 'angel_bay');
    expect(r.unlockedLineIds, g.unlockedLineIds);
    expect(r.goalsDoneByCity['new_meridian'], 22);
    expect(r.goalMult, closeTo(g.goalMult, 1e-6),
        reason: 'carried commendations survive the reload');
    expect(r.cash, closeTo(g.cash, 0.001));
    expect(r.currentFare, GameState.fare * 8);
  });

  test('pre-XL saves (v9) keep lines, upgrades, and fleet sizes', () {
    final played = GameState();
    played.cash = 1e9;
    played.buyLine('A');
    played.buyTrain('1');
    played.buyTrain('1');
    played.buySpeed('1');
    final j = jsonDecode(jsonEncode(played.toJson(1))) as Map<String, dynamic>;
    j['v'] = 9;
    // Old saves carry pre-XL station ids; they must drop cleanly.
    j['waitingUp'] = {'s96_238': 5.0};
    j['waitingDown'] = {'s96_238': 5.0};
    j['foodLevel'] = {'s96_238': 2};

    final g = GameState.fromJson(j);
    expect(g.unlockedLineIds, {'1', 'A'});
    expect(g.trains.where((t) => t.lineId == '1').length, 3,
        reason: "the line's fleet SIZE survives the new geometry");
    expect(g.trains.where((t) => t.lineId == 'A').length, 1);
    expect(g.speedLevelOf('1'), 1, reason: 'per-line upgrades carry');
    expect(g.waitingAt('s126_452'), 0,
        reason: 'unknown old station ids are dropped, not crashed on');
    for (var i = 0; i < 600; i++) {
      g.tick(0.1);
    }
    expect(g.totalEarned, greaterThan(0));
  });

  test('a mid-flight commission survives a reload', () {
    final m = GameState();
    m.acceptCommission();
    for (var i = 0; i < 100; i++) {
      m.tick(0.1);
    }
    final mr = GameState.fromJson(
        jsonDecode(jsonEncode(m.toJson(1))) as Map<String, dynamic>);
    expect(mr.commissionActive, isTrue);
    expect(mr.commissionLineId, m.commissionLineId);
    expect(mr.commissionProgress, closeTo(m.commissionProgress, 0.001));
    expect(mr.commissionTimeLeft, closeTo(m.commissionTimeLeft, 0.001));
  });

  test('a fresh system serializes cleanly', () {
    final g = GameState();
    final r = GameState.fromJson(
        jsonDecode(jsonEncode(g.toJson(1))) as Map<String, dynamic>);
    expect(r.cash, 0);
    expect(r.unlockedLineIds, {'1'});
    expect(r.trains.length, 1);
  });
}
