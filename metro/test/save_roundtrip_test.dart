import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:metro_magnate/state/game_state.dart';

/// Save guard (pure encode→decode, no storage plugin): a running world must
/// come back mid-lap — money, upgrades, waiting platforms, and the train's
/// exact position on the line.
void main() {
  test('save round-trips a played-in world', () {
    final g = GameState();
    for (var i = 0; i < 2000; i++) {
      g.tick(0.1);
      g.buySpeed();
      g.buyAccess();
    }

    final r = GameState.fromJson(jsonDecode(
        jsonEncode(g.toJson(123456789))) as Map<String, dynamic>);

    expect(r.cash, closeTo(g.cash, 0.001));
    expect(r.totalEarned, closeTo(g.totalEarned, 0.001));
    expect(r.totalRiders, closeTo(g.totalRiders, 0.001));
    expect(r.speedLevel, g.speedLevel);
    expect(r.capacityLevel, g.capacityLevel);
    expect(r.accessLevel, g.accessLevel);
    expect(r.trainDistance, closeTo(g.trainDistance, 0.001));
    expect(r.direction, g.direction);
    expect(r.avgRate, closeTo(g.avgRate, 0.001));
    for (var i = 0; i < g.waiting.length; i++) {
      expect(r.waiting[i], closeTo(g.waiting[i], 0.001));
    }

    // And the restored world must keep running.
    final before = r.totalEarned;
    for (var i = 0; i < 600; i++) {
      r.tick(0.1);
    }
    expect(r.totalEarned, greaterThan(before));
  });

  test('a fresh world serializes cleanly', () {
    final g = GameState();
    final r = GameState.fromJson(
        jsonDecode(jsonEncode(g.toJson(1))) as Map<String, dynamic>);
    expect(r.cash, 0);
    expect(r.trainDistance, 0);
  });
}
