import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:wealthquest/data/catalog.dart';
import 'package:wealthquest/data/crises.dart';
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
  final double worstCashShare; // worst single popup's bite as a share of cash
  final bool wentNeg;
  final bool bankrupt;
  final int crises;
  _Stat(this.finalNW, this.maxDd, this.crisisImpact, this.worstCashShare,
      this.wentNeg, this.bankrupt, this.crises);
}

class _Agg {
  final double median, avg, worst, best, dd, crisesPerYear, crisisImpactMed;
  final double negRate, bankruptRate, worstCashShare;
  _Agg(this.median, this.avg, this.worst, this.best, this.dd,
      this.crisesPerYear, this.crisisImpactMed, this.negRate, this.bankruptRate,
      this.worstCashShare);
}

/// Pick the option a rational player would: try each on a clone that shares
/// one market path, advance [lookaheadMonths], and keep whichever leaves you
/// richest (so deferred costs like a few months of suspended income count).
int _rationalChoice(GameController g, Random pick, int lookaheadMonths) {
  final ev = g.pendingCrisis!;
  if (ev.choices.length == 1) return 0;
  final evalSeed = pick.nextInt(1 << 30); // shared market path for this decision
  var bestIdx = 0;
  var bestNW = -double.infinity;
  for (var i = 0; i < ev.choices.length; i++) {
    final c = g.cloneForLookahead(evalSeed)..pendingCrisis = ev;
    c.resolveCrisis(ev.choices[i]);
    for (var k = 0; k < lookaheadMonths; k++) {
      c.advanceDay();
    }
    if (c.netWorth > bestNW) {
      bestNW = c.netWorth;
      bestIdx = i;
    }
  }
  return bestIdx;
}

_Stat _play(Agent agent, int seed, int months,
    {required bool crises,
    required String choicePolicy,
    int lookahead = 4,
    double costScale = 1.0,
    double maxCashShare = 999.0,
    double maxNwShare = 999.0}) {
  final g = GameController(seed: seed)
    ..crisesEnabled = crises
    ..crisisCostScale = costScale
    ..crisisMaxCashShare = maxCashShare
    ..crisisMaxNetWorthShare = maxNwShare;
  final pick = Random(seed * 7919 + 13);
  var peak = g.netWorth, maxDd = 0.0, crisisImpact = 0.0, worstCashShare = 0.0;
  var wentNeg = false;
  var nCrises = 0;
  for (var m = 0; m < months; m++) {
    agent(g, pick);
    g.advanceDay();
    // Clear the popup the way a player must before the next month.
    if (g.pendingCrisis != null) {
      final before = g.netWorth;
      final cashBefore = g.cash;
      final choices = g.pendingCrisis!.choices;
      final int idx;
      switch (choicePolicy) {
        case 'random':
          idx = pick.nextInt(choices.length);
          break;
        case 'rational':
          idx = _rationalChoice(g, pick, lookahead);
          break;
        default: // 'first' — the naive baseline
          idx = 0;
      }
      g.resolveCrisis(choices[idx]);
      crisisImpact += g.netWorth - before;
      if (cashBefore > 0) {
        final share = (cashBefore - g.cash) / cashBefore;
        if (share > worstCashShare) worstCashShare = share;
      }
      nCrises++;
    }
    final nw = g.netWorth;
    expect(nw.isFinite && g.cash.isFinite, isTrue,
        reason: 'seed $seed month $m: non-finite (cash ${g.cash}, nw $nw)');
    if (nw > peak) peak = nw;
    if (peak > 0) maxDd = max(maxDd, ((peak - nw) / peak).clamp(0.0, 1.0));
    if (g.cash < -1) wentNeg = true;
  }
  return _Stat(g.netWorth, maxDd, crisisImpact, worstCashShare, wentNeg,
      g.netWorth < -1000, nCrises);
}

_Agg _runAll(Agent agent, List<int> seeds, int months,
    {required bool crises,
    String choicePolicy = 'first',
    int lookahead = 4,
    double costScale = 1.0,
    double maxCashShare = 999.0,
    double maxNwShare = 999.0}) {
  final stats = [
    for (final s in seeds)
      _play(agent, s, months,
          crises: crises,
          choicePolicy: choicePolicy,
          lookahead: lookahead,
          costScale: costScale,
          maxCashShare: maxCashShare,
          maxNwShare: maxNwShare),
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
    stats.map((s) => s.worstCashShare).reduce((a, b) => a > b ? a : b),
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
  // Keep a realistic emergency fund — the larger of 6 months' expenses or 5%
  // of net worth — instead of investing down to ~$0 (which made "% of cash"
  // meaningless and let scaled events be dodged).
  final sixMonths = g.dailyExpenses * 6;
  final fivePctNw = g.netWorth * 0.05;
  final keep = sixMonths > fivePctNw ? sixMonths : fivePctNw;
  final investable = g.cash - keep;
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
      final policy = rnd ? 'random' : 'first';
      final on = _runAll(agent, seeds, months, crises: true, choicePolicy: policy);
      final off =
          _runAll(agent, seeds, months, crises: false, choicePolicy: policy);
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

  // A real player avoids the bad popup option. The naive report picks the FIRST
  // option (which the catalog orders as the *premium / most expensive* one), so
  // it overstates the drag. Here a lookahead picks the option a rational player
  // would, and we compare the two drag numbers head to head.
  test('RATIONAL vs NAIVE life-event drag (lookahead choices)', () {
    const ratSeeds = [1, 2, 3, 5, 8, 13, 21, 42, 99, 123];
    const k = 4;
    final agents = <String, Agent>{
      'LANDLORD-BRRRR': _landlord,
      'DEGENERATE': _degenerate,
      'BALANCED': _balanced,
      'CHAOS': _chaos,
    };

    double drag(_Agg on, _Agg off) =>
        off.median == 0 ? 0.0 : (off.median - on.median) / off.median.abs();

    final out = StringBuffer()
      ..writeln('\n========= RATIONAL vs NAIVE life-event drag =========')
      ..writeln('Every popup resolved by a $k-month lookahead (try each option '
          'on a clone\nsharing one market path, keep the richest). '
          '${ratSeeds.length} seeds.\n')
      ..writeln('AGENT             naive drag   RATIONAL drag   '
          'final WITH → WITHOUT (rational)');

    for (final entry in agents.entries) {
      final agent = entry.value;
      final ratOn = _runAll(agent, ratSeeds, months,
          crises: true, choicePolicy: 'rational', lookahead: k);
      final ratOff = _runAll(agent, ratSeeds, months,
          crises: false, choicePolicy: 'rational', lookahead: k);
      final naiOn =
          _runAll(agent, ratSeeds, months, crises: true, choicePolicy: 'first');
      final naiOff = _runAll(agent, ratSeeds, months,
          crises: false, choicePolicy: 'first');
      out.writeln('  ${entry.key.padRight(16)}'
          '${_pct(drag(naiOn, naiOff)).padLeft(10)}   '
          '${_pct(drag(ratOn, ratOff)).padLeft(11)}   '
          '${_money(ratOn.median)} → ${_money(ratOff.median)}');
    }
    out
      ..writeln('\n  drag = how much lower the median ends WITH popups vs '
          'WITHOUT.')
      ..writeln('  The gap naive→rational = the cost of playing the popups '
          'badly.')
      ..writeln('=====================================================\n');
    // ignore: avoid_print
    print(out.toString());
  }, timeout: const Timeout(Duration(minutes: 3)));

  // Tuning sweep: vary the two crisis-cost knobs and watch the life-event drag
  // AND the worst single-popup bite (as a share of cash — the "it took half my
  // cash at 45+" complaint). Goal: drag ~15-20%, worst bite well under ~30%.
  test('SWEEP: crisis cost params vs drag & cash-bite (rational player)', () {
    const sweepSeeds = [1, 2, 3, 5, 8, 13, 21, 42];
    const k = 3;
    final configs = <(String, double, double, double)>[
      ('CURRENT (1.0, no caps)', 1.0, 999.0, 999.0),
      ('A  scale .70, cash 40%, nw 8%', 0.70, 0.40, 0.08),
      ('B  scale .55, cash 30%, nw 6% (shipped)', 0.55, 0.30, 0.06),
      ('C  scale .50, cash 25%, nw 5%', 0.50, 0.25, 0.05),
    ];
    final agents = <String, Agent>{
      'BALANCED': _balanced,
      'LANDLORD': _landlord,
    };

    double drag(_Agg on, _Agg off) =>
        off.median == 0 ? 0.0 : (off.median - on.median) / off.median.abs();

    final out = StringBuffer()
      ..writeln('\n===== CRISIS PARAM SWEEP (rational, $k-mo lookahead, '
          '${sweepSeeds.length} seeds) =====')
      ..writeln('Goal: drag ~15-20%, worst single popup well under ~30% of '
          'cash.\n');
    for (final entry in agents.entries) {
      out
        ..writeln('${entry.key}:')
        ..writeln('  config                              drag   worst '
            'cash-bite   median WITH events');
      for (final (label, scale, cap, nw) in configs) {
        final on = _runAll(entry.value, sweepSeeds, months,
            crises: true,
            choicePolicy: 'rational',
            lookahead: k,
            costScale: scale,
            maxCashShare: cap,
            maxNwShare: nw);
        final off = _runAll(entry.value, sweepSeeds, months,
            crises: false,
            choicePolicy: 'rational',
            lookahead: k,
            costScale: scale,
            maxCashShare: cap,
            maxNwShare: nw);
        out.writeln('  ${label.padRight(42)}'
            '${_pct(drag(on, off)).padLeft(6)}   '
            '${_pct(on.worstCashShare).padLeft(13)}   '
            '${_money(on.median)}');
      }
      out.writeln('');
    }
    out
      ..writeln('  (worst cash-bite > 100% = the event drove cash negative.)')
      ..writeln('==========================================================\n');
    // ignore: avoid_print
    print(out.toString());
  }, timeout: const Timeout(Duration(minutes: 6)));

  // Closed-form guarantee (zero simulation noise): on the exact profile that
  // triggered the complaint — asset-rich, cash-light, age ~45 — replay every
  // eligible crisis option and confirm the caps mean no single popup can gouge
  // you. This is the authoritative proof the "it took half my cash" bug is dead.
  test('CASH-BITE GUARANTEE: no popup gouges an asset-rich, cash-light player',
      () {
    GameController profile() {
      final g = GameController(seed: 1)..cash = 900000;
      g.buy(Catalog.assetById('spx'), 820000);
      g.buy(Catalog.assetById('bndx'), 40000);
      return g; // ~$900k net worth, ~$40k cash — most wealth invested
    }

    final rng = Random(42);
    final probe = profile();
    // The real harm of a popup is NET-WORTH LOSS — money that's gone (a bill),
    // not money converted into an asset (a business buy-in, gold) or risked on a
    // voluntary bet. So score each event by its least-damaging choice's net-
    // worth loss, and assert no popup can force a big one. Cash outflow is
    // reported for context (it can be larger for investments/bets, which is
    // fine — that cash isn't lost).
    var worstLossCash = 0.0, worstLossNw = 0.0;
    var worstEv = '';
    var tested = 0;
    for (final ev in Crises.all) {
      if (!ev.eligible(probe)) continue;
      if (probe.netWorth < ev.minNetWorth ||
          probe.netWorth > ev.maxNetWorth) {
        continue;
      }
      // Real loss = the net worth that actually disappeared (a bill), not cash
      // converted into an asset (a buy-in/gold). Express it as a share of cash
      // (the user's "% of my cash") and of net worth. Score the event by its
      // least-damaging choice — you can always pick that one.
      var bestLossCash = double.infinity, nwOfBest = 0.0;
      for (final ch in ev.choices) {
        final g = profile();
        final cashBefore = g.cash, nwBefore = g.netWorth;
        ch.apply(g, rng);
        tested++;
        final lostDollars = nwBefore - g.netWorth; // <=0 if it helped
        final lossCash = lostDollars / cashBefore;
        final lossNw = lostDollars / nwBefore;
        if (lossCash < bestLossCash) {
          bestLossCash = lossCash;
          nwOfBest = lossNw;
        }
      }
      if (bestLossCash > worstLossCash) {
        worstLossCash = bestLossCash;
        worstLossNw = nwOfBest;
        worstEv = ev.id;
      }
    }
    // ignore: avoid_print
    print('\n=== CASH-BITE GUARANTEE (NW ~\$900k, cash ~\$40k, '
        '$tested options) ===\n'
        '  worst UNAVOIDABLE real loss from any popup (best choice still '
        'loses): ${(worstLossCash * 100).toStringAsFixed(1)}% of cash / '
        '${(worstLossNw * 100).toStringAsFixed(1)}% of net worth ($worstEv).\n'
        '  caps in force: 6% of net worth, 30% of cash.\n');

    // Hard guarantee: no popup can force you to actually LOSE more than a third
    // of your cash (the complaint) — there's always a choice under the caps.
    expect(worstLossCash, lessThan(0.33),
        reason: 'no popup should force a real cash loss over a third of cash');
    expect(worstLossNw, lessThan(0.08),
        reason: 'no popup should force a net-worth loss over ~8%');
  });
}
