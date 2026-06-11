import 'dart:math';

import 'package:flutter/foundation.dart';

import '../data/businesses.dart';
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
import '../models/business.dart';
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
  final double tax; // income tax withheld on wages this month
  final double businessIncome; // net profit from operating businesses
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
    this.tax = 0,
    this.businessIncome = 0,
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
/// A lingering consequence of a decision — e.g. "no salary for 3 months" after
/// taking a severance, or a recurring obligation. Ticks down each month.
class OngoingEffect {
  final String label;
  int monthsLeft;

  /// Cash drained each month while active (0 for a pure income suspension).
  final double monthlyCost;

  /// While active, your salary is suppressed to $0.
  final bool suspendsIncome;

  OngoingEffect({
    required this.label,
    required this.monthsLeft,
    this.monthlyCost = 0,
    this.suspendsIncome = false,
  });
}

/// Your relationship arc: single → dating → partnered → married. A partner
/// brings a second (take-home) income; marriage and kids are milestones that
/// cost money but build your social standing.
enum RelationshipStage { single, dating, partnered, married }

class GameController extends ChangeNotifier {
  final Random _rng;

  /// A dedicated stream for housing-price volatility, kept SEPARATE from [_rng]
  /// so adding property types (more per-def price draws each month) never
  /// perturbs the market / crisis / bet sequence. Deterministic per seed.
  final Random _housingRng;

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

  // ---- Operating businesses ----
  final List<BusinessHolding> businesses = [];
  int _nextBizId = 1;

  /// A dedicated RNG for business profit noise + failure rolls, kept SEPARATE
  /// from [_rng] so owning businesses never perturbs the market/crisis stream.
  final Random _bizRng;

  /// How many businesses you can personally run well; beyond this, UNMANAGED
  /// businesses run at reduced efficiency (you're spread thin). Hire managers
  /// to scale past it.
  static const int activeBusinessLimit = 2;

  /// Flat ordinary-income tax rate on business profit.
  static const double businessTaxRate = 0.22;

  // ---- Sports betting ----
  List<SportsEvent> sportsSlate = [];

  /// Pre-built featured/boosted parlays shown at the top of the book.
  List<FeaturedParlay> featuredParlays = [];
  final List<PendingBet> bets = [];

  // ---- Betting record (hit-rate feed) ----
  int betsSettled = 0;
  int betsWon = 0;
  double betStaked = 0;
  double betReturned = 0;

  /// Most-recent settled wagers first (capped).
  final List<BetResult> betHistory = [];
  int _nextEventId = 1;
  int _nextBetId = 1;

  // ---- Cash discipline ----
  /// Consecutive months ended with negative cash. Months 1–3 cost an overdraft
  /// fee; month 4 triggers a margin call (the UI forces a liquidation).
  int monthsCashNegative = 0;

  /// Fee charged each grace month you're overdrawn, as a fraction of the debt.
  /// Deliberately modest — it should sting, not snowball. (It used to be 10%,
  /// which compounded brutally once you fell behind.)
  static const double overdraftFeeRate = 0.05;

  /// A single month's overdraft fee is capped at this share of (positive) net
  /// worth, so an asset-rich but cash-light player who's just rearranging funds
  /// can't be gouged by a fee scaled off a large temporary shortfall.
  static const double overdraftFeeMaxNwShare = 0.02;

  /// How many months you can run negative before the margin call hits.
  static const int overdraftGraceMonths = 3;

  /// Call after the player resolves a margin call (cash back to ≥ 0).
  void clearOverdraftStreak() {
    monthsCashNegative = 0;
    notifyListeners();
  }

  // ---- Bankruptcy: the real failure state ----
  /// How many times you've gone bankrupt — a permanent mark on this life.
  int bankruptcies = 0;

  /// Day index until which a recent bankruptcy bars you from new financing —
  /// 7 years, like a real Chapter 7 staying on your credit report.
  int creditBlackMarkUntilDay = 0;
  static const int bankruptcyCreditMonths = 84;

  bool get hasBankruptcyMark => day < creditBlackMarkUntilDay;
  int get bankruptcyMonthsLeft =>
      hasBankruptcyMark ? creditBlackMarkUntilDay - day : 0;

  /// You're at a margin call you can't dig out of: nothing left to liquidate
  /// and underwater. The margin-call dialog offers bankruptcy here.
  bool get faceBankruptcy =>
      !hasLiquidatableAssets && cash < -0.01 && netWorth < 0;

  /// Chapter 7. Assets are liquidated/repossessed and unsecured debt is
  /// discharged — but you lose everything you built and carry a 7-year credit
  /// black mark that bars new mortgages. Your 401(k) is protected and student
  /// loans survive (as in real life), so the hole isn't magically zeroed.
  void declareBankruptcy() {
    holdings.clear();
    properties.clear();
    businesses.clear();
    debt = 0; // unsecured consumer debt is discharged
    cash = 0;
    monthsCashNegative = 0;
    bankruptcies += 1;
    creditBlackMarkUntilDay = day + bankruptcyCreditMonths;
    _log('💥 BANKRUPTCY filed. Everything you built was liquidated and your '
        'consumer debt wiped. You keep your job, your protected 401(k), and '
        '(unfortunately) your student loans — and a 7-year mark now bars you '
        'from financing. Rebuild from here.');
    notifyListeners();
  }

  // ---- Family & relationships ----
  /// Where you are in your relationship arc.
  RelationshipStage relationship = RelationshipStage.single;

  /// Dates been on while single/dating — progress toward a steady partner.
  int datesBeen = 0;

  /// How many kids you're raising. Each adds a monthly cost.
  int children = 0;

  /// Social standing ("connections") — points that gate which rooms you can get
  /// into and how good the intel is. Built by going out, marrying, and family
  /// milestones.
  int socialStanding = 0;

  static const double dateCost = 200;
  static const int datesToPartner = 3;
  static const double weddingCost = 8000;
  static const double childUpfrontCost = 3000;
  static const double childMonthlyCost = 650;
  static const int maxChildren = 4;

  /// Your partner's take-home contribution each month (0 if you're not with
  /// someone). Scales mildly with your own career (assortative) but has a floor
  /// so it matters from early on, and a cap so it never dwarfs late-game play.
  double get partnerMonthlyIncome {
    switch (relationship) {
      case RelationshipStage.partnered:
        return (0.20 * job.pay).clamp(1800, 12000).toDouble();
      case RelationshipStage.married:
        return (0.28 * job.pay).clamp(2800, 12000).toDouble();
      case RelationshipStage.single:
      case RelationshipStage.dating:
        return 0;
    }
  }

  /// Monthly cost of raising your kids, on top of your own living expenses.
  double get childcareCost => children * childMonthlyCost;

  bool get hasPartner =>
      relationship == RelationshipStage.partnered ||
      relationship == RelationshipStage.married;

  /// Standing you get just from how you live: a nice home and car read as
  /// "successful" and open doors without grinding the event circuit.
  int get lifestyleStanding =>
      (housing?.standingBonus ?? 0) + (transport?.standingBonus ?? 0);

  /// Total social standing = connections you've earned (events, marriage,
  /// family) + the standing your lifestyle buys you.
  int get totalStanding => socialStanding + lifestyleStanding;

  /// Social-standing tier (0–3): Newcomer / Connected / Well-connected / Inner
  /// circle. Higher tiers open exclusive event rooms and sharpen every tip.
  int get standingTier {
    if (totalStanding >= 30) return 3;
    if (totalStanding >= 15) return 2;
    if (totalStanding >= 5) return 1;
    return 0;
  }

  String get standingLabel => const [
        'Newcomer',
        'Connected',
        'Well-connected',
        'Inner circle',
      ][standingTier];

  /// Go out and meet people. Costs cash; after a few dates you settle into a
  /// relationship (and gain a second income).
  String? goOnDate() {
    if (hasPartner) return "You're already with someone.";
    if (dateCost > cash + 0.001) return 'Not enough cash for a night out.';
    cash -= dateCost;
    datesBeen += 1;
    socialStanding += 1;
    if (relationship == RelationshipStage.single) {
      relationship = RelationshipStage.dating;
    }
    if (datesBeen >= datesToPartner &&
        relationship == RelationshipStage.dating) {
      relationship = RelationshipStage.partnered;
      _log('💑 You and your date are official — a second income starts coming '
          'in.');
    } else {
      _log('🌹 Went on a date (−\$${dateCost.toStringAsFixed(0)}).');
    }
    notifyListeners();
    return null;
  }

  /// Tie the knot. A wedding costs cash but is a big social-standing boost (and
  /// bumps your partner's commitment — and income).
  String? proposeMarriage() {
    if (relationship == RelationshipStage.married) {
      return "You're already married.";
    }
    if (relationship != RelationshipStage.partnered) {
      return 'Find a steady partner first.';
    }
    if (weddingCost > cash + 0.001) {
      return 'A wedding runs ${_usd(weddingCost)} — save up first.';
    }
    cash -= weddingCost;
    relationship = RelationshipStage.married;
    socialStanding += 8;
    _log('💍 You got married (−\$${weddingCost.toStringAsFixed(0)}).');
    notifyListeners();
    return null;
  }

  /// Have a child. A one-time cost now, then a monthly bill until they're grown.
  String? haveChild() {
    if (!hasPartner) return 'You need a partner first.';
    if (children >= maxChildren) return 'Your hands are full already.';
    if (childUpfrontCost > cash + 0.001) {
      return 'A new arrival costs ${_usd(childUpfrontCost)} up front.';
    }
    cash -= childUpfrontCost;
    children += 1;
    socialStanding += 1;
    _log('👶 Welcome to the family — kid #$children. '
        '(−\$${childUpfrontCost.toStringAsFixed(0)}, now '
        '${_usd(childcareCost)}/mo.)');
    notifyListeners();
    return null;
  }

  // ---- Lifestyle: housing & transport ----
  /// null = let it follow your income automatically (lifestyle creep, the old
  /// behavior); a non-null id pins a fixed tier you've chosen.
  String? housingChoiceId;
  String? transportChoiceId;

  HousingOption? get housing =>
      housingChoiceId == null ? null : LifeData.housingById(housingChoiceId!);
  TransportOption? get transport => transportChoiceId == null
      ? null
      : LifeData.transportById(transportChoiceId!);

  /// The income-tracking default cost of each — what's already baked into
  /// [dailyExpenses] via its housing/transport shares.
  double get autoHousingCost => dailyExpenses * LifeData.housingShare;
  double get autoTransportCost => dailyExpenses * LifeData.transportShare;

  /// What you actually pay this month (a chosen tier, else the income default).
  double get housingCost => housing?.monthlyCost ?? autoHousingCost;
  double get transportCost => transport?.monthlyCost ?? autoTransportCost;

  /// How a chosen tier shifts your monthly outflow vs. just following income.
  double get lifestyleExpenseDelta =>
      (housingCost - autoHousingCost) + (transportCost - autoTransportCost);

  void chooseHousing(String? id) {
    housingChoiceId = id;
    notifyListeners();
  }

  void chooseTransport(String? id) {
    transportChoiceId = id;
    notifyListeners();
  }

  // ---- Crises / decisions ----
  /// A pending decision event the player must resolve (blocks fast-forward).
  CrisisEvent? pendingCrisis;

  /// IDs of the most-recently-fired crises (oldest first). The picker skips
  /// these so the same decision doesn't resurface back-to-back — the main
  /// reason the event stream used to feel repetitive. Trimmed to the last
  /// [_crisisMemory] entries.
  final List<String> recentCrisisIds = [];

  /// How many recent crises to remember and avoid repeating. Kept comfortably
  /// below the eligible pool so there's always something fresh to draw.
  static const int _crisisMemory = 8;

  /// Monthly chance a crisis fires (~one every 7-8 months) once you're settled.
  static const double crisisChance = 0.13;

  /// Master switch for the crisis/decision stream. Always true in normal play;
  /// the balance harness flips it off to A/B-measure how much life events drag
  /// on wealth. Gated so the trigger RNG is still consumed identically either
  /// way, keeping default behavior unchanged.
  bool crisesEnabled = true;

  /// Crisis cost tuning (read by Crises._scaled). [crisisCostScale] dampens how
  /// hard net-worth-scaled events hit (1.0 = legacy); [crisisMaxCashShare] caps
  /// any single event at this fraction of cash on hand, so a popup can sting but
  /// never wipe an asset-rich, cash-light player (the age-45+ "it took half my
  /// cash" problem). The balance harness sweeps these to tune them.
  double crisisCostScale = 0.55;
  double crisisMaxCashShare = 0.30;

  /// Hard ceiling: once you're past ~$100k net worth, a single crisis never
  /// costs more than this share of net worth — applied even in overdraft, so a
  /// cash-light or leveraged player can't be gouged. (Events used to scale up
  /// to ~18% of net worth.)
  double crisisMaxNetWorthShare = 0.06;

  /// Lingering consequences of past decisions (e.g. unpaid leave after a
  /// severance). Each ticks down monthly in [advanceDay].
  final List<OngoingEffect> ongoing = [];

  /// Go [months] without a salary — the consequence of taking a buyout, a
  /// sabbatical, an injury, etc. (Used by crisis-event choices.)
  void takeUnpaidLeave(int months, String reason) {
    ongoing.add(OngoingEffect(
        label: reason, monthsLeft: months, suspendsIncome: true));
  }

  /// Take on a recurring monthly obligation (alimony, support, a lease) that
  /// drains [monthlyCost] for [months]. (Used by crisis-event choices.)
  void addObligation(String label, double monthlyCost, int months) {
    ongoing.add(OngoingEffect(
        label: label, monthsLeft: months, monthlyCost: monthlyCost));
  }

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

  /// A deep clone of the economic state, for what-if lookahead in the balance
  /// harness — try a decision (resolve a crisis, advance a few months) on the
  /// copy without touching the live game. The clone gets a fresh RNG seeded by
  /// [rngSeed], so sibling clones that share a seed evolve down the SAME market
  /// path; the only difference between them is the choice under test. Crises
  /// are disabled on the clone so the lookahead can't spawn its own popups.
  /// Not used in normal play.
  GameController cloneForLookahead(int rngSeed) {
    final c = GameController(seed: rngSeed, prestige: prestige)
      ..crisesEnabled = false
      ..crisisCostScale = crisisCostScale
      ..crisisMaxCashShare = crisisMaxCashShare
      ..crisisMaxNetWorthShare = crisisMaxNetWorthShare
      ..day = day
      ..cash = cash
      ..job = job
      ..monthsCashNegative = monthsCashNegative
      ..regime = regime
      ..sectorEvent = sectorEvent
      ..mortgageRate = mortgageRate
      ..housingTrend = housingTrend
      ..eduLevel = eduLevel
      ..currentTrackId = currentTrackId
      ..rungIndex = rungIndex
      ..monthsInRung = monthsInRung
      ..enrolledDegreeId = enrolledDegreeId
      ..enrollMonthsLeft = enrollMonthsLeft
      ..studentLoan = studentLoan
      ..studentLoanPayment = studentLoanPayment
      ..retirementBalance = retirementBalance
      ..retirementContribPct = retirementContribPct
      ..debt = debt
      ..attendedEventThisMonth = attendedEventThisMonth
      .._nextPropertyId = _nextPropertyId
      .._nextHoldingId = _nextHoldingId
      .._nextEventId = _nextEventId
      .._nextBetId = _nextBetId
      ..betsSettled = betsSettled
      ..betsWon = betsWon
      ..betStaked = betStaked
      ..betReturned = betReturned;
    c._prices
      ..clear()
      ..addAll(_prices);
    c._prevPrices
      ..clear()
      ..addAll(_prevPrices);
    c.propertyPrices
      ..clear()
      ..addAll(propertyPrices);
    c.priceHistory
      ..clear()
      ..addAll({
        for (final e in priceHistory.entries) e.key: List<double>.of(e.value),
      });
    c._purchasedThisYear
      ..clear()
      ..addAll(_purchasedThisYear);
    c.holdings
      ..clear()
      ..addAll([for (final h in holdings) h.clone()]);
    c.properties
      ..clear()
      ..addAll([for (final p in properties) p.clone()]);
    c.businesses
      ..clear()
      ..addAll([for (final b in businesses) b.clone()]);
    c._nextBizId = _nextBizId;
    c.ongoing
      ..clear()
      ..addAll([
        for (final e in ongoing)
          OngoingEffect(
            label: e.label,
            monthsLeft: e.monthsLeft,
            monthlyCost: e.monthlyCost,
            suspendsIncome: e.suspendsIncome,
          ),
      ]);
    c.bets
      ..clear()
      ..addAll(bets); // PendingBet is read-only once placed
    c.betHistory
      ..clear()
      ..addAll(betHistory);
    c.completedDegrees
      ..clear()
      ..addAll(completedDegrees);
    return c;
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
    if (standingTier < e.minTier) {
      return 'That room is invite-only — build your social standing first.';
    }
    if (e.cost > cash + 0.001) return 'Not enough cash.';
    cash -= e.cost;
    // Better-connected players read the room better: each standing tier sharpens
    // the intel. (Same number of RNG draws, so the rest of the sim is unaffected.)
    final reliability =
        (e.reliability + standingTier * 0.03).clamp(0.0, 0.92).toDouble();
    final tip = NewsEngine.insiderTip(_rng, day, e.tipKind, reliability);
    currentRumors = [tip, ...currentRumors];
    attendedEventThisMonth = true;
    socialStanding += 1; // every outing widens your circle
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

  /// This week's shared market shock (the common factor every risk asset rides,
  /// scaled by its beta). Positive = a risk-on week, negative = risk-off. The
  /// Comex UI reads it to show market sentiment. Cosmetic snapshot.
  double lastMarketFactor = 0.0;

  // ---- Housing market ----
  /// The live benchmark 30-year mortgage rate. It floats over the game; new
  /// purchases and refinances price off it. A separate cycle from the stock
  /// [regime] — cheap money heats housing, rate shocks cool it.
  double mortgageRate = Properties.baseRate;

  /// Slow-moving extra monthly appreciation shared by every home — the housing
  /// cycle. Positive = boom, negative = correction. Partly driven by rates.
  double housingTrend = 0.0;

  /// A one-word read on the housing market, for the Ledger and Nestly.
  String get housingMarketLabel {
    if (housingTrend > 0.004) return 'Hot';
    if (housingTrend > 0.0015) return 'Warm';
    if (housingTrend < -0.004) return 'Crashing';
    if (housingTrend < -0.0015) return 'Cooling';
    return 'Steady';
  }

  /// The rate you'd actually get on [m] right now: the floating benchmark plus
  /// the product's spread vs. the baseline (a 15-yr undercuts a 30-yr).
  double effectiveMortgageRate(MortgageType m) =>
      (mortgageRate + (m.annualRate - Properties.baseRate)).clamp(0.01, 0.2);

  /// Advance the housing market a month: float the mortgage rate (mean-
  /// reverting, bounded) and the appreciation cycle (cheap money heats it),
  /// posting a Ledger headline when the weather turns.
  void _tickHousingMarket(List<String> events) {
    final prevLabel = housingMarketLabel;
    mortgageRate += MarketEngine.gauss(_rng) * 0.0018 +
        (Properties.baseRate - mortgageRate) * 0.04;
    mortgageRate = mortgageRate.clamp(Properties.minRate, Properties.maxRate);
    final rateEffect = (Properties.baseRate - mortgageRate) * 0.03;
    housingTrend +=
        MarketEngine.gauss(_rng) * 0.0012 + rateEffect - housingTrend * 0.05;
    if (housingTrend > 0.008) housingTrend = 0.008;
    if (housingTrend < -0.008) housingTrend = -0.008;
    final label = housingMarketLabel;
    if (label != prevLabel) {
      events.add('🏘️ Housing market: $label · 30-yr rate '
          '${(mortgageRate * 100).toStringAsFixed(1)}%.');
    }
  }

  /// Dollars bought this in-game year of capped assets (e.g. I Bonds). Reset
  /// every birthday.
  final Map<String, double> _purchasedThisYear = {};

  int _nextHoldingId = 1;

  /// How many times the player has retired and started over. Higher prestige
  /// unlocks more content (assets, jobs). Carried into each new life.
  final int prestige;

  /// Net worth at which you're allowed to retire and start a fresh life.
  static const double retireThreshold = 1000000;

  bool get canRetire => netWorth >= retireThreshold;

  GameController({int? seed, this.prestige = 0})
      : _rng = Random(seed ?? DateTime.now().millisecondsSinceEpoch),
        _housingRng =
            Random((seed ?? DateTime.now().millisecondsSinceEpoch) ^ 0x5DEECE66),
        _bizRng =
            Random((seed ?? DateTime.now().millisecondsSinceEpoch) ^ 0x1F123BB5),
        cash = Catalog.startingCash,
        job = Catalog.startingJob {
    currentTrackId = Catalog.startingTrackId; // begin in the service track
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
    // Use a SIDE rng (seeded off the slate) so building these cosmetic parlay
    // groupings never perturbs the main _rng stream that drives markets,
    // crises, and bet resolution — keeping the game deterministic per seed.
    featuredParlays =
        SportsEngine.featuredParlays(sportsSlate, Random(_nextEventId));
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

  /// Total unrealized gain/loss across all current holdings (vs cost basis).
  double get portfolioUnrealizedPnl {
    var sum = 0.0;
    for (final h in holdings) {
      sum += profitOf(h);
    }
    return sum;
  }

  /// Expected rent reaching cash per month: occupied rent across listed rentals,
  /// haircut by each one's occupancy odds.
  double get expectedMonthlyRent {
    var sum = 0.0;
    for (final p in properties) {
      if (p.rentedOut) sum += p.monthlyRent * p.occupancy;
    }
    return sum;
  }

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
      pendingBetsValue +
      retirementBalance +
      businessesValue -
      studentLoan -
      debt;

  // ---- Operating businesses ----
  /// Enterprise value of one business: annual run-rate profit × its multiple.
  double businessValue(BusinessHolding h) =>
      h.monthlyProfit * 12 * Businesses.byId(h.defId).saleMultiple;

  /// Total enterprise value across all owned businesses.
  double get businessesValue {
    var sum = 0.0;
    for (final b in businesses) {
      sum += businessValue(b);
    }
    return sum;
  }

  /// Businesses you're running yourself (no manager).
  int get _unmanagedCount => businesses.where((b) => !b.managed).length;

  /// Efficiency multiplier on unmanaged businesses — drops below 1 when you run
  /// more than [activeBusinessLimit] yourself (spread too thin).
  double get _attentionFactor {
    final n = _unmanagedCount;
    return n <= activeBusinessLimit ? 1.0 : activeBusinessLimit / n;
  }

  /// Expected run-rate business profit per month (after manager cuts and the
  /// attention penalty, before tax and cycle noise) — for the dashboard P&L.
  double get expectedMonthlyBusinessIncome {
    if (businesses.isEmpty) return 0;
    final attn = _attentionFactor;
    var sum = 0.0;
    for (final b in businesses) {
      final def = Businesses.byId(b.defId);
      sum += b.managed
          ? b.monthlyProfit * (1 - def.managerCut)
          : b.monthlyProfit * attn;
    }
    return sum;
  }

  /// Efficiency on unmanaged businesses right now (1.0 = full), for the UI.
  double get businessAttention => _attentionFactor;

  /// Whether you're running more businesses yourself than you can handle well.
  bool get businessesOverextended => _unmanagedCount > activeBusinessLimit;

  /// Buy/start a business for cash.
  String? buyBusiness(BusinessDef def) {
    if (def.price > cash + 0.01) return 'Not enough cash to start ${def.name}.';
    cash -= def.price;
    businesses.add(BusinessHolding(
      id: _nextBizId++,
      defId: def.id,
      monthlyProfit: def.baseMonthlyProfit,
      purchasePrice: def.price,
      name: Businesses.randomName(_bizRng, def),
    ));
    _log('Opened ${def.name} for ${_usd(def.price)}.');
    notifyListeners();
    return null;
  }

  /// Expand a business: spend cash to permanently raise its run-rate profit,
  /// roughly at the buy multiple (so value ≈ holds), with diminishing returns
  /// and execution luck. Returns an error, or null.
  String? expandBusiness(BusinessHolding h, double budget) {
    if (budget <= 0) return 'Enter an amount greater than \$0.';
    if (budget > cash + 0.01) return 'Not enough cash for that expansion.';
    final def = Businesses.byId(h.defId);
    // You can roughly double a business via expansion before it saturates.
    final saturation =
        (h.investedCapital / h.purchasePrice).clamp(0.0, 1.0).toDouble();
    final luck = 0.7 + _bizRng.nextDouble() * 0.5; // 0.7–1.2× execution
    final addedProfit =
        budget / (def.saleMultiple * 12) * (1 - 0.6 * saturation) * luck;
    cash -= budget;
    h.monthlyProfit += addedProfit;
    h.investedCapital += budget;
    _log('Expanded ${h.name}: ${_usd(budget)} in, +${_usd(addedProfit)}/mo '
        'profit.');
    notifyListeners();
    return null;
  }

  /// Hire or fire a manager. A manager makes the business passive (no attention
  /// penalty) but skims [BusinessDef.managerCut] of its profit.
  void toggleManager(BusinessHolding h) {
    h.managed = !h.managed;
    _log(h.managed
        ? 'Hired a manager for ${h.name} — it runs itself now (they take a cut).'
        : 'Took ${h.name} back under your own management.');
    notifyListeners();
  }

  /// Sell a business at its enterprise value, minus a 4% broker fee and capital-
  /// gains tax on the profit over your cost basis.
  String? sellBusiness(BusinessHolding h) {
    final value = businessValue(h);
    const brokerFee = 0.04;
    final proceeds = value * (1 - brokerFee);
    final gain = proceeds - h.costBasis;
    final capGainsTax = gain > 0 ? gain * Catalog.capitalGainsRate : 0.0;
    cash += proceeds - capGainsTax;
    businesses.remove(h);
    _log('Sold ${h.name} for ${_usd(value)} '
        '(−${_usd(value * brokerFee)} broker fee'
        '${capGainsTax > 0 ? ', −${_usd(capGainsTax)} capital-gains tax' : ''}).');
    notifyListeners();
    return null;
  }

  // ---- Retirement (401k-style) ----
  /// Balance in your locked retirement account. Grows on autopilot in a
  /// target-date fund; you can't touch it before [retirementAge] without a
  /// brutal penalty.
  double retirementBalance = 0;

  /// Fraction of each paycheck you divert into retirement (payroll-deducted).
  double retirementContribPct = 0;

  /// Age at which withdrawals become penalty-free.
  static const int retirementAge = 60;

  /// Employer matches your contribution dollar-for-dollar up to this share of
  /// pay — free money you only get by contributing.
  static const double employerMatchPct = 0.05;

  /// Penalty on any withdrawal before [retirementAge].
  static const double earlyWithdrawalPenalty = 0.25;

  /// Target-date fund: ~7.4%/yr baseline drift, plus market-correlated swings
  /// (your 401k dips in a crash). No extra rng draw — rides the shared shock.
  static const double _retireMonthlyDrift = 0.006;
  static const double _retireMarketBeta = 0.6;

  /// This month's income tax on wages (after the pre-tax 401(k) contribution),
  /// for display.
  double get monthlyIncomeTax {
    final annualTaxable =
        (effectivePay - effectivePay * retirementContribPct) * 12 -
            Catalog.standardDeduction;
    return annualTaxable <= 0 ? 0 : Catalog.incomeTaxOnTaxable(annualTaxable) / 12;
  }

  /// Set the payroll-deduction percentage (0–30%).
  void setRetirementContribPct(double pct) {
    retirementContribPct = pct.clamp(0.0, 0.30);
    notifyListeners();
  }

  /// Withdraw [amount] (or everything if [max]). Before [retirementAge] you
  /// eat a [earlyWithdrawalPenalty] haircut; after, it's penalty-free.
  String? withdrawRetirement(double amount, {bool max = false}) {
    if (retirementBalance <= 0) return 'Your retirement account is empty.';
    var amt = max ? retirementBalance : amount;
    if (amt <= 0) return 'Enter an amount greater than \$0.';
    if (amt > retirementBalance) amt = retirementBalance;
    final early = ageYears < retirementAge;
    final penalty = early ? amt * earlyWithdrawalPenalty : 0.0;
    retirementBalance -= amt;
    if (retirementBalance < 0.01) retirementBalance = 0;
    cash += amt - penalty;
    _log(early
        ? 'Raided your 401(k): pulled ${_usd(amt)} but lost ${_usd(penalty)} '
            '(${(earlyWithdrawalPenalty * 100).toStringAsFixed(0)}% early penalty).'
        : 'Withdrew ${_usd(amt)} from retirement — penalty-free at $ageYears.');
    notifyListeners();
    return null;
  }

  // ---- Sports betting ----
  /// Open wagers, valued at their stake until they resolve next month.
  double get pendingBetsValue {
    var sum = 0.0;
    for (final b in bets) {
      sum += b.stake;
    }
    return sum;
  }

  /// Share of settled wagers that hit, and lifetime net profit on betting.
  double get betWinRate => betsSettled == 0 ? 0 : betsWon / betsSettled;
  double get betNetProfit => betReturned - betStaked;

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

  /// Place a pre-built featured parlay (with its profit [p].boost) for [stake].
  String? placeFeatured(FeaturedParlay p, double stake) =>
      placeParlay(p.legs, stake, boost: p.boost);

  /// Place a wager across [legs]: one leg is a straight bet; 2+ legs is a
  /// parlay where every leg must hit (odds and the long-shot both multiply).
  /// [boost] juices the profit portion of the payout (featured parlays only).
  String? placeParlay(List<ParlayLeg> legs, double stake, {double boost = 0.0}) {
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
    if (boost > 0) dec = 1 + (dec - 1) * (1 + boost); // featured profit boost
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

  /// A new mortgage payment qualifies if it fits within this share of
  /// [qualifyingIncome] for a purchase (refis get a touch more room). Judging
  /// payments against salary PLUS rents — not salary alone — is what lets a
  /// landlord with good rental income keep scaling into higher tiers.
  static const double maxPaymentShare = 0.45;
  static const double _rentQualifyHaircut = 0.75;

  /// Rent a lender would count toward qualifying you — tenanted homes only,
  /// haircut for vacancy/conservatism.
  double get _rentQualifyingIncome {
    var r = 0.0;
    for (final p in properties) {
      if (p.rentedOut) r += p.monthlyRent * _rentQualifyHaircut;
    }
    return r;
  }

  /// Income a lender counts toward your mortgages: salary plus a 75% haircut on
  /// the rent your tenanted homes bring in. New payments are judged against
  /// this, so strong rental income lets you keep scaling.
  double get qualifyingIncome => job.pay + _rentQualifyingIncome;

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
    if (loan > 0 && hasBankruptcyMark) {
      return 'A recent bankruptcy bars you from a mortgage for '
          '${(bankruptcyMonthsLeft / 12).ceil()} more years. Pay all-cash or '
          'wait it out.';
    }
    final rate = effectiveMortgageRate(m);
    final payment = mortgageMonthlyPayment(loan, rate, m.termMonths);
    if (loan > 0 && payment > qualifyingIncome * maxPaymentShare) {
      return 'Income too low to qualify — the payment would exceed '
          '${(maxPaymentShare * 100).toStringAsFixed(0)}% of your salary plus '
          'rental income. Earn more, rent out a home, or put more down.';
    }

    cash -= down;
    properties.add(PropertyHolding(
      id: _nextPropertyId++,
      defId: def.id,
      currentValue: price,
      loanBalance: loan,
      monthlyPayment: payment,
      annualRate: rate,
      termMonths: m.termMonths,
      purchasePrice: price,
      address: Properties.randomAddress(_rng),
      rentYield: def.rentYield,
      renoYield: def.renoYield,
      rentable: def.rentable,
      occupancy: def.occupancy,
    ));
    _log('Bought ${def.name} for ${_usd(price)} '
        '(${(downFraction * 100).toStringAsFixed(0)}% down, ${m.name} @ '
        '${(rate * 100).toStringAsFixed(1)}%).');
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

  /// Max loan-to-value on a cash-out refinance. Held at a conservative 65% (not
  /// the aggressive 75%) so you keep a real equity cushion — a cash-out leaves
  /// you far less likely to go underwater when housing turns down.
  static const double refiMaxLtv = 0.65;

  /// Refinance closing costs as a fraction of the new loan.
  static const double refiCostRate = 0.02;

  /// The cash you could pull from [h] in a cash-out refinance right now (0 if
  /// you're already levered past [refiMaxLtv] or the costs swamp the proceeds).
  double refinanceCashOut(PropertyHolding h) {
    final maxLoan = h.currentValue * refiMaxLtv;
    final out = maxLoan - h.loanBalance - maxLoan * refiCostRate;
    return out < 0 ? 0 : out;
  }

  /// Cash-out refinance: re-appraise at today's value, write a fresh 30-year
  /// loan at up to [refiMaxLtv] of value at the current [mortgageRate], retire
  /// the old balance, and hand you the difference (minus closing costs) as
  /// cash. The engine behind BRRRR — pull your equity out and put it to work
  /// without selling. Returns an error, or null on success.
  String? refinance(PropertyHolding h) {
    final maxLoan = h.currentValue * refiMaxLtv;
    if (maxLoan <= h.loanBalance + 1) {
      return 'No equity to pull — you already owe more than '
          '${(refiMaxLtv * 100).toStringAsFixed(0)}% of its value.';
    }
    final m = Properties.mortgages.first; // 30-year fixed
    final rate = effectiveMortgageRate(m);
    final payment = mortgageMonthlyPayment(maxLoan, rate, m.termMonths);
    if (payment > qualifyingIncome * 0.5) {
      return 'Income too low — the new payment would exceed half your salary '
          'plus rental income.';
    }
    final closing = maxLoan * refiCostRate;
    final proceeds = maxLoan - h.loanBalance - closing;
    h.loanBalance = maxLoan;
    h.annualRate = rate;
    h.termMonths = m.termMonths;
    h.monthlyPayment = payment;
    h.monthsPaid = 0;
    cash += proceeds;
    final pd = Properties.byId(h.defId);
    _log('Refinanced your ${pd.name}: pulled ${_usd(proceeds)} cash at '
        '${(rate * 100).toStringAsFixed(1)}% (after ${_usd(closing)} in costs).');
    notifyListeners();
    return null;
  }

  /// Renovate [h] for [budget] cash, forcing appreciation. Spending adds value
  /// back at ~2.2× when the home is untouched, fading toward ~0.7× as your
  /// cumulative spend approaches 40% of its base price (you can't gold-plate a
  /// shack forever), with ±15% execution risk. Both the added value AND the
  /// renovation rent premium (see PropertyHolding.monthlyRent) lift rent, so a
  /// fixed-up home cash-flows. Returns an error, or null on success.
  String? renovate(PropertyHolding h, double budget) {
    final pd = Properties.byId(h.defId);
    if (!pd.renovatable) return 'You can\'t renovate ${pd.name.toLowerCase()}.';
    if (budget <= 0) return 'Enter a renovation budget greater than \$0.';
    if (budget > cash + 0.01) return 'Not enough cash for that renovation.';
    final saturation =
        (h.renovationInvested / (pd.basePrice * 0.4)).clamp(0.0, 1.0);
    final mult = 2.2 - 1.5 * saturation; // 2.2× fresh → 0.7× maxed out
    final luck = 0.85 + _rng.nextDouble() * 0.30; // ±15% execution risk
    final added = budget * mult * luck;
    cash -= budget;
    h.currentValue += added;
    h.renovationInvested += budget;
    _log(added >= budget
        ? 'Renovated your ${pd.name}: ${_usd(budget)} in, ${_usd(added)} of '
            'value out.'
        : 'Renovated your ${pd.name}, but it ran over — ${_usd(budget)} in, '
            'only ${_usd(added)} of value out.');
    notifyListeners();
    return null;
  }

  /// Chance a rented-out home has a paying tenant in any given month.
  static const double occupancyChance = 0.75;

  /// List a property for rent (or take it off the market). While rented, each
  /// month rolls for a tenant; when occupied, rent lands in cash and offsets a
  /// chunk of the mortgage. Taking it off the market clears any tenant.
  void toggleRental(PropertyHolding h) {
    if (!h.rentable) return; // raw land has no tenants
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

    // Capital-gains tax on the realized profit of a market-traded position in a
    // taxable brokerage (interest income is taxed monthly instead; shorts are
    // left simple). This is the cost of selling a winner — buy-and-hold defers
    // it, and a sheltered account avoids it entirely.
    var capGainsTax = 0.0;
    if (!h.isShort && h.kind.isPriceBased) {
      final realizedGain = amt - h.costBasis * frac;
      if (realizedGain > 0) capGainsTax = realizedGain * Catalog.capitalGainsRate;
    }

    if (h.kind.isInterestBearing) {
      h.balance -= amt;
    } else {
      h.shares -= h.shares * frac;
    }
    h.costBasis -= h.costBasis * frac;
    cash += amt - penalty - capGainsTax;

    if (valueOf(h) <= 0.01) holdings.remove(h);

    _log('Sold \$${amt.toStringAsFixed(0)} of ${def.name}'
        '${penalty > 0 ? ' (−\$${penalty.toStringAsFixed(0)} early-exit fee)' : ''}'
        '${capGainsTax > 0 ? ' (−\$${capGainsTax.toStringAsFixed(0)} capital-gains tax)' : ''}.');
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

  /// Degrees actually completed (by id) — distinct from [eduLevel] so a specific
  /// professional degree (MD/JD) can be required, and stacked on a general one.
  final Set<String> completedDegrees = {};

  /// Active career track and progress within it. You climb rungs by tenure;
  /// [monthsInRung] counts months worked on the current rung.
  String? currentTrackId;
  int rungIndex = 0;
  int monthsInRung = 0;

  CareerTrack? get currentTrack => Catalog.trackById(currentTrackId);

  /// The degree currently being studied (null = not enrolled).
  String? enrolledDegreeId;

  /// Months left until the enrolled degree completes.
  int enrollMonthsLeft = 0;

  /// Outstanding student-loan balance (compounds monthly until repaid).
  double studentLoan = 0;

  /// Required fixed monthly payment once you've graduated — set to amortize the
  /// balance over the standard term, so the loan can't be ignored forever. 0
  /// while you're still in school (payments are deferred) or debt-free.
  double studentLoanPayment = 0;

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

  /// Take-home pay this month — $0 while a consequence suspends your income,
  /// reduced to part-time while you're studying, otherwise full pay.
  double get effectivePay {
    if (ongoing.any((e) => e.suspendsIncome)) return 0;
    return isStudying ? job.pay * partTimePayFraction : job.pay;
  }

  bool meetsEducation(JobDef j) => eduLevel >= j.requiredEdu;

  /// Enroll in a degree: borrow the tuition as a student loan and start the
  /// clock. You keep working part-time. Returns an error, or null on success.
  String? enroll(DegreeDef d) {
    if (isStudying) return "You're already enrolled in a program.";
    if (completedDegrees.contains(d.id)) {
      return 'You already hold this credential.';
    }
    // A higher general degree subsumes a lower one; professional degrees (MD/JD)
    // stack on top and must be earned specifically.
    if (!d.professional && eduLevel >= d.level) {
      return 'You already hold a degree at this level or higher.';
    }
    studentLoan += d.tuition;
    enrolledDegreeId = d.id;
    enrollMonthsLeft = d.months;
    _log('Enrolled in ${d.name} — borrowed ${_usd(d.tuition)}. '
        'You go part-time (half pay) for ${d.years} years.');
    notifyListeners();
    return null;
  }

  // ---- High-interest debt (loan sharks, payday loans) ----
  /// Nasty short-term debt that compounds fast and drags net worth. Taken on
  /// via crisis events; pay it down before it snowballs.
  double debt = 0;

  /// Annual interest on [debt] — loan-shark territory.
  static const double debtRate = 0.28;

  /// Pay [amount] of cash toward your high-interest debt (or all if [max]).
  String? payDebt(double amount, {bool max = false}) {
    if (debt <= 0) return 'You have no debt to pay.';
    final amt = max ? debt : amount;
    if (amt <= 0) return 'Enter an amount greater than \$0.';
    if (amt > cash + 0.001) return 'Not enough cash.';
    final applied = amt > debt ? debt : amt;
    cash -= applied;
    debt -= applied;
    if (debt < 0.01) debt = 0;
    _log('Paid ${_usd(applied)} toward your debt.');
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
    if (studentLoan < 0.01) {
      studentLoan = 0;
      studentLoanPayment = 0;
    }
    _log('Paid ${_usd(applied)} toward your student loan.');
    notifyListeners();
    return null;
  }

  /// Whether you meet every requirement to ENTER [t] (education + specific
  /// degree + age + prestige).
  bool qualifiesForTrack(CareerTrack t) =>
      eduLevel >= t.minEduLevel &&
      (t.requiredDegreeId == null ||
          completedDegrees.contains(t.requiredDegreeId)) &&
      ageYears >= t.minAge &&
      prestige >= t.unlockLevel;

  /// Tracks you can enter right now, cheapest-entry first.
  List<CareerTrack> get availableTracks => Catalog.careerTracks
      .where(qualifiesForTrack)
      .toList()
    ..sort((a, b) => a.entry.pay.compareTo(b.entry.pay));

  /// Start (or switch to) a career track at its entry rung. Switching resets
  /// your progress — you start over at the bottom of the new ladder.
  String? joinTrack(CareerTrack t) {
    if (!qualifiesForTrack(t)) {
      return 'You don\'t meet the requirements for ${t.name} yet.';
    }
    // Already in this track? Do nothing — you don't restart your own career
    // (this also stops a re-"take" of the entry rung from demoting you).
    if (currentTrackId == t.id) return null;
    currentTrackId = t.id;
    rungIndex = 0;
    monthsInRung = 0;
    job = t.entry;
    _log('Started a career in ${t.name} — ${job.title} at ${_usd(job.pay)}/mo.');
    notifyListeners();
    return null;
  }

  /// Compatibility shim: "taking a job" means joining the track whose entry rung
  /// this is. Mid-career roles can't be taken directly — you climb to them.
  void takeJob(JobDef j) {
    if (j.id == job.id) return;
    final track = Catalog.trackForEntryJob(j.id);
    if (track == null) return; // not an entry rung
    joinTrack(track);
  }

  /// Entry rungs of every track you currently qualify for (cheapest first).
  List<JobDef> get availableJobs =>
      [for (final t in availableTracks) t.entry];

  /// Entry rungs of every track visible at the current prestige.
  List<JobDef> get unlockedJobs => [
        for (final t in Catalog.careerTracks)
          if (t.unlockLevel <= prestige) t.entry
      ];

  /// Assets in [categoryId] that are unlocked at the current prestige level.
  List<AssetDef> unlockedAssets(String categoryId) => Catalog.assetsInCategory(categoryId)
      .where((a) => a.unlockLevel <= prestige)
      .toList();

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

    // 1) Salary in (part-time pay while studying), living expenses out. Kids
    //    add their monthly cost, and a chosen housing/transport tier shifts the
    //    bill up or down vs. just letting lifestyle follow your income.
    final income = effectivePay;
    final expenses = dailyExpenses + childcareCost + lifestyleExpenseDelta;
    // Retirement: payroll-deduct your contribution and add the employer match
    // (dollar-for-dollar up to 5% of pay) into the locked account; only the
    // take-home portion lands in cash.
    final retireContribution = income * retirementContribPct;
    final employerMatch = income *
        (retirementContribPct < employerMatchPct
            ? retirementContribPct
            : employerMatchPct);
    retirementBalance += retireContribution + employerMatch;
    cash += income - retireContribution;
    // Income tax on wages — pre-tax 401(k) contributions are shielded, so
    // contributing lowers this bill on top of the employer match.
    final annualTaxable =
        (income - retireContribution) * 12 - Catalog.standardDeduction;
    // Running tax tab for the month: wage tax now, plus dividend tax later.
    var taxPaid = annualTaxable <= 0
        ? 0.0
        : Catalog.incomeTaxOnTaxable(annualTaxable) / 12;
    cash -= taxPaid;
    cash -= expenses;
    // A partner's take-home pay lands straight in cash. Folded into the income
    // figure below so the recap and the cash-flow audit stay exact.
    final partnerNet = partnerMonthlyIncome;
    cash += partnerNet;

    // 1b) Education: advance any degree in progress, and compound the loan.
    if (isStudying) {
      enrollMonthsLeft -= 1;
      if (enrollMonthsLeft <= 0) {
        final d = enrolledDegree!;
        eduLevel = eduLevel >= d.level ? eduLevel : d.level;
        completedDegrees.add(d.id);
        enrolledDegreeId = null;
        enrollMonthsLeft = 0;
        // Repayment begins: lock in a fixed monthly payment that amortizes the
        // whole balance over the standard term (recomputed on the full balance
        // if you stacked another degree).
        if (studentLoan > 0) {
          studentLoanPayment = mortgageMonthlyPayment(studentLoan,
              Catalog.studentLoanRate, Catalog.studentLoanRepaymentMonths);
        }
        events.add('🎓 You earned your ${d.name}! New careers are open. '
            'Loan repayment of ${_usd(studentLoanPayment)}/mo begins.');
      }
    } else {
      // 1b2) Career progression: tenure on a rung earns an automatic promotion
      //      (only while actually working — paused in school or when an event
      //      has suspended your income).
      final track = currentTrack;
      if (track != null &&
          rungIndex < track.rungs.length - 1 &&
          !ongoing.any((e) => e.suspendsIncome)) {
        monthsInRung += 1;
        if (monthsInRung >= track.rungMonths[rungIndex]) {
          rungIndex += 1;
          monthsInRung = 0;
          job = track.rungs[rungIndex];
          events.add('🎉 Promoted to ${job.title} — now ${_usd(job.pay)}/mo.');
        }
      }
    }
    if (studentLoan > 0) {
      studentLoan *= (1 + Catalog.studentLoanRate / Catalog.stepsPerYear);
      // Payments are deferred while you're in school; once you've graduated the
      // loan amortizes — a required monthly bite out of cash you can't dodge.
      if (!isStudying) {
        if (studentLoanPayment <= 0) {
          studentLoanPayment = mortgageMonthlyPayment(studentLoan,
              Catalog.studentLoanRate, Catalog.studentLoanRepaymentMonths);
        }
        final due = studentLoanPayment > studentLoan ? studentLoan : studentLoanPayment;
        cash -= due;
        studentLoan -= due;
        if (studentLoan < 0.01) {
          studentLoan = 0;
          studentLoanPayment = 0;
        }
      }
    }
    if (debt > 0) {
      debt *= (1 + debtRate / Catalog.stepsPerYear);
    }

    // 1c) Lingering consequences: drain any recurring cost, then tick down.
    for (final e in ongoing) {
      if (e.monthlyCost > 0) cash -= e.monthlyCost;
      e.monthsLeft -= 1;
    }
    for (final e in ongoing.where((e) => e.monthsLeft <= 0)) {
      events.add('✔ ${e.label} is over.');
    }
    ongoing.removeWhere((e) => e.monthsLeft <= 0);

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
    // The shared market shock for the week: one common factor every risk asset
    // rides (scaled by its beta), so stocks and commodities co-move instead of
    // wandering independently. Drawn once, before the per-asset loop.
    final marketShock = MarketEngine.marketFactor(_rng);
    lastMarketFactor = marketShock;
    // Retirement fund rides the same shared shock (a target-date fund): steady
    // drift plus market-correlated swings. No extra rng draw.
    if (retirementBalance > 0) {
      retirementBalance *=
          (1 + _retireMonthlyDrift + _retireMarketBeta * marketShock);
      if (retirementBalance < 0) retirementBalance = 0;
    }
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
      final next = MarketEngine.stepPrice(_prices[a.id]!, a, _rng,
          bias: mb, market: marketShock);
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
    // Dividends/coupons in a taxable brokerage are taxed (a 401k pays none).
    if (dividends > 0) {
      final divTax = dividends * Catalog.dividendTaxRate;
      cash -= divTax;
      taxPaid += divTax;
    }

    // 5b) Real estate: move the housing market, appreciate listings + owned
    //     homes (riding the cycle), collect rent, then service loans.
    _tickHousingMarket(events);
    var mortgagePaid = 0.0;
    var rentCollected = 0.0;
    var rentedUnits = 0, occupiedUnits = 0;
    for (final pd in Properties.ladder) {
      final cur = propertyPrices[pd.id]!;
      // Listing-price wiggle uses the housing side-stream so the number of
      // property types never shifts the main rng sequence.
      final np = cur *
          (1 +
              pd.monthlyAppreciation +
              housingTrend +
              pd.monthlyVol * MarketEngine.gauss(_housingRng));
      propertyPrices[pd.id] = np < pd.basePrice * 0.2 ? pd.basePrice * 0.2 : np;
    }
    for (final h in properties) {
      final pd = Properties.byId(h.defId);
      final r = pd.monthlyAppreciation +
          housingTrend +
          pd.monthlyVol * MarketEngine.gauss(_rng);
      h.currentValue *= (1 + r);
      if (h.currentValue < 0) h.currentValue = 0;
      // Rent: a listed home finds a tenant most (not all) months; when occupied
      // the rent lands in cash and helps cover the mortgage.
      if (h.rentedOut) {
        rentedUnits += 1;
        h.occupied = _rng.nextDouble() < h.occupancy;
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

    // 5b2) Operating businesses: collect profit (swinging with the cycle +
    //      noise), pay the manager's cut, apply an attention penalty if you're
    //      running too many yourself, tax the profit, and roll for failures.
    var businessIncome = 0.0;
    if (businesses.isNotEmpty) {
      final cycleSwing = regime.isCrash
          ? -0.55
          : regime == MarketRegime.downturn
              ? -0.35
              : regime == MarketRegime.boom
                  ? 0.25
                  : regime == MarketRegime.recovery
                      ? 0.05
                      : 0.0;
      final failMult = regime.isCrash
          ? 4.0
          : regime == MarketRegime.downturn
              ? 2.0
              : regime == MarketRegime.boom
                  ? 0.5
                  : 1.0;
      final attention = _attentionFactor;
      for (final b in List.of(businesses)) {
        final def = Businesses.byId(b.defId);
        b.monthsOwned += 1;
        final regimeFactor = 1 + def.cyclicality * cycleSwing;
        final noiseFactor = 1 + def.profitVol * MarketEngine.gauss(_bizRng);
        var profit = b.monthlyProfit * regimeFactor * noiseFactor;
        if (b.managed) {
          profit *= (1 - def.managerCut);
        } else {
          profit *= attention;
        }
        cash += profit;
        businessIncome += profit;
        // Hard failure — closes the business; you salvage ~20% of what you paid.
        if (def.failureRisk > 0 &&
            _bizRng.nextDouble() < def.failureRisk * failMult) {
          final salvage = b.purchasePrice * 0.20;
          cash += salvage;
          businesses.remove(b);
          events.add('🚨 ${b.name} failed and closed — salvaged '
              '${_usd(salvage)} from the assets.');
        }
      }
      // Business profit is ordinary taxable income (losses go untaxed).
      if (businessIncome > 0) {
        final bizTax = businessIncome * businessTaxRate;
        cash -= bizTax;
        taxPaid += bizTax;
      }
      if (businessIncome.abs() > 0.5) {
        events.add(businessIncome >= 0
            ? '🏪 Business profit: +${_usd(businessIncome)} this month.'
            : '🏪 Businesses ran at a loss: −${_usd(-businessIncome)} this month.');
      }
    }

    // 5c) Resolve sports bets, then post a fresh slate.
    for (final b in bets) {
      final won = _rng.nextDouble() < b.winProb;
      final payout = won ? b.stake * b.decimalOdds : 0.0;
      betsSettled++;
      betStaked += b.stake;
      if (won) {
        cash += payout;
        betsWon++;
        betReturned += payout;
        events.add(
            '🎉 Bet won: +\$${(payout - b.stake).toStringAsFixed(0)} on ${b.title}.');
      } else {
        events.add('❌ Bet lost: −\$${b.stake.toStringAsFixed(0)} on ${b.title}.');
      }
      betHistory.insert(
          0,
          BetResult(
              title: b.title,
              stake: b.stake,
              payout: payout,
              won: won,
              isParlay: b.isParlay));
    }
    if (betHistory.length > 24) betHistory.removeRange(24, betHistory.length);
    bets.clear();
    sportsSlate = SportsEngine.generateSlate(_rng, _nextEventId);
    _nextEventId += sportsSlate.length;
    // Use a SIDE rng (seeded off the slate) so building these cosmetic parlay
    // groupings never perturbs the main _rng stream that drives markets,
    // crises, and bet resolution — keeping the game deterministic per seed.
    featuredParlays =
        SportsEngine.featuredParlays(sportsSlate, Random(_nextEventId));

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
        // A gentle, capped fee: enough to nudge you to top up, but it can't
        // snowball on a large temporary shortfall (capped at a slice of net
        // worth for anyone with real assets).
        overdraftFee = (-cash) * overdraftFeeRate;
        final nw = netWorth;
        if (nw > 0) {
          final cap = nw * overdraftFeeMaxNwShare;
          if (overdraftFee > cap) overdraftFee = cap;
        }
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
    // Draw the trigger under the same structural gate as before, so RNG is
    // consumed identically whether or not crises are enabled.
    final crisisRoll =
        (pendingCrisis == null && day > 6) ? _rng.nextDouble() : 1.0;
    if (crisesEnabled && crisisRoll < crisisChance) {
      pendingCrisis = Crises.pick(this, _rng);
      crisisTriggered = pendingCrisis != null;
      if (pendingCrisis != null) {
        recentCrisisIds.add(pendingCrisis!.id);
        if (recentCrisisIds.length > _crisisMemory) {
          recentCrisisIds.removeRange(0, recentCrisisIds.length - _crisisMemory);
        }
      }
    }

    // 7) Publish next week's edition of rumors.
    currentRumors = NewsEngine.generateEdition(_rng, day);

    netWorthHistory.add(netWorth);
    final after = netWorth;

    final summary = DayResult(
      income: income + partnerNet,
      expenses: expenses,
      dividends: dividends,
      interest: interest,
      rent: rentCollected,
      mortgage: mortgagePaid,
      tax: taxPaid,
      businessIncome: businessIncome,
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
        tax = 0.0,
        businessIncome = 0.0,
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
      tax += r.tax;
      businessIncome += r.businessIncome;
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
      tax: tax,
      businessIncome: businessIncome,
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
