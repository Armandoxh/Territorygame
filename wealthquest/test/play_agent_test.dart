import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:wealthquest/data/catalog.dart';
import 'package:wealthquest/models/climate.dart';
import 'package:wealthquest/state/game_controller.dart';

/// Automated players ("agents") that exercise the real game logic via
/// `flutter test`, so we can smoke-test the flow and sanity-check balance
/// without a human or a browser. Three kinds of agent:
///
///   1. TUNNEL  — goes all-in on ONE instrument (maps the risk ladder).
///   2. MIXED   — a diversified, human-like investor.
///   3. AUDITOR — doesn't play to win; every month it re-checks that the
///                numbers are internally consistent (catches real bugs).
///
/// Reports print to stdout (visible in CI logs).
typedef Strategy = void Function(GameController g);

String _money(double v) => '\$${v.toStringAsFixed(0).replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (m) => ',',
    )}';

void _takeBestJob(GameController g) {
  final jobs = g.availableJobs;
  if (jobs.isNotEmpty && jobs.last.id != g.job.id) g.takeJob(jobs.last);
}

// ---------------------------------------------------------------------------
// Result + runner (for the playing agents)
// ---------------------------------------------------------------------------

class SimResult {
  final double finalNetWorth;
  final double maxDrawdown;
  final bool wentNegativeCash;
  SimResult(this.finalNetWorth, this.maxDrawdown, this.wentNegativeCash);
}

SimResult _run(Strategy strat, int seed, int months) {
  final g = GameController(seed: seed);
  var peak = g.netWorth;
  var maxDd = 0.0;
  var negCash = false;
  for (var m = 0; m < months; m++) {
    strat(g);
    g.advanceDay();
    final nw = g.netWorth;
    expect(nw.isFinite && g.cash.isFinite, isTrue,
        reason: 'seed $seed month $m: non-finite numbers');
    if (nw > peak) peak = nw;
    if (peak > 0) maxDd = max(maxDd, (peak - nw) / peak);
    if (g.cash < -1) negCash = true;
  }
  return SimResult(g.netWorth, maxDd, negCash);
}

String _summarize(String name, Strategy strat, List<int> seeds, int months) {
  final res = [for (final s in seeds) _run(strat, s, months)];
  final finals = res.map((r) => r.finalNetWorth).toList()..sort();
  final median = finals[finals.length ~/ 2];
  final avg = finals.reduce((a, b) => a + b) / finals.length;
  final dd = res.map((r) => r.maxDrawdown).reduce((a, b) => a + b) / res.length;
  final neg = res.any((r) => r.wentNegativeCash);
  return '  $name\n'
      '      median ${_money(median)} · avg ${_money(avg)}'
      '  (worst ${_money(finals.first)}, best ${_money(finals.last)})\n'
      '      max drawdown ${(dd * 100).toStringAsFixed(0)}%'
      '${neg ? ' · ⚠ went cash-negative' : ''}';
}

// ---------------------------------------------------------------------------
// AGENT 1: TUNNEL — all-in on a single instrument.
// ---------------------------------------------------------------------------

Strategy _tunnel(String id) => (g) {
      _takeBestJob(g);
      final investable = g.cash - g.dailyExpenses * 3; // keep 3 months buffer
      final def = Catalog.assetById(id);
      if (investable > 1 && investable >= def.minInvestment) {
        g.buy(def, investable);
      }
    };

// ---------------------------------------------------------------------------
// AGENT 2: MIXED — diversified, de-risks into insured cash in bad climates.
// ---------------------------------------------------------------------------

void mixed(GameController g) {
  _takeBestJob(g);
  final investable = g.cash - g.dailyExpenses * 3;
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

void main() {
  const years = 25;
  final months = years * Catalog.stepsPerYear;
  const seeds = [1, 2, 3, 7, 42];

  test('TUNNEL + MIXED agents: $years-year scoreboard', () {
    final out = StringBuffer()
      ..writeln('')
      ..writeln('============== WealthQuest agent scoreboard ==============')
      ..writeln('Start: 18 yrs old, ${_money(Catalog.startingCash)} · '
          'horizon: $years years · seeds: ${seeds.length}')
      ..writeln('')
      ..writeln('TUNNEL agents (all-in on one thing):');
    for (final id in const ['hysa', 'tbond', 'spx', 'mega', 'btq']) {
      out.writeln(_summarize(Catalog.assetById(id).name, _tunnel(id), seeds, months));
    }
    out
      ..writeln('')
      ..writeln('MIXED agent (diversified, climate-aware):')
      ..writeln(_summarize('Mixed', mixed, seeds, months))
      ..writeln('==========================================================');
    // ignore: avoid_print
    print(out.toString());

    // The mixed investor should build real wealth over a career.
    expect(_run(mixed, 42, months).finalNetWorth, greaterThan(50000),
        reason: 'a 25-year diversified investor should accumulate wealth');
  });

  // -------------------------------------------------------------------------
  // AGENT 3: AUDITOR — verifies the numbers every single month.
  // -------------------------------------------------------------------------
  test('AUDITOR agent: numbers stay internally consistent every month', () {
    const tol = 1.0; // a dollar of float slack on large sums
    var monthsChecked = 0;

    for (final seed in const [1, 7, 99]) {
      final g = GameController(seed: seed)..cash = 60000;
      // Open a broad starting position once; the auditor never trades again,
      // so the monthly cash-flow identity must hold exactly.
      for (final id in const ['hysa', 'spx', 'tbond', 'btq', 'divx']) {
        g.buy(Catalog.assetById(id), 6000);
      }
      g.buy(Catalog.assetById('cd1y'), 4000); // a locked position too

      for (var m = 0; m < 30 * Catalog.stepsPerYear; m++) {
        _takeBestJob(g); // changing jobs doesn't move cash
        final cashBefore = g.cash;
        final r = g.advanceDay();

        // (a) net worth == cash + sum of holding values
        var hv = 0.0;
        for (final h in g.holdings) {
          final v = g.valueOf(h);
          expect(v.isFinite && v >= -tol, isTrue,
              reason: 'seed $seed m$m: bad holding value $v');
          hv += v;
        }
        expect(g.netWorth, closeTo(g.cash + hv, tol),
            reason: 'seed $seed m$m: netWorth != cash + holdings');

        // (b) cash flow accounting: salary in, expenses out, dividends in
        expect(g.cash,
            closeTo(cashBefore + r.income - r.expenses + r.dividends, tol),
            reason: 'seed $seed m$m: cash-flow identity broken');

        // (c) bookkeeping sanity
        expect(g.netWorthHistory.last, closeTo(g.netWorth, tol),
            reason: 'seed $seed m$m: history out of sync');
        expect(g.netWorth.isFinite, isTrue);
        monthsChecked++;
      }
    }
    // ignore: avoid_print
    print('\nAUDITOR: $monthsChecked months checked across 3 seeds — '
        'all internally consistent ✓\n');
  });
}
