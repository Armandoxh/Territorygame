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
    g.buyFood('s114_172');
    g.buyFood('s114_172');
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
    expect(r.foodLevel['s114_172'], 2);
    expect(r.speedLevelOf('1'), g.speedLevelOf('1'));
    expect(r.accessLevelOf('1'), g.accessLevelOf('1'));
    expect(r.globalLevelOf('signal'), g.globalLevelOf('signal'));
    expect(r.globalLevelOf('fare'), g.globalLevelOf('fare'));
    expect(r.currentFare, closeTo(g.currentFare, 0.001));
    expect(r.avgRate, closeTo(g.avgRate, 0.001));
    for (final e in g.waiting.entries) {
      expect(r.waiting[e.key], closeTo(e.value, 0.001));
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

  test('a fresh system serializes cleanly', () {
    final g = GameState();
    final r = GameState.fromJson(
        jsonDecode(jsonEncode(g.toJson(1))) as Map<String, dynamic>);
    expect(r.cash, 0);
    expect(r.unlockedLineIds, {'1'});
    expect(r.trains.length, 1);
  });
}
