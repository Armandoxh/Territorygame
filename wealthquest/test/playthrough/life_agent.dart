import 'package:wealthquest/data/goals.dart';
import 'package:wealthquest/state/game_controller.dart';

/// Drives one full life and audits it every month. Auto-resolves crises,
/// handles margin calls (liquidate, or declare bankruptcy when truly stuck),
/// checks a battery of invariants each step, tracks peak/drawdown/pacing, and
/// stops at death.
class LifeAgent {
  LifeAgent(int seed) : g = GameController(seed: seed);

  final GameController g;
  final Set<String> covered = {};
  final List<String> bugs = [];

  double peak = 0;
  double maxDrawdown = 0;
  int? deathAge;
  int? millionAge;

  int _lastDay = -1;
  int _lastGoals = 0;
  int _lastBk = 0;

  void mark(String f) => covered.add(f);
  void bug(String m) {
    if (bugs.length < 300) bugs.add('age ${g.ageYears}: $m');
  }

  void act(String feature, void Function() action) {
    try {
      action();
      mark(feature);
    } catch (e) {
      bug('$feature THREW: $e');
    }
  }

  /// The audit: invariants that must hold every single month.
  void _check() {
    if (!g.netWorth.isFinite) bug('netWorth not finite');
    if (!g.cash.isFinite) bug('cash not finite');
    if (g.health < 0 || g.health > 100) bug('health out of range: ${g.health}');
    if (g.creditScore < 300 || g.creditScore > 850) {
      bug('credit score out of range: ${g.creditScore}');
    }
    if (g.standingTier < 0 || g.standingTier > 3) {
      bug('standing tier out of range: ${g.standingTier}');
    }
    if (g.retirementBalance < -1) bug('negative 401k: ${g.retirementBalance}');
    if (g.studentLoan < -1) bug('negative student loan');
    if (g.debt < -1) bug('negative debt');
    if (g.holdingsValue < -1) bug('negative holdings value');
    if (g.score != Goals.pointsFor(g.completedGoals)) {
      bug('score ${g.score} != goal points ${Goals.pointsFor(g.completedGoals)}');
    }
    // Net-worth composition must equal its parts (regression guard).
    final composed = g.cash +
        g.holdingsValue +
        g.propertiesEquity +
        g.pendingBetsValue +
        g.retirementBalance +
        g.businessesValue -
        g.studentLoan -
        g.debt;
    if ((composed - g.netWorth).abs() > 1.0) {
      bug('netWorth composition off by ${(composed - g.netWorth).toStringAsFixed(0)}');
    }
    // Monotonicity.
    if (g.day < _lastDay) bug('day went backwards');
    if (g.completedGoals.length < _lastGoals) bug('a goal got un-completed');
    if (g.bankruptcies < _lastBk) bug('bankruptcy count decreased');
    // Bankruptcy this step → its post-conditions must hold.
    if (g.bankruptcies > _lastBk) {
      covered.add('bankruptcy');
      if (g.properties.isNotEmpty ||
          g.businesses.isNotEmpty ||
          g.holdings.isNotEmpty) {
        bug('bankruptcy left assets behind');
      }
      if (g.debt > 1) bug('bankruptcy left consumer debt');
      if (!g.hasBankruptcyMark) bug('bankruptcy without a credit mark');
    }
    _lastDay = g.day;
    _lastGoals = g.completedGoals.length;
    _lastBk = g.bankruptcies;
  }

  void advance(int months) {
    var left = months;
    var guard = 0;
    while (left > 0) {
      if (guard++ > months + 200) {
        bug('SOFTLOCK: advance stalled at age ${g.ageYears}');
        break;
      }
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
        } else {
          g.clearOverdraftStreak();
        }
      }
      if (g.netWorth > peak) peak = g.netWorth;
      if (peak > 0) {
        final dd = (peak - g.netWorth) / peak;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }
      if (millionAge == null && g.netWorth >= 1000000) millionAge = g.ageYears;
      _check();
      if (g.isDead) {
        deathAge ??= g.ageYears;
        break;
      }
      if (out.months == 0 && g.pendingCrisis == null) break;
    }
  }

  void runToDeath() {
    var guard = 0;
    while (!g.isDead && g.ageYears < 110 && guard++ < 1500) {
      advance(1);
    }
  }
}

// ---- stats helpers ----

double median(List<double> xs) {
  if (xs.isEmpty) return 0;
  final s = [...xs]..sort();
  final n = s.length;
  return n.isOdd ? s[n ~/ 2] : (s[n ~/ 2 - 1] + s[n ~/ 2]) / 2;
}

double percentile(List<double> xs, double p) {
  if (xs.isEmpty) return 0;
  final s = [...xs]..sort();
  final idx = ((s.length - 1) * p).round().clamp(0, s.length - 1);
  return s[idx];
}

double pctTrue(List<bool> xs) =>
    xs.isEmpty ? 0 : 100 * xs.where((x) => x).length / xs.length;

String usd(double v) {
  final a = v.abs();
  if (a >= 1e6) return '\$${(v / 1e6).toStringAsFixed(2)}M';
  if (a >= 1e3) return '\$${(v / 1e3).toStringAsFixed(0)}k';
  return '\$${v.toStringAsFixed(0)}';
}
