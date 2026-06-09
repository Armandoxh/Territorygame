import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:wealthquest/data/catalog.dart';
import 'package:wealthquest/data/properties.dart';
import 'package:wealthquest/engine/sports_engine.dart';
import 'package:wealthquest/models/property.dart';
import 'package:wealthquest/state/game_controller.dart';

/// BALANCE HARNESS
///
/// We've stacked a lot of interacting systems (rent, student loans, degrees,
/// overdraft, betting). This file is how we keep them honest as the game grows:
///
///   1. BALANCE REPORT — closed-form economics of every subsystem, flagged
///      OK / WARN / CRITICAL against target bands. Reads the LIVE constants so
///      it can't drift. This is what names "rent pays too much" automatically.
///   2. LANDLORD + SCHOLAR agents — play 12 years using the new systems so the
///      net-worth scoreboard reflects them.
///   3. LANDLORD-AUDITOR — verifies the full cash-flow identity including
///      rent - mortgage - overdraft, which nothing else checks.
///
/// Reports print to stdout (visible in CI logs).

String _money(double v) => '\$${v.toStringAsFixed(0).replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (m) => ',',
    )}';

String _pct(double f) => '${(f * 100).toStringAsFixed(1)}%';

/// A flagged finding. CRITICAL fails CI; WARN is informational.
class _Flag {
  final String level; // 'OK' | 'WARN' | 'CRIT'
  final String msg;
  _Flag(this.level, this.msg);
}

void main() {
  // -------------------------------------------------------------------------
  // 1) BALANCE REPORT — closed-form subsystem economics with target bands.
  // -------------------------------------------------------------------------
  test('BALANCE REPORT: subsystem economics vs target bands', () {
    final out = StringBuffer();
    final flags = <_Flag>[];
    out.writeln('\n================= WealthQuest BALANCE REPORT =================');

    // ---- Rentals: return on equity for a leveraged, rented property --------
    out.writeln('\nRENTALS  (20% down, 30-yr fixed, at each type\'s own occupancy)');
    out.writeln('  tier                 rent/pmt   net cash/mo   ROE/yr');
    final m30 = Properties.mortgages.firstWhere((m) => m.id == 'fixed30');
    for (final d in Properties.ladder) {
      final value = d.basePrice;
      final loan = value * 0.80;
      final equity = value * 0.20;
      final payment = mortgageMonthlyPayment(loan, m30.annualRate, m30.termMonths);
      // Per-type economics: land earns no rent (pure appreciation play).
      final grossRent = d.rentable ? value * d.rentYield : 0.0;
      final expRent = grossRent * d.occupancy;
      final apprMo = d.monthlyAppreciation * value;
      final netCash = expRent - payment; // cash flow before appreciation
      final roe = (netCash + apprMo) * 12 / equity; // cash + appreciation on equity
      final ratio = grossRent / payment;
      out.writeln('  ${d.name.padRight(20)} '
          '${ratio.toStringAsFixed(2).padLeft(5)}    '
          '${_money(netCash).padLeft(8)}/mo   ${_pct(roe).padLeft(6)}');
      // Only flag rentable types: a rental shouldn't risk-free dominate equities.
      if (d.rentable && roe > 0.35) {
        flags.add(_Flag('CRIT', '${d.name}: rental ROE ${_pct(roe)} is a near risk-free dominator (>35%).'));
      }
    }
    out.writeln('  target: ROE roughly in line with equities (~7-15%/yr); '
        'commercial/niche run hotter as a yield-vs-risk tradeoff.');

    // ---- Degrees: payback speed + survivability during school --------------
    out.writeln('\nDEGREES  (tuition borrowed; part-time = half pay while enrolled)');
    out.writeln('  degree         pay bump   loan+int    payback   cash/mo in school');
    double bestPayAt(int level) {
      // The immediate pay a degree unlocks = the best ENTRY rung among
      // non-professional, non-prestige tracks at or below this education level.
      // (Tracks then ramp up over years from there.)
      var best = 0.0;
      for (final t in Catalog.careerTracks) {
        if (t.unlockLevel == 0 &&
            t.requiredDegreeId == null &&
            t.minEduLevel <= level &&
            t.entry.pay > best) {
          best = t.entry.pay;
        }
      }
      return best;
    }

    for (final deg in Catalog.degrees) {
      final priorPay = bestPayAt(deg.level - 1);
      final newPay = bestPayAt(deg.level);
      final bump = newPay - priorPay;
      final loanAfter = deg.tuition * pow(1 + Catalog.studentLoanRate, deg.years);
      final payback = bump > 0 ? loanAfter / bump : double.infinity;
      final ptPay = GameController.partTimePayFraction * priorPay;
      final schoolCash = ptPay - Catalog.monthlyExpenses(20, ptPay);
      out.writeln('  ${deg.name.padRight(14)} '
          '${_money(bump).padLeft(7)}/mo  ${_money(loanAfter.toDouble()).padLeft(8)}  '
          '${payback.toStringAsFixed(0).padLeft(4)} mo   ${_money(schoolCash).padLeft(8)}/mo');
      if (payback.isFinite && payback < 18) {
        flags.add(_Flag('WARN', '${deg.name}: loan recouped in ${payback.toStringAsFixed(0)} mo of the pay bump — almost no long-term tradeoff (too cheap).'));
      }
      if (schoolCash < -150) {
        flags.add(_Flag('WARN', '${deg.name}: during school you net ${_money(schoolCash)}/mo (half pay vs FULL expenses) — unaffordable without prior savings.'));
      }
    }
    out.writeln('  target: payback a meaningful share of a career; school cash-flow survivable from modest savings.');

    // ---- Job ladder: monthly surplus / savings rate ------------------------
    out.writeln('\nJOB LADDER  (surplus = pay - living expenses)');
    for (final j in Catalog.jobs.where((j) => j.unlockLevel == 0)) {
      final exp = Catalog.monthlyExpenses(25, j.pay);
      final surplus = j.pay - exp;
      out.writeln('  ${j.title.padRight(20)} ${_money(j.pay).padLeft(7)}/mo  '
          '- exp ${_money(exp).padLeft(6)}  = ${_money(surplus).padLeft(7)}  '
          '(${_pct(surplus / j.pay)} saved)');
      if (surplus < 0) {
        flags.add(_Flag('WARN', '${j.title}: negative surplus — can\'t save at all on this job.'));
      }
    }

    // ---- Betting: confirm the house edge is a real, negative-EV drain ------
    final g = GameController(seed: 1);
    var worstEdge = 0.0;
    for (final e in g.sportsSlate) {
      final evHome = e.homeProb * e.homeDecimal - 1;
      final evAway = (1 - e.homeProb) * e.awayDecimal - 1;
      worstEdge = min(worstEdge, min(evHome, evAway));
      if (evHome > -0.001 || evAway > -0.001) {
        flags.add(_Flag('CRIT', 'A sports bet is non-negative EV — the book has no edge.'));
      }
    }
    out.writeln('\nBETTING  house vig ${_pct(SportsEngine.vig)} · every line is negative-EV '
        '(worst-case player edge ${_pct(worstEdge)}). ✓');

    // ---- Overdraft schedule -----------------------------------------------
    out.writeln('\nOVERDRAFT  ${_pct(GameController.overdraftFeeRate)}/mo for '
        '${GameController.overdraftGraceMonths} months, then a forced-liquidation margin call.');

    // ---- Summary -----------------------------------------------------------
    out.writeln('\n--- FLAGS ---');
    final crits = flags.where((f) => f.level == 'CRIT').toList();
    final warns = flags.where((f) => f.level == 'WARN').toList();
    if (flags.isEmpty) {
      out.writeln('  none — every subsystem is inside its target band. ✓');
    } else {
      for (final f in crits) {
        out.writeln('  ⛔ CRITICAL  ${f.msg}');
      }
      for (final f in warns) {
        out.writeln('  ⚠ WARN      ${f.msg}');
      }
    }
    out.writeln('==============================================================\n');
    // ignore: avoid_print
    print(out.toString());

    // The report never spuriously fails on WARN (those are tuning signals).
    // It DOES fail on CRITICAL — a genuinely broken invariant.
    expect(crits, isEmpty,
        reason: 'CRITICAL balance violations:\n${crits.map((f) => f.msg).join('\n')}');
  });

  // -------------------------------------------------------------------------
  // 2) LANDLORD + SCHOLAR agents — exercise the new systems over 12 years.
  // -------------------------------------------------------------------------
  test('AGENTS: landlord + scholar 12-year outcomes', () {
    const months = 12 * 12;
    const seeds = [1, 2, 3, 5, 8, 13, 21, 42, 99, 123];

    ({double median, double worst, double dd, int neg}) runMany(
        void Function(GameController) strat) {
      final finals = <double>[];
      var ddSum = 0.0;
      var neg = 0;
      for (final s in seeds) {
        final g = GameController(seed: s);
        var peak = g.netWorth;
        var maxDd = 0.0;
        var wentNeg = false;
        for (var m = 0; m < months; m++) {
          strat(g);
          g.advanceDay();
          final nw = g.netWorth;
          expect(nw.isFinite && g.cash.isFinite, isTrue,
              reason: 'seed $s month $m: non-finite');
          if (nw > peak) peak = nw;
          // Clamp so an early dip below $0 (tiny/negative peak) can't blow the
          // ratio up past 100% — "went cash-negative" already tells that story.
          if (peak > 0) maxDd = max(maxDd, ((peak - nw) / peak).clamp(0.0, 1.0));
          if (g.cash < -1) wentNeg = true;
        }
        finals.add(g.netWorth);
        ddSum += maxDd;
        if (wentNeg) neg++;
      }
      finals.sort();
      return (
        median: finals[finals.length ~/ 2],
        worst: finals.first,
        dd: ddSum / seeds.length,
        neg: neg,
      );
    }

    // LANDLORD: save, buy the priciest property a 20% down payment can afford,
    // rent it out, repeat. Tests whether rentals dominate.
    void landlord(GameController g) {
      final jobs = g.availableJobs;
      if (jobs.isNotEmpty && jobs.last.id != g.job.id) g.takeJob(jobs.last);
      for (final h in g.properties) {
        if (!h.rentedOut) g.toggleRental(h);
      }
      // Buy if we can cover 20% down + keep a 6-month buffer.
      PropertyDef? pick;
      for (final d in Properties.ladder) {
        final down = g.propertyPriceOf(d.id) * 0.20;
        if (down + g.dailyExpenses * 6 <= g.cash) pick = d;
      }
      if (pick != null) {
        g.buyProperty(pick, Properties.mortgages.first, 0.20);
      }
    }

    // SCHOLAR: enroll in a bachelor's immediately, ride out school, then take
    // the best job and invest the surplus into the S&P. Tests survivability +
    // payoff of going to college from a standing start.
    void scholar(GameController g) {
      if (g.eduLevel < 2 && !g.isStudying) {
        final bach = Catalog.degrees.firstWhere((d) => d.level == 2);
        g.enroll(bach);
      }
      final jobs = g.availableJobs;
      if (jobs.isNotEmpty && jobs.last.id != g.job.id) g.takeJob(jobs.last);
      if (!g.isStudying) {
        final investable = g.cash - g.dailyExpenses * 3;
        final spx = Catalog.assetById('spx');
        if (investable >= spx.minInvestment) g.buy(spx, investable);
      }
    }

    final l = runMany(landlord);
    final s = runMany(scholar);
    final out = StringBuffer()
      ..writeln('\n=========== AGENTS: 12-year outcomes (10 seeds) ===========')
      ..writeln('LANDLORD (leverage into rentals):')
      ..writeln('   median ${_money(l.median)} · worst ${_money(l.worst)} · '
          'avg drawdown ${_pct(l.dd)} · ${l.neg}/${seeds.length} went cash-negative')
      ..writeln('SCHOLAR (bachelor\'s from scratch, then invest):')
      ..writeln('   median ${_money(s.median)} · worst ${_money(s.worst)} · '
          'avg drawdown ${_pct(s.dd)} · ${s.neg}/${seeds.length} went cash-negative')
      ..writeln('===========================================================\n');
    // ignore: avoid_print
    print(out.toString());

    expect(l.median.isFinite && s.median.isFinite, isTrue);
  });

  // -------------------------------------------------------------------------
  // 3) LANDLORD-AUDITOR — verify rent/mortgage/overdraft cash flows exactly.
  // -------------------------------------------------------------------------
  test('LANDLORD-AUDITOR: full cash-flow identity holds with rent & mortgage', () {
    const tol = 1.0;
    var monthsChecked = 0;
    for (final seed in const [1, 7, 99]) {
      final g = GameController(seed: seed)..cash = 200000;
      // Buy a rental and list it; never trade again so the identity is exact.
      g.buyProperty(Properties.ladder.first, Properties.mortgages.first, 0.20);
      for (final h in g.properties) {
        g.toggleRental(h);
      }
      for (var m = 0; m < 20 * 12; m++) {
        final cashBefore = g.cash;
        final r = g.advanceDay();
        // cash moves exactly by: salary - tax - expenses + dividends + rent
        //                        - mortgage - overdraft fee.
        final expected = cashBefore +
            r.income -
            r.tax -
            r.expenses +
            r.dividends +
            r.rent -
            r.mortgage -
            r.overdraftFee;
        expect(g.cash, closeTo(expected, tol),
            reason: 'seed $seed m$m: cash-flow identity broke with rent/mortgage');
        expect(g.netWorth.isFinite, isTrue);
        monthsChecked++;
      }
    }
    // ignore: avoid_print
    print('\nLANDLORD-AUDITOR: $monthsChecked months verified incl. rent + '
        'mortgage + overdraft — all consistent ✓\n');
  });
}
