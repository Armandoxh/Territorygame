import 'dart:math';

import 'package:flutter/foundation.dart';

import '../data/catalog.dart';
import '../data/crises.dart';
import '../data/life.dart';
import '../data/properties.dart';
import '../engine/climate_engine.dart';
import '../engine/market_engine.dart';
import '../engine/news_engine.dart';
import '../engine/sports_engine.dart';
import '../models/asset.dart';
import '../models/bet.dart';
import '../models/climate.dart';
import '../models/crisis.dart';
import '../models/education.dart';
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
  final double rent; // rent collected from tenanted properties
  final double mortgage; // total mortgage payments made this month
  final double netWorthBefore;
  final double netWorthAfter;
  final double cashBefore;
  final double cashAfter;
  final double overdraftFee; // 10% penalty charged while in the red
  final bool marginCall; // 4th month in the red — UI forces a liquidation
  final bool crisis; // a decision event is pending — UI must resolve it
  final List<String> portfolioNotes; // shout-outs about your holdings & cash
  final List<String> events;

  const DayResult({
    required this.income,
    required this.expenses,
    required this.dividends,
    required this.interest,
    this.rent = 0,
    this.mortgage = 0,
    required this.netWorthBefore,
    required this.netWorthAfter,
    required this.cashBefore,
    required this.cashAfter,
    this.overdraftFee = 0,
    this.marginCall = false,
    this.crisis = false,
    this.portfolioNotes = const [],
    required this.events,
  });

  double get netWorthDelta => netWorthAfter - netWorthBefore;
  double get cashDelta => cashAfter - cashBefore;
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

  // ---- Cash discipline ----
  /// Consecutive months ended with negative cash. Months 1–3 cost an overdraft
  /// fee; month 4 triggers a margin call (the UI forces a liquidation).
  int monthsCashNegative = 0;

  /// Fee charged each grace month you're overdrawn, as a fraction of the debt.
  static const double overdraftFeeRate = 0.10;

  /// How many months you can run negative before the margin call hits.
  static const int overdraftGraceMonths = 3;

  /// Call after the player resolves a margin call (cash back to ≥ 0).
  void clearOverdraftStreak() {
    monthsCashNegative = 0;
    notifyListeners();
  }

  // ---- Crises / decisions ----
  /// A pending decision event the player must resolve (blocks fast-forward).
  CrisisEvent? pendingCrisis;

  /// Monthly chance a crisis fires (~one every 7-8 months) once you're settled.
  static const double crisisChance = 0.13;

  /// Apply the chosen option to the pending crisis and clear it. Returns the
  /// outcome line to show the player.
  String resolveCrisis(CrisisChoice choice) {
    final title = pendingCrisis?.title ?? 'Decision';
    final result = choice.apply(this, _rng);
    pendingCrisis = null;
    _log('$title — $result');
    notifyListeners();
    return result;
  }

  // ---- Life / events ----
  /// You can attend one life event per month for a market tip. Reset each month.
  bool attendedEventThisMonth = false;

  /// Pay to attend [e]; in return you pick up a targeted tip that lands in this
  /// month's edition of The Daily Ledger. One event per month. Returns an error
  /// string, or null on success.
  String? attendLifeEvent(LifeEvent e) {
    if (attendedEventThisMonth) {
      return "You've already been out this month — try again next month.";
    }
    if (e.cost > cash + 0.001) return 'Not enough cash.';
    cash -= e.cost;
    final tip = NewsEngine.insiderTip(_rng, day, e.tipKind, e.reliability);
    currentRumors = [tip, ...currentRumors];
    attendedEventThisMonth = true;
    _log('Went to ${e.name} (−\$${e.cost.toStringAsFixed(0)}) and picked up a tip.');
    notifyListeners();
    return null;
  }

  /// Assets the player could sell to raise cash in a margin call: any unlocked
  /// holding, plus any property with non-negative (affordable) equity.
  bool get hasLiquidatableAssets {
    for (final h in holdings) {
      if (h.isShort || !h.isLocked) return true;
    }
    for (final h in properties) {
      if (h.equity >= 0 || cash + h.equity >= 0) return true;
    }
    return false;
  }

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
  // Living expenses scale with take-home pay, so going part-time for school
  // also trims your lifestyle (a student lives leaner) — which keeps the
  // during-school squeeze survivable.
  double get dailyExpenses => Catalog.monthlyExpenses(ageYears, effectivePay);

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
      cash +
      holdingsValue +
      propertiesEquity +
      pendingBetsValue -
      studentLoan;

  // ---- Sports betting ----
  /// Open wagers, valued at their stake until they resolve next month.
  double get pendingBetsValue {
    var sum = 0.0;
    for (final b in bets) {
      sum += b.stake;
    }
    return sum;
  }

  /// Place [stake] on the home (or away) side of one event (a straight bet).
  String? placeBet(SportsEvent e, bool home, double stake) => placeParlay([
        ParlayLeg(
          eventId: e.id,
          label: '${home ? e.home : e.away} (vs ${home ? e.away : e.home})',
          decimalOdds: home ? e.homeDecimal : e.awayDecimal,
          winProb: home ? e.homeProb : 1 - e.homeProb,
        )
      ], stake);

  /// True if the player already has an open wager touching [eventId] — used to
  /// lock a game once it's been bet (you can only bet a game once).
  bool hasBetOn(int eventId) =>
      bets.any((b) => b.eventIds.contains(eventId));

  /// Place a wager across [legs]: one leg is a straight bet; 2+ legs is a
  /// parlay where every leg must hit (odds and the long-shot both multiply).
  String? placeParlay(List<ParlayLeg> legs, double stake) {
    if (legs.isEmpty) return 'Add at least one pick.';
    if (stake <= 0) return 'Enter a stake greater than \$0.';
    if (stake > cash + 0.001) return 'Not enough cash.';
    // One bet per game: a parlay can't double up a single matchup, and you
    // can't add a leg for a game you already have an open bet on. This stops
    // two wagers on the same game from resolving against each other.
    final seen = <int>{};
    for (final l in legs) {
      if (!seen.add(l.eventId)) return 'You can only pick each game once.';
      if (hasBetOn(l.eventId)) {
        return 'You already have a bet on that game — only one per game.';
      }
    }
    cash -= stake;
    var dec = 1.0;
    var prob = 1.0;
    for (final l in legs) {
      dec *= l.decimalOdds;
      prob *= l.winProb;
    }
    bets.add(PendingBet(
      id: _nextBetId++,
      legs: [for (final l in legs) l.label],
      eventIds: [for (final l in legs) l.eventId],
      stake: stake,
      decimalOdds: dec,
      winProb: prob,
    ));
    _log(legs.length == 1
        ? 'Placed \$${stake.toStringAsFixed(0)} on ${legs.first.label}.'
        : 'Placed a \$${stake.toStringAsFixed(0)} ${legs.length}-leg parlay.');
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

  /// Pay [amount] of cash straight onto a property's loan principal (or the
  /// whole balance if [max]). The monthly payment is unchanged — knocking down
  /// principal early just pays the loan off sooner. Returns an error, or null.
  String? payDownMortgage(PropertyHolding h, double amount, {bool max = false}) {
    if (h.isPaidOff) return 'This loan is already paid off.';
    final amt = max ? h.loanBalance : amount;
    if (amt <= 0) return 'Enter an amount greater than \$0.';
    if (amt > cash + 0.001) return 'Not enough cash.';
    final applied = amt > h.loanBalance ? h.loanBalance : amt;
    cash -= applied;
    h.loanBalance -= applied;
    if (h.loanBalance < 0.01) h.loanBalance = 0;
    final pd = Properties.byId(h.defId);
    _log(h.isPaidOff
        ? 'Paid off your ${pd.name} (−${_usd(applied)}). 🎉'
        : 'Paid ${_usd(applied)} toward your ${pd.name} loan.');
    notifyListeners();
    return null;
  }

  /// Chance a rented-out home has a paying tenant in any given month.
  static const double occupancyChance = 0.75;

  /// List a property for rent (or take it off the market). While rented, each
  /// month rolls for a tenant; when occupied, rent lands in cash and offsets a
  /// chunk of the mortgage. Taking it off the market clears any tenant.
  void toggleRental(PropertyHolding h) {
    h.rentedOut = !h.rentedOut;
    if (!h.rentedOut) h.occupied = false;
    final pd = Properties.byId(h.defId);
    _log(h.rentedOut
        ? 'Listed your ${pd.name} for rent.'
        : 'Took your ${pd.name} off the rental market.');
    notifyListeners();
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

  // ---- Education / careers ----
  /// Highest credential earned: 0 none, 1 associate, 2 bachelor, 3 master.
  int eduLevel = 0;

  /// The degree currently being studied (null = not enrolled).
  String? enrolledDegreeId;

  /// Months left until the enrolled degree completes.
  int enrollMonthsLeft = 0;

  /// Outstanding student-loan balance (compounds monthly until repaid).
  double studentLoan = 0;

  bool get isStudying => enrolledDegreeId != null;

  DegreeDef? get enrolledDegree {
    final id = enrolledDegreeId;
    if (id == null) return null;
    for (final d in Catalog.degrees) {
      if (d.id == id) return d;
    }
    return null;
  }

  /// Fraction of pay you keep while studying part-time.
  static const double partTimePayFraction = 0.6;

  /// Take-home pay this month — reduced to part-time while you're studying.
  double get effectivePay =>
      isStudying ? job.pay * partTimePayFraction : job.pay;

  bool meetsEducation(JobDef j) => eduLevel >= j.requiredEdu;

  /// Enroll in a degree: borrow the tuition as a student loan and start the
  /// clock. You keep working part-time. Returns an error, or null on success.
  String? enroll(DegreeDef d) {
    if (isStudying) return "You're already enrolled in a program.";
    if (eduLevel >= d.level) return 'You already hold this credential.';
    studentLoan += d.tuition;
    enrolledDegreeId = d.id;
    enrollMonthsLeft = d.months;
    _log('Enrolled in ${d.name} — borrowed ${_usd(d.tuition)}. '
        'You go part-time (half pay) for ${d.years} years.');
    notifyListeners();
    return null;
  }

  /// Pay [amount] of cash toward the student loan (or all of it if [max]).
  String? payStudentLoan(double amount, {bool max = false}) {
    if (studentLoan <= 0) return 'No student loan to pay.';
    final amt = max ? studentLoan : amount;
    if (amt <= 0) return 'Enter an amount greater than \$0.';
    if (amt > cash + 0.001) return 'Not enough cash.';
    final applied = amt > studentLoan ? studentLoan : amt;
    cash -= applied;
    studentLoan -= applied;
    if (studentLoan < 0.01) studentLoan = 0;
    _log('Paid ${_usd(applied)} toward your student loan.');
    notifyListeners();
    return null;
  }

  /// Switch to a different job from the ladder. Requires the credential.
  void takeJob(JobDef j) {
    if (j.id == job.id) return;
    if (!meetsEducation(j)) return; // UI prevents this, but guard anyway
    job = j;
    _log('New job: ${j.title} — \$${j.pay.toStringAsFixed(0)}/month.');
    notifyListeners();
  }

  List<JobDef> get availableJobs =>
      Catalog.jobs.where((j) => ageYears >= j.minAge && meetsEducation(j)).toList();

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
    final cashBefore = cash;
    attendedEventThisMonth = false; // a fresh month, a fresh night out
    final events = <String>[];

    // 1) Salary in (part-time pay while studying), living expenses out.
    final income = effectivePay;
    final expenses = dailyExpenses;
    cash += income;
    cash -= expenses;

    // 1b) Education: advance any degree in progress, and compound the loan.
    if (isStudying) {
      enrollMonthsLeft -= 1;
      if (enrollMonthsLeft <= 0) {
        final d = enrolledDegree!;
        eduLevel = eduLevel >= d.level ? eduLevel : d.level;
        enrolledDegreeId = null;
        enrollMonthsLeft = 0;
        events.add('🎓 You earned your ${d.name}! New careers are open.');
      }
    }
    if (studentLoan > 0) {
      studentLoan *= (1 + Catalog.studentLoanRate / Catalog.stepsPerYear);
    }

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
      if (a.safeHaven) {
        // Counter-cyclical: a bid in fear, a drag in greed (inverse to the
        // macro cycle instead of moving with it).
        if (regime.isCrash) {
          mb += 0.05;
        } else if (regime == MarketRegime.downturn) {
          mb += 0.015 * Catalog.driftStepFactor;
        } else if (regime == MarketRegime.boom) {
          mb -= 0.006 * Catalog.driftStepFactor;
        }
      } else {
        mb += regimeDrift * ClimateEngine.beta(a);
      }
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

    // 5b) Real estate: appreciate listings + owned homes, collect rent, then
    //     service loans.
    var mortgagePaid = 0.0;
    var rentCollected = 0.0;
    var rentedUnits = 0, occupiedUnits = 0;
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
      // Rent: a listed home finds a tenant most (not all) months; when occupied
      // the rent lands in cash and helps cover the mortgage.
      if (h.rentedOut) {
        rentedUnits += 1;
        h.occupied = _rng.nextDouble() < occupancyChance;
        if (h.occupied) {
          cash += h.monthlyRent;
          rentCollected += h.monthlyRent;
          occupiedUnits += 1;
        }
      } else {
        h.occupied = false;
      }
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
    if (rentedUnits > 0) {
      events.add(rentCollected > 0
          ? '🔑 Rent collected: +\$${rentCollected.toStringAsFixed(0)} '
              '($occupiedUnits of $rentedUnits unit${rentedUnits == 1 ? '' : 's'} occupied).'
          : '🔑 No rent this month — your rental${rentedUnits == 1 ? ' sat' : 's sat'} vacant.');
    }

    // 5c) Resolve sports bets, then post a fresh slate.
    for (final b in bets) {
      if (_rng.nextDouble() < b.winProb) {
        final payout = b.stake * b.decimalOdds;
        cash += payout;
        events.add(
            '🎉 Bet won: +\$${(payout - b.stake).toStringAsFixed(0)} on ${b.title}.');
      } else {
        events.add('❌ Bet lost: −\$${b.stake.toStringAsFixed(0)} on ${b.title}.');
      }
    }
    bets.clear();
    sportsSlate = SportsEngine.generateSlate(_rng, _nextEventId);
    _nextEventId += sportsSlate.length;

    // 5d) Cash discipline. Three grace months in the red each cost a 10%
    //     overdraft fee; the 4th flips a margin call that the UI turns into a
    //     forced liquidation (sell investments or real estate to get to ≥ $0).
    var overdraftFee = 0.0;
    var marginCall = false;
    if (cash < -0.01) {
      monthsCashNegative += 1;
      if (monthsCashNegative > overdraftGraceMonths) {
        marginCall = true;
        events.add(
            '🚨 MARGIN CALL — $monthsCashNegative months in the red. You must '
            'liquidate assets to get back above \$0.');
      } else {
        overdraftFee = (-cash) * overdraftFeeRate;
        cash -= overdraftFee;
        events.add(
            '🏦 Overdraft fee −\$${overdraftFee.toStringAsFixed(0)} '
            '(month $monthsCashNegative of $overdraftGraceMonths overdrawn — '
            'clear it or face a margin call).');
      }
    } else {
      monthsCashNegative = 0;
    }

    // Portfolio shout-outs: your biggest mover this month, and a nudge if a lot
    // of cash is sitting idle. Built from the pre-/post-step prices above.
    final portfolioNotes = _portfolioNotes();

    // 6) Tick the clock; birthday on year boundaries.
    final hadBirthday = (day + 1) % Catalog.stepsPerYear == 0;
    day += 1;
    if (hadBirthday) {
      events.add('🎂 Happy birthday — you are now $ageYears.');
      _purchasedThisYear.clear(); // annual purchase caps reset each year
    }

    // 6b) Life happens: occasionally a crisis/decision interrupts. Settle in
    //     for a few months first, and never stack two at once.
    var crisisTriggered = false;
    if (pendingCrisis == null && day > 6 && _rng.nextDouble() < crisisChance) {
      pendingCrisis = Crises.pick(this, _rng);
      crisisTriggered = pendingCrisis != null;
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
      rent: rentCollected,
      mortgage: mortgagePaid,
      netWorthBefore: before,
      netWorthAfter: after,
      cashBefore: cashBefore,
      cashAfter: cash,
      overdraftFee: overdraftFee,
      marginCall: marginCall,
      crisis: crisisTriggered,
      portfolioNotes: portfolioNotes,
      events: events,
    );

    for (final e in events) {
      _log(e);
    }
    _log('Month ${day}: net worth \$${after.toStringAsFixed(0)} (${after - before >= 0 ? '+' : ''}\$${(after - before).toStringAsFixed(0)}).');

    notifyListeners();
    return summary;
  }

  /// Fast-forward [n] months, actually running each one through [advanceDay]
  /// (markets move, interest/rent/coupons accrue, the loan compounds — every
  /// calculation is the real monthly one). Sums the months into a single recap.
  /// Stops early if a margin call fires, since you must resolve that by hand.
  /// Returns the aggregated result and how many months actually elapsed.
  ({DayResult result, int months}) advanceMonths(int n) {
    final before = netWorth;
    final cashStart = cash;
    var income = 0.0,
        expenses = 0.0,
        interest = 0.0,
        dividends = 0.0,
        rent = 0.0,
        mortgage = 0.0,
        fee = 0.0;
    final events = <String>[];
    var marginCall = false;
    var crisis = false;
    var done = 0;
    for (var i = 0; i < n; i++) {
      final r = advanceDay();
      income += r.income;
      expenses += r.expenses;
      interest += r.interest;
      dividends += r.dividends;
      rent += r.rent;
      mortgage += r.mortgage;
      fee += r.overdraftFee;
      events.addAll(r.events);
      done++;
      if (r.marginCall) marginCall = true;
      if (r.crisis) crisis = true;
      // A margin call or a pending decision must be handled before going on.
      if (r.marginCall || r.crisis) break;
    }
    final agg = DayResult(
      income: income,
      expenses: expenses,
      interest: interest,
      dividends: dividends,
      rent: rent,
      mortgage: mortgage,
      overdraftFee: fee,
      marginCall: marginCall,
      crisis: crisis,
      netWorthBefore: before,
      netWorthAfter: netWorth,
      cashBefore: cashStart,
      cashAfter: cash,
      events: events,
    );
    return (result: agg, months: done);
  }

  /// Human-readable call-outs about the portfolio for the monthly recap: the
  /// biggest dollar winner and loser among market holdings, and a nudge when a
  /// lot of cash is sitting idle instead of working.
  List<String> _portfolioNotes() {
    final notes = <String>[];

    Holding? topWin, topLoss;
    var topWinAmt = 0.0, topLossAmt = 0.0;
    for (final h in holdings) {
      if (h.kind.isInterestBearing) continue;
      final p0 = _prevPrices[h.assetId];
      final p1 = _prices[h.assetId];
      if (p0 == null || p1 == null || p0 <= 0) continue;
      final delta = h.shares * (h.isShort ? (p0 - p1) : (p1 - p0));
      if (delta > topWinAmt) {
        topWinAmt = delta;
        topWin = h;
      }
      if (delta < topLossAmt) {
        topLossAmt = delta;
        topLoss = h;
      }
    }

    String pct(Holding h) {
      final p0 = _prevPrices[h.assetId]!;
      final p1 = _prices[h.assetId]!;
      final v = ((p1 - p0) / p0) * (h.isShort ? -1 : 1) * 100;
      return '${v >= 0 ? '+' : ''}${v.toStringAsFixed(1)}%';
    }

    if (topWin != null && topWinAmt > 1) {
      final def = Catalog.assetById(topWin.assetId);
      final tag = topWin.isShort ? ' short' : '';
      notes.add('📈 Your ${def.ticker}$tag was the top gainer this month: '
          '${pct(topWin)} (+\$${topWinAmt.toStringAsFixed(0)}).');
    }
    if (topLoss != null && topLossAmt < -1) {
      final def = Catalog.assetById(topLoss.assetId);
      final tag = topLoss.isShort ? ' short' : '';
      notes.add('📉 Your ${def.ticker}$tag dragged the most: '
          '${pct(topLoss)} (−\$${(-topLossAmt).toStringAsFixed(0)}).');
    }

    // Idle-cash nudge: lots of cash, little invested. Only when solidly positive.
    final runway = dailyExpenses * 3;
    if (cash > runway && holdingsValue < cash * 0.5 && cash > 1000) {
      notes.add('💤 \$${cash.toStringAsFixed(0)} is sitting in cash earning '
          'little — put more of it to work in Sherwood.');
    }

    return notes;
  }

  void _log(String message) {
    eventLog.insert(0, message);
    if (eventLog.length > 40) eventLog.removeLast();
  }
}
