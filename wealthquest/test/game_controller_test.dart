import 'package:flutter_test/flutter_test.dart';
import 'package:wealthquest/data/catalog.dart';
import 'package:wealthquest/data/crises.dart';
import 'package:wealthquest/data/properties.dart';
import 'package:wealthquest/models/asset.dart';
import 'package:wealthquest/models/bet.dart';
import 'package:wealthquest/models/property.dart';
import 'package:wealthquest/state/game_controller.dart';

void main() {
  group('GameController core loop', () {
    test('starts at 18 with seed cash and no holdings', () {
      final g = GameController(seed: 1);
      expect(g.ageYears, 18);
      expect(g.day, 0);
      expect(g.cash, Catalog.startingCash);
      expect(g.holdings, isEmpty);
      expect(g.netWorth, Catalog.startingCash);
    });

    test('advancing a day pays salary minus expenses', () {
      final g = GameController(seed: 1);
      final before = g.cash;
      final r = g.advanceDay();
      expect(g.day, 1);
      // No investments, so cash change == salary - expenses exactly.
      expect(g.cash, closeTo(before + r.income - r.expenses, 1e-6));
      expect(r.income, g.job.pay);
    });

    test('age increments after one year of months', () {
      final g = GameController(seed: 1);
      for (var i = 0; i < Catalog.stepsPerYear; i++) {
        g.advanceDay();
      }
      expect(g.ageYears, 19);
    });

    test('buying reduces cash and creates a holding', () {
      final g = GameController(seed: 1);
      final spx = Catalog.assetById('spx');
      final err = g.buy(spx, 200);
      expect(err, isNull);
      expect(g.cash, closeTo(Catalog.startingCash - 200, 1e-6));
      expect(g.holdings, hasLength(1));
      // Value right after purchase ~= amount paid.
      expect(g.valueOf(g.holdings.first), closeTo(200, 1e-6));
    });

    test('cannot buy more than available cash', () {
      final g = GameController(seed: 1);
      final err = g.buy(Catalog.assetById('spx'), 99999);
      expect(err, isNotNull);
      expect(g.holdings, isEmpty);
    });

    test('savings accrues interest each day', () {
      final g = GameController(seed: 1);
      g.cash = 5000; // fund the test beyond the $500 starting cash
      final hysa = Catalog.assetById('hysa');
      g.buy(hysa, 1000);
      final start = g.valueOf(g.holdings.first);
      g.advanceDay();
      final after = g.valueOf(g.holdings.first);
      expect(after, greaterThan(start));
      expect(after, closeTo(start * (1 + hysa.apy / Catalog.stepsPerYear), 1e-6));
    });

    test('CDs are locked until maturity, then redeemable', () {
      final g = GameController(seed: 1);
      final cd = Catalog.assetById('cd6'); // 6-month term
      g.buy(cd, 500);
      final holding = g.holdings.first;
      expect(holding.isLocked, isTrue);
      expect(g.sell(holding, 100), isNotNull); // rejected while locked

      for (var i = 0; i < cd.termDays; i++) {
        g.advanceDay();
      }
      expect(holding.matured, isTrue);
      expect(holding.isLocked, isFalse);
      expect(g.sell(holding, 100), isNull); // now allowed
    });

    test('selling returns cash and clears emptied positions', () {
      final g = GameController(seed: 1);
      final spx = Catalog.assetById('spx');
      g.buy(spx, 200);
      final holding = g.holdings.first;
      final value = g.valueOf(holding);
      final cashBefore = g.cash;
      final err = g.sell(holding, value, max: true);
      expect(err, isNull);
      expect(g.cash, closeTo(cashBefore + value, 1e-6));
      expect(g.holdings, isEmpty);
    });

    test('price-based assets actually move over time', () {
      final g = GameController(seed: 7);
      final start = g.priceOf('btq');
      var moved = false;
      for (var i = 0; i < 10; i++) {
        g.advanceDay();
        if ((g.priceOf('btq') - start).abs() > 1e-9) moved = true;
      }
      expect(moved, isTrue);
    });

    test('only age-appropriate jobs are available', () {
      final g = GameController(seed: 1);
      // At 18, the age-24 engineer job should not be available yet.
      expect(g.availableJobs.any((j) => j.id == 'engineer'), isFalse);
      expect(g.availableJobs.any((j) => j.id == 'barista'), isTrue);
    });
  });

  group('Fundamentals & income', () {
    test('price history grows one point per day', () {
      final g = GameController(seed: 3);
      final start = g.priceHistoryFor('spx').length;
      g.advanceDay();
      g.advanceDay();
      expect(g.priceHistoryFor('spx').length, start + 2);
    });

    test('market cap is price times shares outstanding', () {
      final g = GameController(seed: 3);
      final apt = Catalog.assetById('apt');
      expect(
        g.marketCap(apt),
        closeTo(g.priceOf('apt') * apt.sharesOutstanding, 1e-3),
      );
    });

    test('P/E is null for unprofitable companies', () {
      final g = GameController(seed: 3);
      expect(g.peRatio(Catalog.assetById('bio')), isNull); // negative EPS
      expect(g.peRatio(Catalog.assetById('apt')), isNotNull);
    });

    test('holding a dividend payer produces dividend cash', () {
      final g = GameController(seed: 3);
      g.buy(Catalog.assetById('divx'), 400); // 3.8% yield ETF
      final r = g.advanceDay();
      expect(r.dividends, greaterThan(0));
    });

    test('Series I Bond respects annual cap and resets each year', () {
      final g = GameController(seed: 5);
      g.cash = 30000;
      final ib = Catalog.assetById('ibond');
      expect(g.buy(ib, 10000), isNull); // up to the $10k/yr cap
      expect(g.buy(ib, 100), isNotNull); // over the cap -> rejected
      for (var i = 0; i < Catalog.stepsPerYear; i++) {
        g.advanceDay();
      }
      expect(g.buy(ib, 5000), isNull); // cap resets after a year
    });
  });

  group('Real estate', () {
    test('amortization matches the textbook formula', () {
      // \$100k at 6% over 360 months ≈ \$599.55/mo.
      final pmt = mortgageMonthlyPayment(100000, 0.06, 360);
      expect(pmt, closeTo(599.55, 0.5));
    });

    test('buying a property uses the down payment and creates equity', () {
      final g = GameController(seed: 1);
      g.cash = 200000;
      final shack = Properties.byId('shack');
      final price = g.propertyPriceOf('shack');
      final err = g.buyProperty(shack, Properties.mortgages.first, 0.20);
      expect(err, isNull);
      expect(g.properties, hasLength(1));
      final h = g.properties.first;
      expect(g.cash, closeTo(200000 - price * 0.20, 1e-6));
      expect(h.loanBalance, closeTo(price * 0.80, 1e-6));
      expect(h.equity, closeTo(price * 0.20, 1e-6)); // value==price at purchase
      expect(g.netWorth, closeTo(g.cash + h.equity, 1.0));
    });

    test('paying the mortgage reduces the loan balance (builds equity)', () {
      final g = GameController(seed: 1);
      g.cash = 200000;
      g.buyProperty(Properties.byId('shack'), Properties.mortgages.first, 0.20);
      final loanStart = g.properties.first.loanBalance;
      g.advanceDay();
      expect(g.properties.first.loanBalance, lessThan(loanStart));
      expect(g.properties.first.monthsPaid, 1);
    });

    test('a mansion is unaffordable on a barista wage', () {
      final g = GameController(seed: 1);
      g.cash = 500000;
      // Big loan -> payment far exceeds 45% of a barista's pay.
      final err = g.buyProperty(
          Properties.byId('luxury'), Properties.mortgages.first, 0.10);
      expect(err, isNotNull);
    });

    test('owning a mortgaged home stays finite for 30 years', () {
      final g = GameController(seed: 7);
      g.cash = 50000;
      expect(
          g.buyProperty(Properties.byId('shack'), Properties.mortgages.first,
              0.20),
          isNull);
      for (var i = 0; i < 30 * Catalog.stepsPerYear; i++) {
        g.advanceDay();
        expect(g.netWorth.isFinite, isTrue);
      }
      // A 30-year loan should be fully (or nearly) paid off after 30 years.
      expect(g.properties.first.loanBalance, lessThan(1000));
    });

    test('cash-out refinance pulls equity without selling', () {
      final g = GameController(seed: 1)..cash = 200000;
      g.buyProperty(Properties.byId('shack'), Properties.mortgages.first, 0.50);
      final h = g.properties.first;
      final cashBefore = g.cash;
      final loanBefore = h.loanBalance;
      expect(g.refinance(h), isNull);
      expect(h.loanBalance, greaterThan(loanBefore)); // levered back up
      expect(h.loanBalance,
          closeTo(h.currentValue * GameController.refiMaxLtv, 1));
      expect(g.cash, greaterThan(cashBefore)); // cash pulled out
      expect(g.properties, hasLength(1)); // and you still own it
    });

    test('renovation forces appreciation for a cash cost', () {
      final g = GameController(seed: 1)..cash = 200000;
      g.buyProperty(Properties.byId('shack'), Properties.mortgages.first, 0.50);
      final h = g.properties.first;
      final valueBefore = h.currentValue;
      final cashBefore = g.cash;
      expect(g.renovate(h, 5000), isNull);
      expect(g.cash, closeTo(cashBefore - 5000, 1e-6));
      expect(h.currentValue, greaterThan(valueBefore)); // value-add
      expect(h.renovationInvested, 5000);
    });

    test('renovations hit diminishing returns (no infinite money)', () {
      final g = GameController(seed: 3)..cash = 1000000;
      g.buyProperty(Properties.byId('shack'), Properties.mortgages.first, 0.50);
      final h = g.properties.first;
      final base = Properties.byId('shack').basePrice;
      g.renovate(h, base * 0.5); // blow past the saturation point in one go
      final before = h.currentValue;
      g.renovate(h, 4000); // now a renovation adds back less than it costs
      expect(h.currentValue - before, lessThan(4000));
    });

    test('the mortgage rate floats but stays bounded', () {
      final g = GameController(seed: 5)..cash = 50000;
      for (var i = 0; i < 600; i++) {
        g.advanceDay();
        expect(g.mortgageRate,
            inInclusiveRange(Properties.minRate, Properties.maxRate));
      }
    });
  });

  group('Short positions', () {
    test('opening a short posts margin and is net-worth-neutral', () {
      final g = GameController(seed: 1);
      g.cash = 10000;
      final nwBefore = g.netWorth;
      final err = g.short(Catalog.assetById('spx'), 1000);
      expect(err, isNull);
      expect(g.cash, closeTo(10000 - 1000, 1e-6));
      final h = g.holdings.firstWhere((x) => x.isShort);
      expect(g.valueOf(h), closeTo(1000, 1e-6)); // entry == current at open
      expect(g.netWorth, closeTo(nwBefore, 1.0)); // cash down, position up
    });

    test('covering a fresh short returns the margin', () {
      final g = GameController(seed: 1);
      g.cash = 10000;
      g.short(Catalog.assetById('spx'), 1000);
      final h = g.holdings.firstWhere((x) => x.isShort);
      final cashBefore = g.cash;
      expect(g.coverShort(h), isNull);
      expect(g.cash, closeTo(cashBefore + 1000, 1e-6));
      expect(g.holdings.where((x) => x.isShort), isEmpty);
    });

    test('a long and a short on the same asset are separate positions', () {
      final g = GameController(seed: 1);
      g.cash = 10000;
      g.buy(Catalog.assetById('spx'), 1000);
      g.short(Catalog.assetById('spx'), 1000);
      expect(g.holdings.where((x) => x.assetId == 'spx').length, 2);
    });

    test('cannot short a cash instrument', () {
      final g = GameController(seed: 1);
      g.cash = 10000;
      expect(g.short(Catalog.assetById('hysa'), 100), isNotNull);
    });
  });

  group('Yield funds', () {
    test('funds enforce a high entry minimum', () {
      final g = GameController(seed: 1);
      g.cash = 15000;
      // Income Fund needs \$20k.
      expect(g.buy(Catalog.assetById('income_fund'), 15000), isNotNull);
    });

    test('penalty-lock fund forfeits a slice of gains on early exit', () {
      final g = GameController(seed: 1);
      g.cash = 60000;
      g.buy(Catalog.assetById('income_fund'), 50000);
      final h = g.holdings.firstWhere((x) => x.kind == AssetKind.fund);
      h.balance = 55000; // pretend it grew \$5k
      final cashBefore = g.cash;
      expect(g.sell(h, h.balance, max: true), isNull);
      // forfeit 50% of the \$5k gain = \$2.5k
      expect(g.cash, closeTo(cashBefore + 55000 - 2500, 1.0));
      expect(g.holdings.where((x) => x.kind == AssetKind.fund), isEmpty);
    });

    test('hard-locked fund cannot be sold before maturity', () {
      final g = GameController(seed: 1);
      g.cash = 300000;
      g.buy(Catalog.assetById('priv_credit'), 250000);
      final h = g.holdings.firstWhere((x) => x.kind == AssetKind.fund);
      expect(h.isLocked, isTrue);
      expect(g.sell(h, 1000), isNotNull); // blocked while locked
    });
  });

  group('Bonds', () {
    test('treasury ladder: longer maturity = higher coupon and more price risk',
        () {
      final c = Catalog.assetById;
      expect(c('ust2').apy, lessThan(c('ust4').apy));
      expect(c('ust4').apy, lessThan(c('ust6').apy));
      expect(c('ust6').apy, lessThan(c('ust10').apy));
      expect(c('ust2').dailyVol, lessThan(c('ust10').dailyVol));
    });

    test('junk bond carries default risk; treasuries do not', () {
      expect(Catalog.assetById('junk').defaultRisk, greaterThan(0));
      expect(Catalog.assetById('junk').apy, greaterThan(0.08));
      expect(Catalog.assetById('ust10').defaultRisk, 0);
    });
  });

  group('Sports betting', () {
    test('placing a bet is net-worth-neutral (cash -> pending bet)', () {
      final g = GameController(seed: 1);
      g.cash = 1000;
      final nw = g.netWorth;
      final e = g.sportsSlate.first;
      expect(g.placeBet(e, true, 100), isNull);
      expect(g.cash, closeTo(900, 1e-6));
      expect(g.pendingBetsValue, closeTo(100, 1e-6));
      expect(g.netWorth, closeTo(nw, 1.0));
    });

    test('the house has an edge — every bet is -EV', () {
      final g = GameController(seed: 1);
      for (final e in g.sportsSlate) {
        expect(e.homeProb * e.homeDecimal, lessThan(1.0));
        expect((1 - e.homeProb) * e.awayDecimal, lessThan(1.0));
      }
    });

    test('a bet resolves and clears on the next month', () {
      final g = GameController(seed: 1);
      g.cash = 1000;
      g.placeBet(g.sportsSlate.first, true, 100);
      expect(g.bets, isNotEmpty);
      g.advanceDay();
      expect(g.bets, isEmpty); // resolved
    });

    test('a parlay multiplies the legs odds and stays net-worth-neutral', () {
      final g = GameController(seed: 1);
      g.cash = 1000;
      final e1 = g.sportsSlate[0];
      final e2 = g.sportsSlate[1];
      final legs = [
        ParlayLeg(
            eventId: e1.id,
            label: 'a',
            decimalOdds: e1.homeDecimal,
            winProb: e1.homeProb),
        ParlayLeg(
            eventId: e2.id,
            label: 'b',
            decimalOdds: e2.awayDecimal,
            winProb: 1 - e2.homeProb),
      ];
      expect(g.placeParlay(legs, 50), isNull);
      final bet = g.bets.last;
      expect(bet.isParlay, isTrue);
      expect(bet.decimalOdds, closeTo(e1.homeDecimal * e2.awayDecimal, 1e-9));
      expect(g.netWorth, closeTo(1000, 1.0)); // cash 950 + pending 50
    });

    test('only one bet per game — a second wager on it is rejected', () {
      final g = GameController(seed: 1);
      g.cash = 1000;
      final e = g.sportsSlate.first;
      expect(g.placeBet(e, true, 100), isNull);
      expect(g.hasBetOn(e.id), isTrue);
      // Same game, even the same side, can't be bet again.
      expect(g.placeBet(e, true, 100), isNotNull);
      expect(g.placeBet(e, false, 100), isNotNull);
      expect(g.bets.length, 1);
      expect(g.cash, closeTo(900, 1e-6)); // the rejected bets took nothing
    });

    test('a parlay cannot include the same game twice', () {
      final g = GameController(seed: 1);
      g.cash = 1000;
      final e = g.sportsSlate.first;
      final legs = [
        ParlayLeg(
            eventId: e.id,
            label: 'home',
            decimalOdds: e.homeDecimal,
            winProb: e.homeProb),
        ParlayLeg(
            eventId: e.id,
            label: 'away',
            decimalOdds: e.awayDecimal,
            winProb: 1 - e.homeProb),
      ];
      expect(g.placeParlay(legs, 50), isNotNull); // rejected
      expect(g.bets, isEmpty);
      expect(g.cash, closeTo(1000, 1e-6));
    });
  });

  group('Cash discipline', () {
    test('grace months charge an overdraft fee, month 4 is a margin call', () {
      final g = GameController(seed: 1);
      g.cash = -10000; // deep in the red, stays negative for months
      for (var month = 1; month <= 3; month++) {
        final r = g.advanceDay();
        expect(g.monthsCashNegative, month);
        expect(r.overdraftFee, greaterThan(0));
        expect(r.marginCall, isFalse);
      }
      final r4 = g.advanceDay();
      expect(r4.marginCall, isTrue);
      expect(r4.overdraftFee, 0); // margin call replaces the fee
      expect(g.monthsCashNegative, 4);
    });

    test('getting back above zero resets the streak', () {
      final g = GameController(seed: 1);
      g.cash = -5000;
      g.advanceDay();
      expect(g.monthsCashNegative, 1);
      g.cash = 50000; // player covered the shortfall
      g.advanceDay();
      expect(g.monthsCashNegative, 0);
    });

    test('the recap carries cash and its delta', () {
      final g = GameController(seed: 1);
      final before = g.cash;
      final r = g.advanceDay();
      expect(r.cashAfter, closeTo(g.cash, 1e-6));
      expect(r.cashDelta, closeTo(g.cash - before, 1e-6));
    });
  });

  group('Education & careers', () {
    test('a degree-gated job is blocked until the degree is earned', () {
      final g = GameController(seed: 1);
      final banker = Catalog.jobs.firstWhere((j) => j.requiredEdu == 3);
      g.takeJob(banker);
      expect(g.job.id, isNot(banker.id)); // blocked, still entry job
    });

    test('enrolling borrows tuition, halves pay, and completes after the term',
        () {
      final g = GameController(seed: 1);
      final assoc = Catalog.degrees.firstWhere((d) => d.level == 1);
      final fullPay = g.job.pay;
      expect(g.enroll(assoc), isNull);
      expect(g.isStudying, isTrue);
      expect(g.studentLoan, greaterThanOrEqualTo(assoc.tuition));
      expect(g.effectivePay,
          closeTo(fullPay * GameController.partTimePayFraction, 1e-6));
      for (var i = 0; i < assoc.months; i++) {
        g.advanceDay();
      }
      expect(g.isStudying, isFalse);
      expect(g.eduLevel, 1);
      expect(g.effectivePay, closeTo(fullPay, 1e-6));
    });

    test('the student loan compounds and reduces net worth', () {
      final g = GameController(seed: 1);
      final bach = Catalog.degrees.firstWhere((d) => d.level == 2);
      g.enroll(bach);
      final loan0 = g.studentLoan;
      g.advanceDay();
      expect(g.studentLoan, greaterThan(loan0)); // interest accrued
      g.cash = 200000;
      expect(g.payStudentLoan(0, max: true), isNull);
      expect(g.studentLoan, 0);
    });
  });

  group('Fast-forward', () {
    test('advanceMonths runs every month and aggregates the result', () {
      final g = GameController(seed: 3);
      final day0 = g.day;
      final out = g.advanceMonths(12);
      expect(out.months, 12);
      expect(g.day, day0 + 12); // really advanced 12 months
      expect(out.result.income, greaterThan(0)); // a year of salary summed
      expect(out.result.expenses, greaterThan(0));
      expect(out.result.netWorthAfter, closeTo(g.netWorth, 1e-6));
      expect(out.result.cashAfter, closeTo(g.cash, 1e-6));
    });

    test('a fast-forward stops early when a margin call fires', () {
      final g = GameController(seed: 3)..cash = -20000; // doomed to a margin call
      final out = g.advanceMonths(12);
      expect(out.result.marginCall, isTrue);
      expect(out.months, lessThanOrEqualTo(4)); // stopped at the margin call
    });
  });

  group('Commodities', () {
    test('exist, flag safe havens, and stay out of the Sherwood market tabs',
        () {
      final commodities = Catalog.assetsInCategory('commodities');
      expect(commodities, isNotEmpty);
      expect(commodities.every((a) => a.kind == AssetKind.commodity), isTrue);
      expect(commodities.any((a) => a.id == 'gold' && a.safeHaven), isTrue);
      // Not part of the investing app's category tabs — they live in Comex.
      expect(Catalog.categories.any((c) => c.id == 'commodities'), isFalse);
    });

    test('a safe-haven metal can be bought and sold like any price asset', () {
      final g = GameController(seed: 1)..cash = 10000;
      final gold = Catalog.assetById('gold');
      expect(g.buy(gold, 5000), isNull);
      final h = g.holdings.firstWhere((x) => x.assetId == 'gold');
      expect(g.valueOf(h), closeTo(5000, 1));
      expect(g.sell(h, 0, max: true), isNull);
    });
  });

  group('Crises & decisions', () {
    test('a decision event fires and a choice resolves it', () {
      final g = GameController(seed: 5)..cash = 50000;
      var fired = false;
      for (var i = 0; i < 300 && !fired; i++) {
        if (g.advanceDay().crisis) fired = true;
      }
      expect(fired, isTrue, reason: 'a crisis should fire within 300 months');
      expect(g.pendingCrisis, isNotNull);
      final outcome = g.resolveCrisis(g.pendingCrisis!.choices.first);
      expect(outcome, isNotEmpty);
      expect(g.pendingCrisis, isNull); // cleared after the choice
    });

    test('fast-forward halts on a pending decision (or margin call)', () {
      final g = GameController(seed: 5)..cash = 50000;
      final out = g.advanceMonths(300);
      expect(out.months, lessThan(300)); // something interrupted the run
      expect(g.pendingCrisis != null || out.result.marginCall, isTrue);
    });

    test('the event catalog is large and every event has options', () {
      expect(Crises.all.length, greaterThanOrEqualTo(250));
      for (final e in Crises.all) {
        expect(e.choices, isNotEmpty, reason: '${e.id} has no choices');
      }
      // ids are unique
      final ids = Crises.all.map((e) => e.id).toSet();
      expect(ids.length, Crises.all.length);
    });

    test('the same decision does not resurface back-to-back', () {
      final g = GameController(seed: 5)..cash = 50000;
      String? last;
      var samples = 0;
      for (var i = 0; i < 2000 && samples < 30; i++) {
        if (g.advanceDay().crisis) {
          final id = g.pendingCrisis!.id;
          expect(id, isNot(equals(last)),
              reason: 'crisis "$id" fired twice in a row');
          last = id;
          samples++;
          g.resolveCrisis(g.pendingCrisis!.choices.first);
        }
      }
      expect(samples, greaterThan(5),
          reason: 'enough crises should fire to exercise repeat-avoidance');
    });

    test('crises still fire while the player is underwater', () {
      final g = GameController(seed: 5)..cash = 200;
      g.debt = 20000; // deep negative net worth
      expect(g.netWorth, lessThan(0));
      var fired = false;
      for (var i = 0; i < 600 && !fired; i++) {
        if (g.advanceDay().crisis) fired = true;
      }
      expect(fired, isTrue,
          reason: 'a negative net worth should still draw base-tier events');
    });

    test('fast-forwarding covers the full span across crisis interruptions',
        () {
      // Rich enough that no margin call interrupts; the only halts are crises.
      final g = GameController(seed: 5)..cash = 500000;
      final startDay = g.day;
      const span = 6;
      var remaining = span;
      var guard = 0;
      while (remaining > 0 && guard++ < 100) {
        final out = g.advanceMonths(remaining);
        expect(out.months, greaterThan(0)); // each segment makes progress
        remaining -= out.months;
        if (g.pendingCrisis != null) {
          g.resolveCrisis(g.pendingCrisis!.choices.first);
        }
      }
      // The whole span elapses regardless of how many decisions interrupted it.
      expect(g.day - startDay, span);
    });

    test('high-interest debt compounds and can be paid off', () {
      final g = GameController(seed: 1)..cash = 50000;
      g.debt = 10000;
      expect(g.netWorth, closeTo(40000, 1)); // debt subtracts from net worth
      g.advanceDay();
      expect(g.debt, greaterThan(10000)); // compounded
      expect(g.payDebt(0, max: true), isNull);
      expect(g.debt, 0);
    });

    test('the event pool grows with wealth (tiering)', () {
      int poolFor(GameController g) => Crises.all
          .where((e) =>
              g.netWorth >= e.minNetWorth &&
              g.netWorth <= e.maxNetWorth &&
              e.eligible(g))
          .length;
      final poor = GameController(seed: 1); // ~$2k net worth
      final rich = GameController(seed: 1)..cash = 10000000; // $10M
      expect(poolFor(rich), greaterThan(poolFor(poor)));
      // an expensive event is NOT available when poor
      final expensive = Crises.all.firstWhere((e) => e.minNetWorth >= 700000);
      expect(poor.netWorth >= expensive.minNetWorth, isFalse);
    });

    test('a severance suspends your pay for the consequence period', () {
      final g = GameController(seed: 1)..cash = 100000;
      g.takeUnpaidLeave(3, 'Between jobs');
      expect(g.effectivePay, 0);
      final r = g.advanceDay();
      expect(r.income, 0); // no salary while suspended
      g.advanceDay();
      g.advanceDay();
      expect(g.ongoing, isEmpty); // clears after 3 months
      expect(g.effectivePay, greaterThan(0));
    });
  });

  group('Prestige & retirement', () {
    test('retirement unlocks at the net-worth threshold', () {
      final g = GameController(seed: 1);
      expect(g.canRetire, isFalse);
      g.cash = GameController.retireThreshold + 1;
      expect(g.canRetire, isTrue);
    });

    test('higher prestige reveals more jobs and assets', () {
      final g0 = GameController(seed: 1);
      final g1 = GameController(seed: 1, prestige: 1);
      expect(g1.unlockedJobs.length, greaterThan(g0.unlockedJobs.length));
      expect(g1.unlockedAssets('commodities').length,
          greaterThan(g0.unlockedAssets('commodities').length));
      expect(g0.unlockedAssets('commodities').any((a) => a.id == 'platinum'),
          isFalse);
      expect(g1.unlockedAssets('commodities').any((a) => a.id == 'platinum'),
          isTrue);
    });
  });
}
