import 'dart:math';

import 'package:flutter/foundation.dart';

import '../data/catalog.dart';
import '../engine/climate_engine.dart';
import '../engine/market_engine.dart';
import '../engine/news_engine.dart';
import '../models/asset.dart';
import '../models/climate.dart';
import '../models/holding.dart';
import '../models/job.dart';
import '../models/rumor.dart';

/// Summary of what happened on a single Next Week, used to populate the
/// post-advance dialog.
class DayResult {
  final double income;
  final double expenses;
  final double dividends; // dividends + bond coupons
  final double interest;
  final double netWorthBefore;
  final double netWorthAfter;
  final List<String> events;

  const DayResult({
    required this.income,
    required this.expenses,
    required this.dividends,
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
  final Map<String, List<double>> priceHistory = {};
  final List<Holding> holdings = [];
  final List<double> netWorthHistory = [];
  final List<String> eventLog = [];

  // ---- Newspaper / rumor mill ----
  List<Rumor> currentRumors = [];
  List<Rumor> lastResolved = [];
  final List<Rumor> rumorArchive = [];

  /// Whether the exact reliability % is shown. Flipped on by the (future)
  /// upgrade tree.
  bool reliabilityRevealed = false;

  // ---- Macro economy ----
  MarketRegime regime = MarketRegime.normal;
  SectorEvent? sectorEvent;

  /// Dollars bought this in-game year of capped assets (e.g. I Bonds). Reset
  /// every birthday.
  final Map<String, double> _purchasedThisYear = {};

  int _nextHoldingId = 1;

  GameController({int? seed})
      : _rng = Random(seed ?? DateTime.now().millisecondsSinceEpoch),
        cash = Catalog.startingCash,
        job = Catalog.startingJob {
    for (final a in Catalog.assets) {
      if (a.kind.isPriceBased) {
        _prices[a.id] = a.basePrice;
        _prevPrices[a.id] = a.basePrice;
        priceHistory[a.id] = [a.basePrice];
      }
    }
    netWorthHistory.add(netWorth);
    currentRumors = NewsEngine.generateEdition(_rng, day);
    _log('You turn 18 and land a job as a ${job.title}. Time to build wealth.');
  }

  List<Rumor> currentRumorsForAsset(String assetId) =>
      currentRumors.where((r) => r.assetId == assetId).toList();

  // ---- Derived time ----
  int get ageYears => Catalog.startAge + day ~/ Catalog.stepsPerYear;
  int get yearsPlayed => day ~/ Catalog.stepsPerYear;
  double get dailyExpenses => Catalog.monthlyExpenses(ageYears, job.pay);

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

  /// Estimated income next day that isn't your salary (interest + dividends +
  /// bond coupons).
  double get dailyPassiveIncome {
    var sum = 0.0;
    for (final h in holdings) {
      final def = Catalog.assetById(h.assetId);
      if (h.kind.isInterestBearing) {
        sum += h.balance * _effectiveApy(def, h.balance) / Catalog.stepsPerYear;
      } else if (def.incomeYield > 0) {
        sum += valueOf(h) * def.incomeYield / Catalog.stepsPerYear;
      }
    }
    return sum;
  }

  // ---- Fundamentals for the detail screen ----
  List<double> priceHistoryFor(String assetId) =>
      priceHistory[assetId] ?? const [];

  double marketCap(AssetDef def) => priceOf(def.id) * def.sharesOutstanding;

  double high52(String assetId) => _extremeInWindow(assetId, high: true);
  double low52(String assetId) => _extremeInWindow(assetId, high: false);

  double _extremeInWindow(String assetId, {required bool high}) {
    final hist = priceHistory[assetId];
    if (hist == null || hist.isEmpty) return priceOf(assetId);
    final window = hist.length > Catalog.stepsPerYear
        ? hist.sublist(hist.length - Catalog.stepsPerYear)
        : hist;
    var ext = window.first;
    for (final v in window) {
      if (high ? v > ext : v < ext) ext = v;
    }
    return ext;
  }

  /// P/E ratio for equities, or null when not meaningful (no/negative earnings).
  double? peRatio(AssetDef def) {
    if (def.eps <= 0) return null;
    return priceOf(def.id) / def.eps;
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
    if (def.annualPurchaseCap > 0) {
      final remaining = remainingAnnualCap(def);
      if (amount > remaining + 0.001) {
        return remaining <= 0.001
            ? '${def.name}: \$${def.annualPurchaseCap.toStringAsFixed(0)}/year limit already reached.'
            : 'Only \$${remaining.toStringAsFixed(0)} of ${def.name} left to buy this year.';
      }
    }

    cash -= amount;
    if (def.annualPurchaseCap > 0) {
      _purchasedThisYear[def.id] = (_purchasedThisYear[def.id] ?? 0) + amount;
    }

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
      final monthsLeft = h.maturityDay - day;
      return 'This CD is locked for $monthsLeft more month(s).';
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
    _log('New job: ${j.title} — \$${j.pay.toStringAsFixed(0)}/month.');
    notifyListeners();
  }

  List<JobDef> get availableJobs =>
      Catalog.jobs.where((j) => ageYears >= j.minAge).toList();

  /// APY a liquid account actually earns given its balance (reduced when below
  /// the account's minimum balance).
  double _effectiveApy(AssetDef def, double balance) =>
      (def.minBalance > 0 && balance < def.minBalance)
          ? def.belowMinApy
          : def.apy;

  /// Remaining dollars you can still buy of a capped asset this year.
  double remainingAnnualCap(AssetDef def) {
    if (def.annualPurchaseCap <= 0) return double.infinity;
    final used = _purchasedThisYear[def.id] ?? 0;
    final r = def.annualPurchaseCap - used;
    return r < 0 ? 0 : r;
  }

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
      final gain =
          h.balance * _effectiveApy(def, h.balance) / Catalog.stepsPerYear;
      h.balance += gain;
      interest += gain;
      if (h.kind == AssetKind.cd && !h.matured && day + 1 >= h.maturityDay) {
        h.matured = true;
        events.add('${def.name} matured — \$${h.balance.toStringAsFixed(0)} now redeemable.');
      }
    }

    // 3) Resolve this week's rumors into a per-asset price bias.
    final bias = <String, double>{};
    var rumorsTrue = 0;
    for (final r in currentRumors) {
      final isTrue = _rng.nextDouble() < r.reliability;
      r.resolved = true;
      r.cameTrue = isTrue;
      if (isTrue) {
        bias[r.assetId] = (bias[r.assetId] ?? 0) + r.dir * r.magnitude;
        rumorsTrue++;
      } else {
        // A false rumor sometimes swings the other way, sometimes fizzles.
        final b = _rng.nextBool() ? -r.dir * r.magnitude * 0.7 : 0.0;
        bias[r.assetId] = (bias[r.assetId] ?? 0) + b;
      }
    }

    // 3b) Roll the macro climate and manage any sector boom/bust.
    final prevRegime = regime;
    regime = ClimateEngine.nextRegime(regime, _rng);
    if (regime != prevRegime) {
      events.add('${regime.emoji} ${regime.label}: ${regime.blurb}');
    }
    if (sectorEvent != null && sectorEvent!.weeksLeft <= 0) {
      final s = sectorEvent!;
      final name = s.sector == 'Digital' ? 'Crypto' : s.sector;
      events.add('The $name ${s.isRally ? 'rally' : 'slump'} fades.');
      sectorEvent = null;
    }
    if (sectorEvent == null && _rng.nextDouble() < 0.10) {
      sectorEvent = ClimateEngine.randomSectorEvent(_rng);
      events.add('🗞️ ${sectorEvent!.headline}.');
    }

    // 4) Move all price-based markets (rumor + climate + sector bias) and
    //    record history.
    _prevPrices
      ..clear()
      ..addAll(_prices);
    for (final a in Catalog.assets) {
      if (!a.kind.isPriceBased) continue;
      var mb = bias[a.id] ?? 0;
      // Persistent regimes are a rate (scale with step length); a crash is a
      // discrete shock (a bad month) whose magnitude does not scale.
      final regimeDrift = regime.isCrash
          ? regime.weeklyDrift
          : regime.weeklyDrift * Catalog.driftStepFactor;
      mb += regimeDrift * ClimateEngine.beta(a);
      if (sectorEvent != null && a.sector == sectorEvent!.sector) {
        mb += sectorEvent!.dir * sectorEvent!.magnitude;
      }
      final next = MarketEngine.stepPrice(_prices[a.id]!, a, _rng, bias: mb);
      _prices[a.id] = next;
      final hist = priceHistory[a.id]!;
      hist.add(next);
      if (hist.length > 520) hist.removeAt(0); // cap ~10 years of weeks
    }

    // 4b) A crash carves a slice off UNINSURED cash; insured cash is safe.
    if (regime.isCrash) {
      for (final h in holdings) {
        if (h.kind.isInterestBearing &&
            !Catalog.assetById(h.assetId).insured) {
          h.balance *= (1 - ClimateEngine.crashCashLoss);
        }
      }
    }

    // Count down an active sector event (applied this week, expires later).
    if (sectorEvent != null) sectorEvent!.weeksLeft -= 1;

    // Record realized moves on the resolved rumors and archive them.
    for (final r in currentRumors) {
      r.actualMove = dailyChange(r.assetId);
    }
    lastResolved = currentRumors;
    for (final r in currentRumors.reversed) {
      rumorArchive.insert(0, r);
    }
    if (rumorArchive.length > 80) {
      rumorArchive.removeRange(80, rumorArchive.length);
    }
    if (currentRumors.isNotEmpty) {
      events.add(
          '📰 Rumor mill: $rumorsTrue of ${currentRumors.length} tips proved true.');
    }

    // 5) Pay dividends + bond coupons into cash (after prices settle).
    var dividends = 0.0;
    for (final h in holdings) {
      if (!h.kind.isPriceBased) continue;
      final def = Catalog.assetById(h.assetId);
      if (def.incomeYield <= 0) continue;
      final pay = valueOf(h) * def.incomeYield / Catalog.stepsPerYear;
      cash += pay;
      dividends += pay;
    }

    // 6) Tick the clock; birthday on year boundaries.
    final hadBirthday = (day + 1) % Catalog.stepsPerYear == 0;
    day += 1;
    if (hadBirthday) {
      events.add('🎂 Happy birthday — you are now $ageYears.');
      _purchasedThisYear.clear(); // annual purchase caps reset each year
    }

    // 7) Publish next week's edition of rumors.
    currentRumors = NewsEngine.generateEdition(_rng, day);

    netWorthHistory.add(netWorth);
    final after = netWorth;

    final summary = DayResult(
      income: income,
      expenses: expenses,
      dividends: dividends,
      interest: interest,
      netWorthBefore: before,
      netWorthAfter: after,
      events: events,
    );

    for (final e in events) {
      _log(e);
    }
    _log('Month ${day}: net worth \$${after.toStringAsFixed(0)} (${after - before >= 0 ? '+' : ''}\$${(after - before).toStringAsFixed(0)}).');

    notifyListeners();
    return summary;
  }

  void _log(String message) {
    eventLog.insert(0, message);
    if (eventLog.length > 40) eventLog.removeLast();
  }
}
