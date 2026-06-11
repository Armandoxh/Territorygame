import 'dart:math';

import 'package:wealthquest/state/game_controller.dart';

/// Drives one full life and records outcomes. Auto-resolves crises, handles
/// margin calls (liquidate, or declare bankruptcy if truly stuck), tracks the
/// peak/drawdown, and stops at death.
class LifeAgent {
  LifeAgent(int seed) : g = GameController(seed: seed);

  final GameController g;
  final Set<String> covered = {};
  final List<String> bugs = [];

  double peak = 0;
  double maxDrawdown = 0;
  int? deathAge;

  void mark(String f) => covered.add(f);
  void bug(String m) => bugs.add('age ${g.ageYears}: $m');

  /// Run an action, recording coverage; never let a thrown error abort the run.
  void act(String feature, void Function() action) {
    try {
      action();
      mark(feature);
    } catch (e) {
      bug('$feature THREW: $e');
    }
  }

  void advance(int months) {
    var left = months;
    var guard = 0;
    while (left > 0 && guard++ < months + 80) {
      final out = g.advanceMonths(left);
      left -= out.months;
      if (out.result.crisis && g.pendingCrisis != null) {
        g.resolveCrisis(g.pendingCrisis!.choices.first);
        covered.add('crisis');
      }
      if (out.result.marginCall) {
        covered.add('marginCall');
        for (final h in [...g.holdings]) {
          if (g.cash >= 0) break;
          if (!h.isLocked) g.sell(h, 0, max: true);
        }
        if (g.faceBankruptcy) {
          g.declareBankruptcy();
          covered.add('bankruptcy');
        } else {
          g.clearOverdraftStreak();
        }
      }
      // Track peak + worst drawdown for "tension".
      if (g.netWorth > peak) peak = g.netWorth;
      if (peak > 0) {
        final dd = (peak - g.netWorth) / peak;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }
      if (g.isDead) {
        deathAge ??= g.ageYears;
        break;
      }
      if (out.months == 0 && g.pendingCrisis == null) break;
    }
    if (!g.netWorth.isFinite) bug('netWorth went non-finite');
  }

  /// Play until the player dies (or a hard age cap as a safety net).
  void runToDeath() {
    var guard = 0;
    while (!g.isDead && g.ageYears < 110 && guard++ < 1400) {
      advance(1);
    }
  }
}

double median(List<double> xs) {
  if (xs.isEmpty) return 0;
  final s = [...xs]..sort();
  final n = s.length;
  return n.isOdd ? s[n ~/ 2] : (s[n ~/ 2 - 1] + s[n ~/ 2]) / 2;
}

double pctTrue(List<bool> xs) =>
    xs.isEmpty ? 0 : 100 * xs.where((x) => x).length / xs.length;

String usd(double v) {
  final a = v.abs();
  String s;
  if (a >= 1e6) {
    s = '\$${(v / 1e6).toStringAsFixed(2)}M';
  } else if (a >= 1e3) {
    s = '\$${(v / 1e3).toStringAsFixed(0)}k';
  } else {
    s = '\$${v.toStringAsFixed(0)}';
  }
  return s;
}
