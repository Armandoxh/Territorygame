import 'dart:math';

import 'package:flutter/foundation.dart';

import '../data/catalog.dart';
import '../engine/market_engine.dart';
import '../models/asset.dart';
import '../models/holding.dart';
import '../models/job.dart';

/// Summary of what happened on a single Next Day, used to populate the
/// post-advance dialog.
class DayResult {
  final double income;
  final double expenses;
  final double coupons;
  final double interest;
  final double netWorthBefore;
  final double netWorthAfter;
  final List<String> events;

  const DayResult({
    required this.income,
    required this.expenses,
    required this.coupons,
    required this.interest,
    required this.netWorthBefore,
    required this.netWorthAfter,
    required this.events,
  });

  double get netWorthDelta => netWorthAfter - netWorthBefore;
}

/// The whole game lives here: time, cash, job, market prices, and holdings.
/// A [ChangeNotifier] so the UI rebuilds on any change.
class GameController extends ChangeNotifier {
  final Random _rng;

  int day = 0;
  double cash;
  JobDef job;

  final Map<String, double> _prices = {};
  final Map<String, double> _prevPrices = {};
  final List<Holding> holdings = [];
  final List<double> netWorthHistory = [];
  final List<String> eventLog = [];

  int _nextHoldingId = 1;

  GameController({int? seed})
      : _rng = Random(seed ?? DateTime.now().millisecondsSinceEpoch),
        cash = Catalog.startingCash,
        job = Catalog.startingJob {
    for (final a in Catalog.assets) {
      if (a.kind.isPriceBased) {
        _prices[a.id] = a.basePrice;
        _prevPrices[a.id] = a.basePrice;
      }
    }
    netWorthHistory.add(netWorth);
    _log('You turn 18 and land a job as a ${job.title}. Time to build wealth.');
  }

  // ---- Derived time ----
  int get ageYears => Catalog.startAge + day ~/ 52;
  int get yearsPlayed => day ~/ 52;
  double get dailyExpenses => Catalog.dailyExpenses(ageYears);

  // ---- Prices ----
  double priceOf(String assetId) => _prices[assetId] ?? 1.0;

  /// Percentage change of a price-based asset over the last day.
  double dailyChange(String assetId) {
    final prev = _prevPrices[assetId];
    final cur = _prices[assetId];
    if (prev == null || cur == null || prev == 0) return 0;
    return (cur - prev) / prev;
  }

  // ---- Valuation ----
  double valueOf(Holding h) {
    if (h.kind.isInterestBearing) return h.balance;
    return h.shares * priceOf(h.assetId);
  }

  /// Profit/loss vs. what was paid in.
  double profitOf(Holding h) => valueOf(h) - h.costBasis;

  double get holdingsValue {
    var sum = 0.0;
    for (final h in holdings) {
      sum += valueOf(h);
    }
    return sum;
  }

  double get netWorth => cash + holdingsValue;

  /// Estimated income next day that isn't your salary (interest + coupons).
  double get dailyPassiveIncome {
    var sum = 0.0;
    for (final h in holdings) {
      final def = Catalog.assetById(h.assetId);
      if (h.kind.isInterestBearing) {
        sum += h.balance * def.apy / 52;
      } else if (h.kind.paysCoupon) {
        sum += valueOf(h) * def.apy / 52;
      }
    }
    return sum;
  }

  // ---- Holdings lookup ----
  Holding? holdingForAsset(String assetId) {
    for (final h in holdings) {
      if (h.assetId == assetId && h.kind != AssetKind.cd) return h;
    }
    return null;
  }

  // ---- Actions ----------------------------------------------------------

  /// Buy [amount] dollars of [def]. Returns an error string, or null on success.
  String? buy(AssetDef def, double amount) {
    if (amount <= 0) return 'Enter an amount greater than \$0.';
    if (amount > cash + 0.001) return 'Not enough cash.';
    if (amount < def.minInvestment) {
      return 'Minimum for ${def.name} is \$${def.minInvestment.toStringAsFixed(0)}.';
    }

    cash -= amount;

    if (def.kind.isInterestBearing) {
      if (def.kind == AssetKind.savings) {
        final existing = holdingForAsset(def.id);
        if (existing != null) {
          existing.balance += amount;
          existing.costBasis += amount;
        } else {
          holdings.add(Holding(
            id: _nextHoldingId++,
            assetId: def.id,
            kind: def.kind,
            balance: amount,
            costBasis: amount,
            openedDay: day,
          ));
        }
      } else {
        // CD: always a fresh, individually-maturing position.
        holdings.add(Holding(
          id: _nextHoldingId++,
          assetId: def.id,
          kind: def.kind,
          balance: amount,
          costBasis: amount,
          openedDay: day,
          maturityDay: day + def.termDays,
        ));
      }
    } else {
      final shares = amount / priceOf(def.id);
      final existing = holdingForAsset(def.id);
      if (existing != null) {
        existing.shares += shares;
        existing.costBasis += amount;
      } else {
        holdings.add(Holding(
          id: _nextHoldingId++,
          assetId: def.id,
          kind: def.kind,
          shares: shares,
          costBasis: amount,
          openedDay: day,
        ));
      }
    }

    _log('Bought \$${amount.toStringAsFixed(0)} of ${def.name}.');
    notifyListeners();
    return null;
  }

  /// Sell [amount] dollars out of a holding (or everything if [max]).
  /// Returns an error string, or null on success.
  String? sell(Holding h, double amount, {bool max = false}) {
    if (h.isLocked) {
      final daysLeft = h.maturityDay - day;
      return 'This CD is locked for $daysLeft more day(s).';
    }
    final value = valueOf(h);
    final amt = max ? value : amount;
    if (amt <= 0) return 'Enter an amount greater than \$0.';
    if (amt > value + 0.01) {
      return 'You only have \$${value.toStringAsFixed(2)} in this position.';
    }

    final frac = amt / value;
    if (h.kind.isInterestBearing) {
      h.balance -= amt;
    } else {
      h.shares -= h.shares * frac;
    }
    h.costBasis -= h.costBasis * frac;
    cash += amt;

    final def = Catalog.assetById(h.assetId);
    if (valueOf(h) <= 0.01) holdings.remove(h);

    _log('Sold \$${amt.toStringAsFixed(0)} of ${def.name}.');
    notifyListeners();
    return null;
  }

  /// Switch to a different job from the ladder.
  void takeJob(JobDef j) {
    if (j.id == job.id) return;
    job = j;
    _log('New job: ${j.title} — \$${j.pay.toStringAsFixed(0)}/week.');
    notifyListeners();
  }

  List<JobDef> get availableJobs =>
      Catalog.jobs.where((j) => ageYears >= j.minAge).toList();

  /// The heart of the loop. Advance one day (= one in-game week).
  DayResult advanceDay() {
    final before = netWorth;
    final events = <String>[];

    // 1) Salary in, living expenses out.
    final income = job.pay;
    final expenses = dailyExpenses;
    cash += income;
    cash -= expenses;

    // 2) Accrue interest and check CD maturities.
    var interest = 0.0;
    for (final h in holdings) {
      if (!h.kind.isInterestBearing) continue;
      final def = Catalog.assetById(h.assetId);
      final gain = h.balance * def.apy / 52;
      h.balance += gain;
      interest += gain;
      if (h.kind == AssetKind.cd && !h.matured && day + 1 >= h.maturityDay) {
        h.matured = true;
        events.add('${def.name} matured — \$${h.balance.toStringAsFixed(0)} now redeemable.');
      }
    }

    // 3) Move all price-based markets.
    _prevPrices
      ..clear()
      ..addAll(_prices);
    for (final a in Catalog.assets) {
      if (a.kind.isPriceBased) {
        _prices[a.id] = MarketEngine.stepPrice(_prices[a.id]!, a, _rng);
      }
    }

    // 4) Pay bond coupons into cash (after prices settle).
    var coupons = 0.0;
    for (final h in holdings) {
      if (!h.kind.paysCoupon) continue;
      final def = Catalog.assetById(h.assetId);
      final coupon = valueOf(h) * def.apy / 52;
      cash += coupon;
      coupons += coupon;
    }

    // 5) Tick the clock; birthday on year boundaries.
    final hadBirthday = (day + 1) % 52 == 0;
    day += 1;
    if (hadBirthday) {
      events.add('🎂 Happy birthday — you are now $ageYears.');
    }

    netWorthHistory.add(netWorth);
    final after = netWorth;

    final summary = DayResult(
      income: income,
      expenses: expenses,
      coupons: coupons,
      interest: interest,
      netWorthBefore: before,
      netWorthAfter: after,
      events: events,
    );

    for (final e in events) {
      _log(e);
    }
    _log('Day ${day}: net worth \$${after.toStringAsFixed(0)} (${after - before >= 0 ? '+' : ''}\$${(after - before).toStringAsFixed(0)}).');

    notifyListeners();
    return summary;
  }

  void _log(String message) {
    eventLog.insert(0, message);
    if (eventLog.length > 40) eventLog.removeLast();
  }
}
