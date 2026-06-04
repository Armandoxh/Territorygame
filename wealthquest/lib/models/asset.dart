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
  bond, // price-based + pays a coupon into cash each day
  stock, // price-based, random walk
  etf, // price-based, lower volatility basket
  crypto, // price-based, high volatility
}

extension AssetKindX on AssetKind {
  bool get isInterestBearing => this == AssetKind.savings || this == AssetKind.cd;

  bool get isPriceBased =>
      this == AssetKind.bond ||
      this == AssetKind.stock ||
      this == AssetKind.etf ||
      this == AssetKind.crypto;

  bool get paysCoupon => this == AssetKind.bond;

  String get label {
    switch (this) {
      case AssetKind.savings:
        return 'Savings';
      case AssetKind.cd:
        return 'CD';
      case AssetKind.bond:
        return 'Bond';
      case AssetKind.stock:
        return 'Stock';
      case AssetKind.etf:
        return 'ETF';
      case AssetKind.crypto:
        return 'Crypto';
    }
  }
}

/// A top-level grouping shown as a section in the Market tab.
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

/// One investable instrument.
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

  /// Lock term in days for CDs (52 days == 1 in-game year). 0 if not a CD.
  final int termDays;

  /// Minimum dollars required to open a position.
  final double minInvestment;

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
    this.blurb = '',
  });
}
