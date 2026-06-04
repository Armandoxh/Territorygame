import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:wealthquest/data/catalog.dart';
import 'package:wealthquest/models/climate.dart';
import 'package:wealthquest/state/game_controller.dart';

/// An automated player ("agent") that plays WealthQuest against the real game
/// logic, so we can smoke-test the whole flow and sanity-check balance without
/// a human (or a browser). Run via `flutter test`; the report prints to stdout
/// and shows up in CI logs.
///
/// A strategy gets the live controller each week and may take a job and buy
/// assets; the harness then advances one week.
typedef Strategy = void Function(GameController g);

class SimResult {
  final String strategy;
  final int seed;
  final double finalNetWorth;
  final double peak;
  final double maxDrawdown;
  final int ageYears;
  final bool wentNegativeCash;

  SimResult(this.strategy, this.seed, this.finalNetWorth, this.peak,
      this.maxDrawdown, this.ageYears, this.wentNegativeCash);
}

SimResult _run(String name, Strategy strat, int seed, int weeks) {
  final g = GameController(seed: seed);
  var peak = g.netWorth;
  var maxDd = 0.0;
  var negCash = false;

  for (var w = 0; w < weeks; w++) {
    strat(g);
    g.advanceDay();

    final nw = g.netWorth;
    expect(nw.isFinite, isTrue, reason: '$name seed $seed: net worth not finite');
    expect(g.cash.isFinite, isTrue, reason: '$name seed $seed: cash not finite');

    if (nw > peak) peak = nw;
    if (peak > 0) {
      final dd = (peak - nw) / peak;
      if (dd > maxDd) maxDd = dd;
    }
    if (g.cash < -1) negCash = true;
  }
  return SimResult(
      name, seed, g.netWorth, peak, maxDd, g.ageYears, negCash);
}

// ---- Strategies -----------------------------------------------------------

void _takeBestJob(GameController g) {
  final jobs = g.availableJobs;
  if (jobs.isNotEmpty && jobs.last.id != g.job.id) g.takeJob(jobs.last);
}

/// Keeps ~8 weeks of expenses as a buffer, then dollar-cost-averages spare cash
/// into a diversified mix — and de-risks into insured cash during bad climates.
void diversified(GameController g) {
  _takeBestJob(g);
  final buffer = g.dailyExpenses * 8;
  final investable = g.cash - buffer;
  if (investable < 50) return;

  final defensive =
      g.regime == MarketRegime.downturn || g.regime == MarketRegime.crash;
  final plan = defensive
      ? <(String, double)>[('hysa', 1.0)]
      : <(String, double)>[
          ('spx', 0.40),
          ('vtm', 0.15),
          ('bndx', 0.15),
          ('btq', 0.10),
          ('hysa', 0.20),
        ];

  for (final (id, weight) in plan) {
    final def = Catalog.assetById(id);
    final amt = investable * weight;
    if (amt > 1 && amt >= def.minInvestment) g.buy(def, amt);
  }
}

Strategy _allIn(String id) => (g) {
      _takeBestJob(g);
      final buffer = g.dailyExpenses * 8;
      final investable = g.cash - buffer;
      final def = Catalog.assetById(id);
      if (investable > 1 && investable >= def.minInvestment) {
        g.buy(def, investable);
      }
    };

void main() {
  const years = 25;
  const weeks = years * 52;
  const seeds = [1, 2, 3, 7, 42];

  final strategies = <String, Strategy>{
    'Diversified (climate-aware)': diversified,
    'All HYSA (safe)': _allIn('hysa'),
    'All S&P 500': _allIn('spx'),
    'All crypto (BTQ)': _allIn('btq'),
  };

  test('play-agent: $years years x ${seeds.length} seeds, all strategies', () {
    final money = (double v) => '\$${v.toStringAsFixed(0).replaceAllMapped(
          RegExp(r'\B(?=(\d{3})+(?!\d))'),
          (m) => ',',
        )}';

    final lines = <String>[];
    lines.add('');
    lines.add('================ WealthQuest play-agent report ================');
    lines.add('Each agent starts at 18 with \$500 and plays $years years.');

    strategies.forEach((name, strat) {
      final results = [for (final s in seeds) _run(name, strat, s, weeks)];
      final avgFinal =
          results.map((r) => r.finalNetWorth).reduce((a, b) => a + b) /
              results.length;
      final avgDd =
          results.map((r) => r.maxDrawdown).reduce((a, b) => a + b) /
              results.length;
      final anyNeg = results.any((r) => r.wentNegativeCash);
      final best = results.map((r) => r.finalNetWorth).reduce(max);
      final worst = results.map((r) => r.finalNetWorth).reduce(min);

      lines.add('');
      lines.add('--- $name ---');
      lines.add('  avg final net worth: ${money(avgFinal)}'
          '   (worst ${money(worst)}, best ${money(best)})');
      lines.add('  avg max drawdown:    ${(avgDd * 100).toStringAsFixed(1)}%');
      lines.add('  ever went cash-negative: ${anyNeg ? 'YES ⚠' : 'no'}');
    });

    lines.add('');
    lines.add('===============================================================');
    // ignore: avoid_print
    print(lines.join('\n'));

    // Sanity: a steady diversified investor with a salary should build real
    // wealth over 25 years and never NaN out.
    final div = _run('Diversified', diversified, 42, weeks);
    expect(div.finalNetWorth, greaterThan(50000),
        reason: 'a 25-year diversified investor should accumulate wealth');
  });
}
