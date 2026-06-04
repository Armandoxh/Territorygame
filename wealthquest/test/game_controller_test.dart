import 'package:flutter_test/flutter_test.dart';
import 'package:wealthquest/data/catalog.dart';
import 'package:wealthquest/models/asset.dart';
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
}
