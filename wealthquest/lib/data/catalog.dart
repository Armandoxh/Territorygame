import '../models/asset.dart';
import '../models/job.dart';

/// The single source of truth for the game's economy: starting conditions,
/// the investment catalog, and the job ladder.
///
/// Want a new investment? Add one [AssetDef] below. Want a new career rung?
/// Add one [JobDef]. Nothing else needs to change.
///
/// Return conventions: a "day" is one in-game week, and 52 days == 1 year.
/// `dailyDrift` ≈ annualReturn / 52, `dailyVol` ≈ annualVol / sqrt(52).
class Catalog {
  Catalog._();

  static const int startAge = 18;
  static const double startingCash = 500;

  /// Weekly living expenses, rising slightly with age (lifestyle creep).
  static double dailyExpenses(int age) => 300 + (age - startAge) * 5;

  static JobDef get startingJob => jobs.first;

  static const List<AssetCategory> categories = [
    AssetCategory(
      id: 'cash',
      label: 'Cash & Savings',
      blurb: 'Safe, liquid, low return. Your emergency buffer.',
    ),
    AssetCategory(
      id: 'fixed',
      label: 'Bonds & CDs',
      blurb: 'Lend money for steady interest. CDs lock; bonds pay coupons.',
    ),
    AssetCategory(
      id: 'equities',
      label: 'Stocks',
      blurb: 'Own a slice of a company. Higher risk, higher reward.',
    ),
    AssetCategory(
      id: 'funds',
      label: 'Funds & ETFs',
      blurb: 'Diversified baskets. Smoother ride than single stocks.',
    ),
    AssetCategory(
      id: 'crypto',
      label: 'Crypto',
      blurb: 'Wildly volatile digital assets. Buckle up.',
    ),
  ];

  static const List<AssetDef> assets = [
    // ---- Cash & Savings ----
    AssetDef(
      id: 'hysa',
      name: 'High-Yield Savings',
      ticker: 'HYSA',
      categoryId: 'cash',
      kind: AssetKind.savings,
      apy: 0.04,
      minInvestment: 1,
      blurb: 'Withdraw anytime. ~4% APY, basically no risk.',
    ),

    // ---- Bonds & CDs ----
    AssetDef(
      id: 'cd6',
      name: '6-Month CD',
      ticker: 'CD-6M',
      categoryId: 'fixed',
      kind: AssetKind.cd,
      apy: 0.045,
      termDays: 26,
      minInvestment: 100,
      blurb: 'Locked 26 days. 4.5% APY, redeemable at maturity.',
    ),
    AssetDef(
      id: 'cd1y',
      name: '1-Year CD',
      ticker: 'CD-1Y',
      categoryId: 'fixed',
      kind: AssetKind.cd,
      apy: 0.052,
      termDays: 52,
      minInvestment: 100,
      blurb: 'Locked 52 days. 5.2% APY for committing longer.',
    ),
    AssetDef(
      id: 'tbond',
      name: 'Treasury Bond',
      ticker: 'UST',
      categoryId: 'fixed',
      kind: AssetKind.bond,
      basePrice: 100,
      dailyDrift: 0.0001,
      dailyVol: 0.004,
      apy: 0.04,
      minInvestment: 100,
      blurb: 'Government debt. Pays a 4% coupon; price barely moves.',
    ),
    AssetDef(
      id: 'corpbond',
      name: 'Corporate Bond',
      ticker: 'CORP',
      categoryId: 'fixed',
      kind: AssetKind.bond,
      basePrice: 100,
      dailyDrift: 0.0002,
      dailyVol: 0.009,
      apy: 0.065,
      minInvestment: 100,
      blurb: 'Company debt. Higher 6.5% coupon, a bit more price risk.',
    ),

    // ---- Stocks ----
    AssetDef(
      id: 'apt',
      name: 'Apt Technologies',
      ticker: 'APT',
      categoryId: 'equities',
      kind: AssetKind.stock,
      basePrice: 184.0,
      dailyDrift: 0.0021,
      dailyVol: 0.045,
      blurb: 'Big-cap tech. Strong growth, real swings.',
    ),
    AssetDef(
      id: 'volt',
      name: 'Volt Motors',
      ticker: 'VOLT',
      categoryId: 'equities',
      kind: AssetKind.stock,
      basePrice: 92.5,
      dailyDrift: 0.0025,
      dailyVol: 0.072,
      blurb: 'EV maker. High beta — feast or famine.',
    ),
    AssetDef(
      id: 'sun',
      name: 'Sunrise Energy',
      ticker: 'SUN',
      categoryId: 'equities',
      kind: AssetKind.stock,
      basePrice: 47.2,
      dailyDrift: 0.0012,
      dailyVol: 0.038,
      blurb: 'Renewables utility. Steadier, modest growth.',
    ),
    AssetDef(
      id: 'mega',
      name: 'Mega Retail',
      ticker: 'MEGA',
      categoryId: 'equities',
      kind: AssetKind.stock,
      basePrice: 138.0,
      dailyDrift: 0.0009,
      dailyVol: 0.03,
      blurb: 'Defensive blue chip. Low drama, slow and steady.',
    ),
    AssetDef(
      id: 'bio',
      name: 'BioNova',
      ticker: 'BIO',
      categoryId: 'equities',
      kind: AssetKind.stock,
      basePrice: 31.8,
      dailyDrift: 0.0028,
      dailyVol: 0.09,
      blurb: 'Speculative biotech. Lottery-ticket volatility.',
    ),

    // ---- Funds & ETFs ----
    AssetDef(
      id: 'spx',
      name: 'S&P 500 Index',
      ticker: 'SPX',
      categoryId: 'funds',
      kind: AssetKind.etf,
      basePrice: 512.0,
      dailyDrift: 0.0016,
      dailyVol: 0.022,
      blurb: 'The market itself. ~8%/yr historically, lower volatility.',
    ),
    AssetDef(
      id: 'vtm',
      name: 'Total Market ETF',
      ticker: 'VTM',
      categoryId: 'funds',
      kind: AssetKind.etf,
      basePrice: 268.0,
      dailyDrift: 0.0016,
      dailyVol: 0.024,
      blurb: 'Every public company at once. Maximum diversification.',
    ),
    AssetDef(
      id: 'divx',
      name: 'Dividend ETF',
      ticker: 'DIVX',
      categoryId: 'funds',
      kind: AssetKind.etf,
      basePrice: 121.0,
      dailyDrift: 0.0011,
      dailyVol: 0.018,
      blurb: 'Income-focused basket. Calmer, slower-growing.',
    ),

    // ---- Crypto ----
    AssetDef(
      id: 'btq',
      name: 'Bitcorn',
      ticker: 'BTQ',
      categoryId: 'crypto',
      kind: AssetKind.crypto,
      basePrice: 43250.0,
      dailyDrift: 0.004,
      dailyVol: 0.11,
      blurb: 'The original. Massive swings, massive narratives.',
    ),
    AssetDef(
      id: 'etq',
      name: 'Etherium',
      ticker: 'ETQ',
      categoryId: 'crypto',
      kind: AssetKind.crypto,
      basePrice: 2280.0,
      dailyDrift: 0.0045,
      dailyVol: 0.13,
      blurb: 'Smart-contract platform. Even wilder than BTQ.',
    ),
    AssetDef(
      id: 'dogz',
      name: 'Dogz Coin',
      ticker: 'DOGZ',
      categoryId: 'crypto',
      kind: AssetKind.crypto,
      basePrice: 0.083,
      dailyDrift: 0.0,
      dailyVol: 0.28,
      blurb: 'A meme. Pure casino. You have been warned.',
    ),
  ];

  /// The career ladder. Higher rungs unlock with age; the player picks one
  /// in the Life tab.
  static const List<JobDef> jobs = [
    JobDef(id: 'barista', title: 'Barista', pay: 520, minAge: 18),
    JobDef(id: 'retail', title: 'Retail Associate', pay: 640, minAge: 18),
    JobDef(id: 'junior_dev', title: 'Junior Developer', pay: 1500, minAge: 20),
    JobDef(id: 'accountant', title: 'Accountant', pay: 1900, minAge: 22),
    JobDef(id: 'engineer', title: 'Software Engineer', pay: 3000, minAge: 24),
    JobDef(id: 'banker', title: 'Investment Banker', pay: 5000, minAge: 26),
  ];

  // ---- Lookups (built once) ----
  static final Map<String, AssetDef> _byId = {
    for (final a in assets) a.id: a,
  };

  static AssetDef assetById(String id) => _byId[id]!;

  static List<AssetDef> assetsInCategory(String categoryId) =>
      assets.where((a) => a.categoryId == categoryId).toList();
}
