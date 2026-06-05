import 'package:flutter_test/flutter_test.dart';
import 'package:wealthquest/data/catalog.dart';
import 'package:wealthquest/data/properties.dart';
import 'package:wealthquest/models/asset.dart';
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
      g.cash = 20000;
      // Income Fund needs \$50k.
      expect(g.buy(Catalog.assetById('income_fund'), 20000), isNotNull);
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
}
