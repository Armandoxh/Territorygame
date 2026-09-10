import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:wealthquest/data/catalog.dart';
import 'package:wealthquest/state/game_controller.dart';

/// Guards the save system: a game encoded to JSON and rebuilt must come back
/// with its money, holdings, and life choices intact. Runs as a pure unit test
/// (no shared_preferences), so it catches a missed/ mistyped field in CI.
void main() {
  test('save round-trips a played-in game', () {
    final g = GameController(seed: 7);
    g.toggleInsurance('health');
    g.advanceMonths(18); // earn, age, accrue notifications/market state

    // Buy the first affordable unlocked asset so a holding is exercised.
    for (final c in Catalog.categories) {
      final assets = g.unlockedAssets(c.id);
      if (assets.isNotEmpty && g.cash > 3000) {
        g.buy(assets.first, 2000);
        break;
      }
    }
    g.advanceMonths(12);

    // Encode + decode exactly as persistence would.
    final restored = GameController.fromJson(
        jsonDecode(jsonEncode(g.toJson())) as Map<String, dynamic>);

    expect(restored.day, g.day);
    expect(restored.cash, closeTo(g.cash, 0.01));
    expect(restored.debt, closeTo(g.debt, 0.01));
    expect(restored.health, g.health);
    expect(restored.isDead, g.isDead);
    expect(restored.job.id, g.job.id);
    expect(restored.eduLevel, g.eduLevel);
    expect(restored.rungIndex, g.rungIndex);
    expect(restored.currentTrackId, g.currentTrackId);
    expect(restored.holdings.length, g.holdings.length);
    expect(restored.insurancePolicies, g.insurancePolicies);
    expect(restored.completedDegrees, g.completedDegrees);
    expect(restored.completedGoals, g.completedGoals);
    expect(restored.regime, g.regime);
    expect(restored.retirementBalance, closeTo(g.retirementBalance, 0.01));
    // The headline number — net worth — must survive intact.
    expect(restored.netWorth, closeTo(g.netWorth, 1.0));
  });

  test('a brand-new game with no holdings serializes cleanly', () {
    final g = GameController(seed: 3);
    final restored = GameController.fromJson(
        jsonDecode(jsonEncode(g.toJson())) as Map<String, dynamic>);
    expect(restored.holdings, isEmpty);
    expect(restored.netWorth, closeTo(g.netWorth, 1.0));
    expect(restored.day, g.day);
  });
}
