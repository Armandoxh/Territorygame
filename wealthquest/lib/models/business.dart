/// Operating businesses — the active money-making layer. You own 100%, it pays
/// monthly profit, its value is a multiple of its earnings, and you can grow it
/// or sell it. Higher returns than stocks/real estate, but illiquid, hands-on,
/// cyclical, and some types can fail outright.

/// Broad business categories, for grouping in the storefront.
enum BusinessCategory { food, retail, service, online, franchise }

/// A type of business you can buy or start.
class BusinessDef {
  final String id;
  final String name;
  final String emoji;
  final BusinessCategory category;

  /// Cash to buy/start it.
  final double price;

  /// Mean monthly operating profit at purchase (revenue − costs).
  final double baseMonthlyProfit;

  /// Month-to-month profit volatility (as a fraction of profit).
  final double profitVol;

  /// Sensitivity to the macro cycle (0 = recession-proof, 1 = brutally
  /// cyclical). Scales how much booms/busts swing the monthly profit.
  final double cyclicality;

  /// Monthly chance of a hard failure that closes the business (0 = never).
  /// Amplified in downturns.
  final double failureRisk;

  /// Enterprise value = annual profit × this (small-business sale multiple).
  final double saleMultiple;

  /// Fraction of profit a hired manager skims (the cost of going passive).
  final double managerCut;

  final String blurb;

  const BusinessDef({
    required this.id,
    required this.name,
    required this.emoji,
    required this.category,
    required this.price,
    required this.baseMonthlyProfit,
    required this.saleMultiple,
    this.profitVol = 0.15,
    this.cyclicality = 0.5,
    this.failureRisk = 0,
    this.managerCut = 0.18,
    this.blurb = '',
  });
}

/// A business the player owns.
class BusinessHolding {
  final int id;
  final String defId;

  /// Current run-rate monthly profit (grows when you expand). The realized
  /// profit each month swings around this with the cycle + noise.
  double monthlyProfit;

  final double purchasePrice;

  /// Cumulative cash poured into expansions (part of the cost basis).
  double investedCapital;

  /// Whether a manager runs it (passive income, minus their cut).
  bool managed;

  /// A flavor name, e.g. "Maple St Laundromat".
  final String name;

  int monthsOwned;

  BusinessHolding({
    required this.id,
    required this.defId,
    required this.monthlyProfit,
    required this.purchasePrice,
    this.investedCapital = 0,
    this.managed = false,
    this.name = '',
    this.monthsOwned = 0,
  });

  /// What you've put in — the basis for capital gains on a sale.
  double get costBasis => purchasePrice + investedCapital;

  BusinessHolding clone() => BusinessHolding(
        id: id,
        defId: defId,
        monthlyProfit: monthlyProfit,
        purchasePrice: purchasePrice,
        investedCapital: investedCapital,
        managed: managed,
        name: name,
        monthsOwned: monthsOwned,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'defId': defId,
        'monthlyProfit': monthlyProfit,
        'purchasePrice': purchasePrice,
        'investedCapital': investedCapital,
        'managed': managed,
        'name': name,
        'monthsOwned': monthsOwned,
      };

  factory BusinessHolding.fromJson(Map<String, dynamic> j) => BusinessHolding(
        id: j['id'] as int,
        defId: j['defId'] as String,
        monthlyProfit: (j['monthlyProfit'] as num).toDouble(),
        purchasePrice: (j['purchasePrice'] as num).toDouble(),
        investedCapital: (j['investedCapital'] as num).toDouble(),
        managed: j['managed'] as bool,
        name: (j['name'] as String?) ?? '',
        monthsOwned: j['monthsOwned'] as int,
      );
}
