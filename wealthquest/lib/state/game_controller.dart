import 'dart:math';

import 'package:flutter/foundation.dart';

import '../data/catalog.dart';
import '../data/properties.dart';
import '../engine/climate_engine.dart';
import '../engine/market_engine.dart';
import '../engine/news_engine.dart';
import '../engine/sports_engine.dart';
import '../models/asset.dart';
import '../models/bet.dart';
import '../models/climate.dart';
import '../models/holding.dart';
import '../models/job.dart';
import '../models/property.dart';
import '../models/rumor.dart';

/// Summary of what happened on a single Next Week, used to populate the
/// post-advance dialog.
class DayResult {
  final double income;
  final double expenses;
  final double dividends; // dividends + bond coupons
  final double interest;
  final double mortgage; // total mortgage payments made this month
  final double netWorthBefore;
  final double netWorthAfter;
  final List<String> events;

  const DayResult({
    required this.income,
    required this.expenses,
    required this.dividends,
    required this.interest,
    this.mortgage = 0,
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

  // ---- Real estate ----
  final Map<String, double> propertyPrices = {}; // live listing price per def
  final List<PropertyHolding> properties = [];
  int _nextPropertyId = 1;

  // ---- Sports betting ----
  List<SportsEvent> sportsSlate = [];
  final List<PendingBet> bets = [];
  int _nextEventId = 1;
  int _nextBetId = 1;

  /// Minimum down payment fraction to get a mortgage.
  static const double minDownFraction = 0.05;

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
    for (final p in Properties.ladder) {
      propertyPrices[p.id] = p.basePrice;
    }
    sportsSlate = SportsEngine.generateSlate(_rng, _nextEventId);
    _nextEventId += sportsSlate.length;
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
    if (h.isShort) {
      // Margin + gain: you profit as the price falls below your entry.
      final v = h.costBasis + h.shares * (h.entryPrice - priceOf(h.assetId));
      return v < 0 ? 0 : v; // can't go below zero (stopped out)
    }
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

  double get netWorth =>
      cash + holdingsValue + propertiesEquity + pendingBetsValue;

  // ---- Sports betting ----
  /// Open wagers, valued at their stake until they resolve next month.
  double get pendingBetsValue {
    var sum = 0.0;
    for (final b in bets) {
      sum += b.stake;
    }
    return sum;
  }

  /// Place [stake] on the home (or away) side of an event. Returns an error
  /// string, or null on success.
  String? placeBet(SportsEvent e, bool home, double stake) {
    if (stake <= 0) return 'Enter a stake greater than \$0.';
    if (stake > cash + 0.001) return 'Not enough cash.';
    cash -= stake;
    bets.add(PendingBet(
      id: _nextBetId++,
      label: '${home ? e.home : e.away} (vs ${home ? e.away : e.home})',
      stake: stake,
      decimalOdds: home ? e.homeDecimal : e.awayDecimal,
      winProb: home ? e.homeProb : 1 - e.homeProb,
    ));
    _log('Placed \$${stake.toStringAsFixed(0)} on ${home ? e.home : e.away}.');
    notifyListeners();
    return null;
  }

  // ---- Real estate ----
  double propertyPriceOf(String defId) => propertyPrices[defId] ?? 0;

  double get propertiesEquity {
    var sum = 0.0;
    for (final p in properties) {
      sum += p.equity;
    }
    return sum;
  }

  double get monthlyMortgageDue {
    var sum = 0.0;
    for (final p in properties) {
      if (!p.isPaidOff) sum += p.monthlyPayment;
    }
    return sum;
  }

  /// Total market value of owned property (before debt).
  double get propertyValue {
    var sum = 0.0;
    for (final p in properties) {
      sum += p.currentValue;
    }
    return sum;
  }

  /// Total outstanding mortgage debt (a liability).
  double get totalLoanBalance {
    var sum = 0.0;
    for (final p in properties) {
      sum += p.loanBalance;
    }
    return sum;
  }

  /// Buy a property with the chosen financing and down payment fraction.
  /// Returns an error string, or null on success.
  String? buyProperty(PropertyDef def, MortgageType m, double downFraction) {
    final price = propertyPriceOf(def.id);
    if (downFraction < minDownFraction - 1e-9) {
      return 'Minimum down payment is ${(minDownFraction * 100).toStringAsFixed(0)}%.';
    }
    if (downFraction > 1) downFraction = 1;
    final down = price * downFraction;
    if (down > cash + 0.01) return 'Not enough cash for the down payment.';

    final loan = price - down;
    final payment = mortgageMonthlyPayment(loan, m.annualRate, m.termMonths);
    if (loan > 0 && payment > job.pay * 0.45) {
      return 'Income too low to qualify — the payment would exceed 45% of '
          'your monthly pay. Earn more or put more down.';
    }

    cash -= down;
    properties.add(PropertyHolding(
      id: _nextPropertyId++,
      defId: def.id,
      currentValue: price,
      loanBalance: loan,
      monthlyPayment: payment,
      annualRate: m.annualRate,
      termMonths: m.termMonths,
      purchasePrice: price,
    ));
    _log('Bought ${def.name} for ${_usd(price)} '
        '(${(downFraction * 100).toStringAsFixed(0)}% down, ${m.name}).');
    notifyListeners();
    return null;
  }

  /// Sell a property: cash changes by its equity (you pay off the loan from the
  /// sale). Returns an error, or null on success.
  String? sellProperty(PropertyHolding h) {
    final equity = h.equity;
    if (equity < 0 && cash + equity < 0) {
      return 'This home is underwater — you need ${_usd(-equity)} cash to '
          'clear the loan on sale.';
    }
    cash += equity;
    properties.remove(h);
    _log('Sold ${Properties.byId(h.defId).name} for ${_usd(equity)} equity.');
    notifyListeners();
    return null;
  }

  String _usd(double v) => '\$${v.toStringAsFixed(0)}';

  /// Estimated income next day that isn't your salary (interest + dividends +
  /// bond coupons).
  double get dailyPassiveIncome {
    var sum = 0.0;
    for (final h in holdings) {
      if (h.isShort) continue;
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
      if (h.assetId == assetId &&
          h.kind != AssetKind.cd &&
          h.kind != AssetKind.fund &&
          !h.isShort) {
        return h;
      }
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
        // CD / yield fund: a fresh, individually-maturing position.
        holdings.add(Holding(
          id: _nextHoldingId++,
          assetId: def.id,
          kind: def.kind,
          balance: amount,
          costBasis: amount,
          openedDay: day,
          maturityDay: day + def.termDays,
          hardLock:
              def.kind == AssetKind.cd || def.lockKind == LockKind.hard,
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
    final def = Catalog.assetById(h.assetId);
    if (h.isLocked) {
      final monthsLeft = h.maturityDay - day;
      return 'Locked for $monthsLeft more month(s).';
    }
    final value = valueOf(h);
    final amt = max ? value : amount;
    if (amt <= 0) return 'Enter an amount greater than \$0.';
    if (amt > value + 0.01) {
      return 'You only have \$${value.toStringAsFixed(2)} in this position.';
    }

    final frac = amt / value;

    // Early-withdrawal penalty on penalty-lock funds before maturity.
    var penalty = 0.0;
    if (def.lockKind == LockKind.penalty && !h.matured) {
      final gainsWithdrawn = (h.balance - h.costBasis) * frac;
      if (gainsWithdrawn > 0) penalty = gainsWithdrawn * def.earlyPenalty;
    }

    if (h.kind.isInterestBearing) {
      h.balance -= amt;
    } else {
      h.shares -= h.shares * frac;
    }
    h.costBasis -= h.costBasis * frac;
    cash += amt - penalty;

    if (valueOf(h) <= 0.01) holdings.remove(h);

    _log('Sold \$${amt.toStringAsFixed(0)} of ${def.name}'
        '${penalty > 0 ? ' (−\$${penalty.toStringAsFixed(0)} early-exit fee)' : ''}.');
    notifyListeners();
    return null;
  }

  /// Open a short position with [amount] dollars of margin on a market-traded
  /// asset — you profit if the price falls, and get stopped out if it roughly
  /// doubles. Returns an error string, or null on success.
  String? short(AssetDef def, double amount) {
    if (!def.kind.isPriceBased) {
      return 'You can only short market-traded assets.';
    }
    if (amount <= 0) return 'Enter an amount greater than \$0.';
    if (amount > cash + 0.001) return 'Not enough cash for margin.';
    final price = priceOf(def.id);
    cash -= amount; // post margin
    holdings.add(Holding(
      id: _nextHoldingId++,
      assetId: def.id,
      kind: def.kind,
      shares: amount / price,
      costBasis: amount,
      openedDay: day,
      isShort: true,
      entryPrice: price,
    ));
    _log('Opened a \$${amount.toStringAsFixed(0)} short on ${def.name}.');
    notifyListeners();
    return null;
  }

  /// Close (cover) a short, returning its current value to cash.
  String? coverShort(Holding h) {
    if (!h.isShort) return 'Not a short position.';
    cash += valueOf(h);
    holdings.remove(h);
    _log('Covered short on ${Catalog.assetById(h.assetId).name}.');
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
      if ((h.kind == AssetKind.cd || h.kind == AssetKind.fund) &&
          h.maturityDay > 0 &&
          !h.matured &&
          day + 1 >= h.maturityDay) {
        h.matured = true;
        events.add(
            '${def.name} reached maturity — \$${h.balance.toStringAsFixed(0)} now free to withdraw.');
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

    // 4a2) Bond defaults: a shaky issuer can crater its price — far more likely
    //      when the economy sours. Hits every holder of that bond.
    for (final a in Catalog.assets) {
      if (!a.kind.isPriceBased || a.defaultRisk <= 0) continue;
      final mult = regime.isCrash
          ? 6.0
          : regime == MarketRegime.downturn
              ? 3.0
              : regime == MarketRegime.boom
                  ? 0.5
                  : 1.0;
      if (_rng.nextDouble() < a.defaultRisk * mult) {
        _prices[a.id] = _prices[a.id]! * 0.55;
        events.add(
            '⚠ ${a.name} issuer defaulted — bondholders took a ~45% hit.');
      }
    }

    // 4b) Downside risk on interest-bearing balances: a crash carves a slice
    //     off uninsured cash & yield funds (per-asset crashLoss); a bear market
    //     bleeds them mildly. Insured cash (crashLoss 0) is untouched.
    for (final h in holdings) {
      if (!h.kind.isInterestBearing) continue;
      final cl = Catalog.assetById(h.assetId).crashLoss;
      if (cl <= 0) continue;
      if (regime.isCrash) {
        h.balance *= (1 - cl);
      } else if (regime == MarketRegime.downturn) {
        h.balance *= (1 - cl * 0.12); // mild monthly bleed in a bear market
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

    // 4c) Margin call: a short that has lost all its margin is stopped out.
    holdings.removeWhere((h) {
      if (h.isShort && valueOf(h) <= 0.01) {
        events.add(
            '💥 Your short on ${Catalog.assetById(h.assetId).name} was stopped out.');
        return true;
      }
      return false;
    });

    // 5) Pay dividends + bond coupons into cash (after prices settle).
    var dividends = 0.0;
    for (final h in holdings) {
      if (h.isShort || !h.kind.isPriceBased) continue;
      final def = Catalog.assetById(h.assetId);
      if (def.incomeYield <= 0) continue;
      final pay = valueOf(h) * def.incomeYield / Catalog.stepsPerYear;
      cash += pay;
      dividends += pay;
    }

    // 5b) Real estate: appreciate listings + owned homes, then service loans.
    var mortgagePaid = 0.0;
    for (final pd in Properties.ladder) {
      final cur = propertyPrices[pd.id]!;
      final np = cur *
          (1 + pd.monthlyAppreciation + pd.monthlyVol * MarketEngine.gauss(_rng));
      propertyPrices[pd.id] = np < pd.basePrice * 0.2 ? pd.basePrice * 0.2 : np;
    }
    for (final h in properties) {
      final pd = Properties.byId(h.defId);
      final r = pd.monthlyAppreciation + pd.monthlyVol * MarketEngine.gauss(_rng);
      h.currentValue *= (1 + r);
      if (h.currentValue < 0) h.currentValue = 0;
      if (!h.isPaidOff) {
        final interest = h.loanBalance * (h.annualRate / 12);
        var principal = h.monthlyPayment - interest;
        if (principal > h.loanBalance) principal = h.loanBalance;
        if (principal < 0) principal = 0;
        final pay = interest + principal;
        h.loanBalance -= principal;
        cash -= pay;
        mortgagePaid += pay;
        h.monthsPaid += 1;
        if (h.isPaidOff) events.add('🏠 Paid off your ${pd.name}!');
      }
    }

    // 5c) Resolve sports bets, then post a fresh slate.
    for (final b in bets) {
      if (_rng.nextDouble() < b.winProb) {
        final payout = b.stake * b.decimalOdds;
        cash += payout;
        events.add(
            '🎉 Bet won: +\$${(payout - b.stake).toStringAsFixed(0)} on ${b.label}.');
      } else {
        events.add('❌ Bet lost: −\$${b.stake.toStringAsFixed(0)} on ${b.label}.');
      }
    }
    bets.clear();
    sportsSlate = SportsEngine.generateSlate(_rng, _nextEventId);
    _nextEventId += sportsSlate.length;

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
      mortgage: mortgagePaid,
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
