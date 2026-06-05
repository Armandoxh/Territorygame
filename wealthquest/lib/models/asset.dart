/// Static definitions for the investment catalog.
///
/// Everything here is *data*. Adding a new investment is a single [AssetDef]
/// entry in `data/catalog.dart` — the engine and UI pick it up automatically
/// based on its [AssetKind].

/// The behavioural family of an asset. The engine branches on this, so a new
/// instrument never needs new engine code as long as it fits one of these.
enum AssetKind {
  savings, // liquid, accrues interest every day, withdraw anytime
  cd, // locked for a fixed term, accrues interest, redeemable at maturity
  fund, // yield fund: high APY, locked (hard or penalty), can lose in downturns
  bond, // price-based + pays a coupon into cash each day
  stock, // price-based, random walk, may pay dividends
  etf, // price-based, lower volatility basket, may pay dividends
  crypto, // price-based, high volatility
  commodity, // price-based, no income; metals act as safe havens
}

/// How a holding's lock-up works.
enum LockKind {
  none, // withdraw anytime, no penalty
  penalty, // withdraw early but forfeit a slice of your gains
  hard, // can't withdraw before maturity (CDs, private credit, hedge funds)
}

extension AssetKindX on AssetKind {
  bool get isInterestBearing =>
      this == AssetKind.savings ||
      this == AssetKind.cd ||
      this == AssetKind.fund;

  bool get isPriceBased =>
      this == AssetKind.bond ||
      this == AssetKind.stock ||
      this == AssetKind.etf ||
      this == AssetKind.crypto ||
      this == AssetKind.commodity;

  bool get isEquity => this == AssetKind.stock || this == AssetKind.etf;

  bool get paysCoupon => this == AssetKind.bond;

  String get label {
    switch (this) {
      case AssetKind.savings:
        return 'Savings';
      case AssetKind.cd:
        return 'CD';
      case AssetKind.fund:
        return 'Fund';
      case AssetKind.bond:
        return 'Bond';
      case AssetKind.stock:
        return 'Stock';
      case AssetKind.etf:
        return 'ETF';
      case AssetKind.crypto:
        return 'Crypto';
      case AssetKind.commodity:
        return 'Commodity';
    }
  }
}

/// A top-level grouping shown as a sub-tab in the Market screen.
class AssetCategory {
  final String id;
  final String label;
  final String blurb;

  const AssetCategory({
    required this.id,
    required this.label,
    required this.blurb,
  });
}

/// One investable instrument. Carries the data a real investor would scan
/// before making a decision: price dynamics, income, size, and quality.
class AssetDef {
  final String id;
  final String name;
  final String ticker;
  final String categoryId;
  final AssetKind kind;

  /// Starting price for price-based assets. Ignored (treat as 1.0) for
  /// interest-bearing ones, which are tracked by dollar balance.
  final double basePrice;

  /// Mean daily return for price-based assets (a "day" is a week of game time).
  final double dailyDrift;

  /// Daily return standard deviation for price-based assets.
  final double dailyVol;

  /// Annual percentage yield for interest-bearing assets and bond coupons.
  final double apy;

  /// Lock term in weeks for CDs (52 weeks == 1 in-game year). 0 if not a CD.
  final int termDays;

  /// Minimum dollars required to open a position.
  final double minInvestment;

  // ---- Depth / fundamentals (mostly for the detail screen) ----

  /// Industry sector, e.g. "Technology". Empty for cash-like instruments.
  final String sector;

  /// Shares / coins / units outstanding. Market cap = price * this.
  final double sharesOutstanding;

  /// Annual earnings per share. Drives P/E. <= 0 means unprofitable (P/E N/A).
  final double eps;

  /// Annual dividend yield for stocks/ETFs (paid into cash weekly).
  final double dividendYield;

  /// Annual fund expense ratio for ETFs (informational).
  final double expenseRatio;

  /// Credit rating for bonds, e.g. "AAA". Empty if not applicable.
  final String creditRating;

  /// Maximum dollars that can be bought per in-game year (52 weeks). 0 = no
  /// cap. Used by Series I Bonds.
  final double annualPurchaseCap;

  /// Balance a liquid account must keep to earn [apy]; below it the account
  /// earns [belowMinApy] instead. 0 = no minimum-balance requirement.
  final double minBalance;

  /// Reduced APY applied while balance is under [minBalance].
  final double belowMinApy;

  /// FDIC/government-insured against loss. Meaningful for cash & fixed income;
  /// funds (MMF, CMA sweeps, bond funds) are not insured.
  final bool insured;

  /// How this holding locks up. [termDays] is the lock period.
  final LockKind lockKind;

  /// For penalty-lock funds: fraction of accrued gains forfeited if you
  /// withdraw before maturity (0..1).
  final double earlyPenalty;

  /// Fraction of balance lost in a crash month (for risky funds / uninsured
  /// cash). 0 = safe. Drives the "high yield = real risk" trade-off.
  final double crashLoss;

  /// Monthly base probability that this bond's issuer DEFAULTS (price craters).
  /// Multiplied up in downturns/crashes. 0 = no default risk (Treasuries).
  final double defaultRisk;

  /// A safe-haven asset (gold/silver) that rises when the market is fearful and
  /// lags when it's greedy — moves COUNTER to the macro cycle.
  final bool safeHaven;

  /// Prestige level at which this asset unlocks (0 = always available). Earned
  /// by retiring and starting over.
  final int unlockLevel;

  final String blurb;

  const AssetDef({
    required this.id,
    required this.name,
    required this.ticker,
    required this.categoryId,
    required this.kind,
    this.basePrice = 1.0,
    this.dailyDrift = 0,
    this.dailyVol = 0,
    this.apy = 0,
    this.termDays = 0,
    this.minInvestment = 0,
    this.sector = '',
    this.sharesOutstanding = 0,
    this.eps = 0,
    this.dividendYield = 0,
    this.expenseRatio = 0,
    this.creditRating = '',
    this.annualPurchaseCap = 0,
    this.minBalance = 0,
    this.belowMinApy = 0,
    this.insured = false,
    this.lockKind = LockKind.none,
    this.earlyPenalty = 0,
    this.crashLoss = 0,
    this.defaultRisk = 0,
    this.safeHaven = false,
    this.unlockLevel = 0,
    this.blurb = '',
  });

  /// How the yield behaves, for display. Locked products are fixed at purchase;
  /// liquid accounts float with rates.
  String get rateType {
    switch (kind) {
      case AssetKind.cd:
        return 'Fixed';
      case AssetKind.bond:
        return 'Fixed coupon';
      case AssetKind.savings:
      case AssetKind.fund:
        return 'Variable';
      default:
        return '';
    }
  }

  /// Cash income yield for price-based holdings: bond coupon or stock/ETF
  /// dividend. Crypto pays nothing.
  double get incomeYield => kind == AssetKind.bond ? apy : dividendYield;

  /// Annualized volatility, the way it's usually quoted (≈ daily * sqrt(52)).
  double get annualVol => dailyVol * 7.211; // sqrt(52)
}
