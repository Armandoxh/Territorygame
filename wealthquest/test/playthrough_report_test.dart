import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:wealthquest/data/catalog.dart';
import 'package:wealthquest/data/properties.dart';
import 'package:wealthquest/models/climate.dart';
import 'package:wealthquest/models/property.dart';
import 'package:wealthquest/state/game_controller.dart';

/// PLAYTHROUGH REPORT
///
/// Agents that play the *whole* loop end-to-end — including resolving every
/// crisis popup — so we get data-driven balance signals, not vibes. Four
/// archetypes, each run over many seeds for a full career:
///
///   1. LANDLORD-BRRRR  — real estate only: buy, rent, renovate, refinance,
///      recycle the cash. Exercises the new housing systems.
///   2. DEGENERATE      — gambling only: bets a chunk of the bankroll every
///      month. Should bleed out vs. the house vig.
///   3. BALANCED        — a human-like mix: a degree, a rental, diversified
///      funds, the occasional small bet.
///   4. CHAOS           — a messy, edge-case player: over-leverages, overdrafts,
///      panic-sells, renovates with no cash, refinances underwater homes,
///      enrolls at random. Smoke-tests that nothing in the loop (or the popups)
///      throws or goes non-finite.
///
/// It also A/B-measures the LIFE-EVENT DRAG: every agent is run with the crisis
/// stream ON and OFF (same seeds) so we can quote, in dollars, how much the
/// popups actually cost — the honest answer to "are life events too much?".
///
/// Reports print to stdout (visible in CI logs).

typedef Agent = void Function(GameController g, Random pick);

String _money(double v) {
  final s = v.abs().toStringAsFixed(0).replaceAllMapped(
        RegExp(r'\B(?=(\d{3})+(?!\d))'),
        (m) => ',',
      );
  return '${v < 0 ? '-' : ''}\$$s';
}

String _pct(double f) => '${(f * 100).toStringAsFixed(1)}%';

void _bestJob(GameController g) {
  final jobs = g.availableJobs;
  if (jobs.isNotEmpty && jobs.last.id != g.job.id) g.takeJob(jobs.last);
}

// ---------------------------------------------------------------------------
// Per-run + aggregate stats
// ---------------------------------------------------------------------------

class _Stat {
  final double finalNW;
  final double maxDd;
  final double crisisImpact; // summed immediate net-worth delta from popups
  final bool wentNeg;
  final bool bankrupt;
  final int crises;
  _Stat(this.finalNW, this.maxDd, this.crisisImpact, this.wentNeg,
      this.bankrupt, this.crises);
}

class _Agg {
  final double median, avg, worst, best, dd, crisesPerYear, crisisImpactMed;
  final double negRate, bankruptRate;
  _Agg(this.median, this.avg, this.worst, this.best, this.dd,
      this.crisesPerYear, this.crisisImpactMed, this.negRate, this.bankruptRate);
}

_Stat _play(Agent agent, int seed, int months,
    {required bool crises, required bool randomChoices}) {
  final g = GameController(seed: seed)..crisesEnabled = crises;
  final pick = Random(seed * 7919 + 13);
  var peak = g.netWorth, maxDd = 0.0, crisisImpact = 0.0;
  var wentNeg = false;
  var nCrises = 0;
  for (var m = 0; m < months; m++) {
    agent(g, pick);
    g.advanceDay();
    // Clear the popup the way a player must before the next month.
    if (g.pendingCrisis != null) {
      final before = g.netWorth;
      final choices = g.pendingCrisis!.choices;
      final c = randomChoices
          ? choices[pick.nextInt(choices.length)]
          : choices.first;
      g.resolveCrisis(c);
      crisisImpact += g.netWorth - before;
      nCrises++;
    }
    final nw = g.netWorth;
    expect(nw.isFinite && g.cash.isFinite, isTrue,
        reason: 'seed $seed month $m: non-finite (cash ${g.cash}, nw $nw)');
    if (nw > peak) peak = nw;
    if (peak > 0) maxDd = max(maxDd, ((peak - nw) / peak).clamp(0.0, 1.0));
    if (g.cash < -1) wentNeg = true;
  }
  return _Stat(g.netWorth, maxDd, crisisImpact, wentNeg, g.netWorth < -1000,
      nCrises);
}

_Agg _runAll(Agent agent, List<int> seeds, int months,
    {required bool crises, bool randomChoices = false}) {
  final stats = [
    for (final s in seeds)
      _play(agent, s, months, crises: crises, randomChoices: randomChoices),
  ];
  double med(List<double> xs) => (xs..sort())[xs.length ~/ 2];
  final finals = [for (final s in stats) s.finalNW];
  final years = months / Catalog.stepsPerYear;
  return _Agg(
    med([...finals]),
    finals.reduce((a, b) => a + b) / finals.length,
    finals.reduce((a, b) => a < b ? a : b),
    finals.reduce((a, b) => a > b ? a : b),
    stats.map((s) => s.maxDd).reduce((a, b) => a + b) / stats.length,
    stats.map((s) => s.crises).reduce((a, b) => a + b) / stats.length / years,
    med([for (final s in stats) s.crisisImpact]),
    stats.where((s) => s.wentNeg).length / stats.length,
    stats.where((s) => s.bankrupt).length / stats.length,
  );
}

// ---------------------------------------------------------------------------
// AGENTS
// ---------------------------------------------------------------------------

PropertyDef? _bestAffordable(GameController g, double downFrac) {
  PropertyDef? best;
  for (final d in Properties.ladder) {
    final down = g.propertyPriceOf(d.id) * downFrac;
    if (down + g.dailyExpenses * 6 <= g.cash) best = d;
  }
  return best;
}

/// 1) LANDLORD-BRRRR: real estate only — buy, rent, renovate, refinance, repeat.
void _landlord(GameController g, Random pick) {
  _bestJob(g);
  for (final h in g.properties) {
    if (!h.rentedOut) g.toggleRental(h);
  }
  // Pull equity out of any home that has it (the "R" in BRRRR).
  for (final h in g.properties) {
    if (g.refinanceCashOut(h) > 5000) g.refinance(h);
  }
  // Force value up on one home a month when there's spare cash to deploy.
  if (g.cash > 25000 && g.properties.isNotEmpty) {
    final h = g.properties[pick.nextInt(g.properties.length)];
    final budget = (g.cash - 15000) * 0.5;
    if (budget > 3000) g.renovate(h, budget.clamp(0.0, g.cash - 5000));
  }
  // Buy the priciest home a 20% down payment + 6-month buffer can cover.
  final pickHome = _bestAffordable(g, 0.20);
  if (pickHome != null) {
    g.buyProperty(pickHome, Properties.mortgages.first, 0.20);
  }
}

/// 2) DEGENERATE: gambling only — stake a quarter of the bankroll each month.
void _degenerate(GameController g, Random pick) {
  _bestJob(g);
  if (g.sportsSlate.isEmpty) return;
  final bankroll = g.cash - g.dailyExpenses * 2;
  if (bankroll < 50) return;
  final e = g.sportsSlate[pick.nextInt(g.sportsSlate.length)];
  g.placeBet(e, pick.nextBool(), bankroll * 0.25);
}

/// 3) BALANCED: a degree, a rental, diversified funds, the rare small bet.
void _balanced(GameController g, Random pick) {
  if (g.eduLevel < 2 && !g.isStudying && g.day < 48) {
    final bach = Catalog.degrees.firstWhere((d) => d.level == 2);
    g.enroll(bach);
  }
  _bestJob(g);
  for (final h in g.properties) {
    if (!h.rentedOut) g.toggleRental(h);
  }
  if (g.isStudying) return; // cash is tight in school
  final investable = g.cash - g.dailyExpenses * 3;
  if (investable < 50) return;
  // A small recreational bet roughly once a year.
  if (pick.nextInt(12) == 0 && g.sportsSlate.isNotEmpty) {
    g.placeBet(g.sportsSlate.first, pick.nextBool(), investable * 0.02);
  }
  // One rental, once it's comfortably affordable.
  if (g.properties.isEmpty) {
    final home = _bestAffordable(g, 0.20);
    if (home != null) {
      g.buyProperty(home, Properties.mortgages.first, 0.20);
      return;
    }
  }
  final defensive =
      g.regime == MarketRegime.downturn || g.regime == MarketRegime.crash;
  final plan = defensive
      ? <(String, double)>[('hysa', 1.0)]
      : <(String, double)>[
          ('spx', 0.55),
          ('bndx', 0.15),
          ('btq', 0.10),
          ('hysa', 0.20),
        ];
  for (final (id, w) in plan) {
    final def = Catalog.assetById(id);
    final amt = investable * w;
    if (amt > 1 && amt >= def.minInvestment) g.buy(def, amt);
  }
}

/// 4) CHAOS: a messy, impulsive, edge-case player. Not trying to win — trying
/// to break things. The runner's finite-checks are the real assertion here.
void _chaos(GameController g, Random pick) {
  _bestJob(g);
  switch (pick.nextInt(8)) {
    case 0: // shove most of the bankroll on one game
      if (g.sportsSlate.isNotEmpty) {
        g.placeBet(g.sportsSlate.first, pick.nextBool(), g.cash * 0.9);
      }
      break;
    case 1: // over-leverage into the priciest home you can, 5% down
      for (final d in Properties.ladder.reversed) {
        if (g.buyProperty(d, Properties.mortgages.first, 0.05) == null) break;
      }
      break;
    case 2: // renovate with more than you have (should fail gracefully)
      if (g.properties.isNotEmpty) {
        g.renovate(g.properties[pick.nextInt(g.properties.length)],
            g.cash * 1.5);
      }
      break;
    case 3: // refinance everything, even underwater homes
      for (final h in g.properties) {
        g.refinance(h);
      }
      break;
    case 4: // panic-sell a holding or a home
      if (g.holdings.isNotEmpty) {
        final h = g.holdings.first;
        g.sell(h, h.balance, max: true);
      } else if (g.properties.isNotEmpty) {
        g.sellProperty(g.properties.first);
      }
      break;
    case 5: // enroll in a random degree mid-life
      if (!g.isStudying && g.eduLevel < 3) {
        g.enroll(Catalog.degrees[pick.nextInt(Catalog.degrees.length)]);
      }
      break;
    case 6: // all-in on crypto
      final c = Catalog.assetById('btq');
      if (g.cash > c.minInvestment) g.buy(c, g.cash * 0.8);
      break;
    case 7: // do nothing (let bills/overdraft bite)
      break;
  }
}

// ---------------------------------------------------------------------------
// REPORT
// ---------------------------------------------------------------------------

void main() {
  const years = 25;
  final months = years * Catalog.stepsPerYear;
  const seeds = [
    1, 2, 3, 5, 8, 13, 21, 34, 42, 55, 77, 99, 123, 256, 512, 1024
  ];

  test('PLAYTHROUGH REPORT: 4 archetypes + life-event drag ($years yrs)', () {
    final agents = <String, (Agent, bool)>{
      'LANDLORD-BRRRR (real estate only)': (_landlord, false),
      'DEGENERATE (gambling only)': (_degenerate, false),
      'BALANCED (mix + degree + rental)': (_balanced, false),
      'CHAOS (edge-case player)': (_chaos, true),
    };

    final out = StringBuffer()
      ..writeln('\n=============== WealthQuest PLAYTHROUGH REPORT ===============')
      ..writeln('Start age ${Catalog.startAge} · ${_money(Catalog.startingCash)} '
          '· $years-year careers · ${seeds.length} seeds each')
      ..writeln('Every popup is resolved each month, like a real player.\n')
      ..writeln('AGENT                                  median        worst   '
          '   best   maxDD  cash<0  bankrupt');

    final onResults = <String, _Agg>{};
    final offResults = <String, _Agg>{};
    agents.forEach((name, spec) {
      final (agent, rnd) = spec;
      final on = _runAll(agent, seeds, months, crises: true, randomChoices: rnd);
      final off =
          _runAll(agent, seeds, months, crises: false, randomChoices: rnd);
      onResults[name] = on;
      offResults[name] = off;
      out.writeln('  ${name.padRight(38)}'
          '${_money(on.median).padLeft(11)} '
          '${_money(on.worst).padLeft(11)} '
          '${_money(on.best).padLeft(11)}  '
          '${_pct(on.dd).padLeft(5)}  '
          '${_pct(on.negRate).padLeft(5)}  '
          '${_pct(on.bankruptRate).padLeft(6)}');
    });

    // -- Life-event (crisis popup) analysis -----------------------------------
    out
      ..writeln('\n--- LIFE EVENTS (crisis popups) ---')
      ..writeln('Design cadence: ${_pct(GameController.crisisChance)}/mo '
          '≈ ${(GameController.crisisChance * 12).toStringAsFixed(1)} popups/yr.\n')
      ..writeln('AGENT                                  popups/yr  median total '
          'hit   drag vs no-events');
    agents.forEach((name, _) {
      final on = onResults[name]!;
      final off = offResults[name]!;
      final drag = off.median == 0
          ? 0.0
          : (off.median - on.median) / off.median.abs();
      out.writeln('  ${name.padRight(38)}'
          '${on.crisesPerYear.toStringAsFixed(2).padLeft(8)}  '
          '${_money(on.crisisImpactMed).padLeft(14)}   '
          '${_money(on.median).padLeft(10)} vs ${_money(off.median).padLeft(10)}'
          '  (${_pct(drag)})');
    });
    out
      ..writeln('\n  "median total hit" = summed immediate net-worth swing from')
      ..writeln('  every popup across a 25-yr run (includes positive outcomes).')
      ..writeln('  "drag" = how much lower the median ends WITH popups vs WITHOUT.')
      ..writeln('=============================================================\n');

    // ignore: avoid_print
    print(out.toString());

    // Robust invariants (not flaky): the loop and popups stay finite, a
    // balanced 25-year player builds real wealth, and pure gambling loses to it.
    for (final r in [...onResults.values, ...offResults.values]) {
      expect(r.median.isFinite && r.avg.isFinite, isTrue);
    }
    final balanced = onResults['BALANCED (mix + degree + rental)']!;
    final degen = onResults['DEGENERATE (gambling only)']!;
    expect(balanced.median, greaterThan(0),
        reason: 'a 25-year balanced player should end ahead');
    expect(degen.median, lessThan(balanced.median),
        reason: 'gambling into the vig should trail a balanced strategy');
  });
}
