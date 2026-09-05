import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:metro_magnate/state/game_state.dart';

/// Save guard (pure encode→decode, no storage plugin): a running multi-line
/// system must come back mid-lap — money, lines, every train's position,
/// platforms, and food courts.
void main() {
  test('save round-trips a played-in system', () {
    final g = GameState();
    g.cash = 60000;
    g.buyLine('lineA');
    g.buyTrain('line1');
    g.buyFood('union');
    g.buyFood('union');
    for (var i = 0; i < 2000; i++) {
      g.tick(0.1);
      g.buySpeed();
      g.buyAccess();
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
    expect(r.foodLevel['union'], 2);
    expect(r.speedLevel, g.speedLevel);
    expect(r.accessLevel, g.accessLevel);
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

  test('a v1 save migrates: money & upgrades survive, world starts fresh', () {
    final v1 = {
      'v': 1,
      'cash': 1234.5,
      'totalEarned': 9999.0,
      'totalRiders': 4000.0,
      'waiting': [1.0, 2.0, 3.0, 4.0, 5.0],
      'trainDistance': 50.0,
      'direction': -1,
      'dwellRemaining': 0.2,
      'targetStation': 2,
      'speedLevel': 4,
      'capacityLevel': 3,
      'accessLevel': 2,
      'avgRate': 5.5,
      'lastSeenMs': 1000,
    };
    final g = GameState.fromJson(v1);
    expect(g.cash, closeTo(1234.5, 0.001));
    expect(g.speedLevel, 4);
    expect(g.capacityLevel, 3);
    expect(g.accessLevel, 2);
    expect(g.avgRate, closeTo(5.5, 0.001));
    expect(g.unlockedLineIds, {'line1'});
    expect(g.trains.length, 1);
    // Migrated worlds must run.
    for (var i = 0; i < 600; i++) {
      g.tick(0.1);
    }
    expect(g.totalEarned, greaterThan(9999.0));
  });

  test('a fresh system serializes cleanly', () {
    final g = GameState();
    final r = GameState.fromJson(
        jsonDecode(jsonEncode(g.toJson(1))) as Map<String, dynamic>);
    expect(r.cash, 0);
    expect(r.unlockedLineIds, {'line1'});
    expect(r.trains.length, 1);
  });
}
