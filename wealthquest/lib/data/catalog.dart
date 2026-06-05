import 'dart:math';

import '../models/asset.dart';
import '../models/education.dart';
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
  static const double startingCash = 2000;

  /// How many advances ("Next Month") make up a year. Change this one number to
  /// re-cadence the whole sim; rates and magnitudes scale off it.
  static const int stepsPerYear = 12; // monthly

  /// Catalog drift/vol are authored at a weekly reference scale. These convert
  /// them to the active cadence so the ANNUAL return/volatility (and the tuned
  /// balance) stay the same regardless of pace.
  static const double _refStepsPerYear = 52;
  static double get driftStepFactor => _refStepsPerYear / stepsPerYear; // ~4.33
  static double get volStepFactor => sqrt(_refStepsPerYear / stepsPerYear); // ~2.08

  /// Monthly living expenses: a base, plus lifestyle creep that scales with
  /// what you earn (the more you make, the more you spend) and a little with
  /// age. Tuned so saving takes real discipline and investment growth matters.
  static double monthlyExpenses(int age, double monthlyPay) =>
      600 + 0.35 * monthlyPay + (age - startAge) * 9;

  static JobDef get startingJob => jobs.first;

  static const List<AssetCategory> categories = [
    AssetCategory(
      id: 'cash',
      label: 'Cash & Funds',
      blurb: 'A yield ladder: safe liquid cash up to high-yield funds — bigger minimums, lock-ups, and real risk as you climb.',
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
      label: 'Funds',
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
      minInvestment: 1000,
      sector: 'Cash',
      insured: true,
      blurb: 'Withdraw anytime, FDIC-insured. 4% APY. \$1k to open.',
    ),
    AssetDef(
      id: 'mmf',
      name: 'Money Market Fund',
      ticker: 'MMF',
      categoryId: 'cash',
      kind: AssetKind.savings,
      apy: 0.048,
      minInvestment: 10000,
      sector: 'Cash',
      insured: false,
      crashLoss: 0.015,
      blurb: 'Higher yield than a HYSA, still liquid. \$10k to open, NOT '
          'FDIC-insured (can dip slightly in a crash).',
    ),
    AssetDef(
      id: 'chk',
      name: 'Checking Account',
      ticker: 'CHK',
      categoryId: 'cash',
      kind: AssetKind.savings,
      apy: 0.005,
      minInvestment: 0,
      sector: 'Cash',
      insured: true,
      blurb: 'Instant access, almost no yield. Don\'t park real savings here.',
    ),
    AssetDef(
      id: 'income_fund',
      name: 'Income Fund',
      ticker: 'INCF',
      categoryId: 'cash',
      kind: AssetKind.fund,
      apy: 0.065,
      termDays: 12,
      minInvestment: 20000,
      sector: 'Credit',
      insured: false,
      lockKind: LockKind.penalty,
      earlyPenalty: 0.5,
      crashLoss: 0.015,
      blurb: '~6.5% yield, \$20k minimum. Pull out before a year and you '
          'forfeit half your gains. Dips in bad years.',
    ),
    AssetDef(
      id: 'priv_credit',
      name: 'Private Credit Fund',
      ticker: 'PCF',
      categoryId: 'cash',
      kind: AssetKind.fund,
      apy: 0.085,
      termDays: 24,
      minInvestment: 100000,
      sector: 'Credit',
      insured: false,
      lockKind: LockKind.hard,
      crashLoss: 0.03,
      blurb: '~8.5% for \$100k, hard-locked 2 years. Real drawdowns when the '
          'economy turns.',
    ),
    AssetDef(
      id: 'hedge_fund',
      name: 'Hedge Fund',
      ticker: 'HF',
      categoryId: 'cash',
      kind: AssetKind.fund,
      apy: 0.11,
      termDays: 36,
      minInvestment: 400000,
      sector: 'Alternatives',
      insured: false,
      lockKind: LockKind.hard,
      crashLoss: 0.045,
      blurb: '~11% for the \$400k club, hard-locked 3 years. Big swings; ugly '
          'years happen.',
    ),
    AssetDef(
      id: 'tbill',
      name: '3-Month T-Bill',
      ticker: 'TBILL',
      categoryId: 'cash',
      kind: AssetKind.cd,
      apy: 0.042,
      termDays: 3,
      minInvestment: 100,
      sector: 'Government',
      creditRating: 'AAA',
      insured: true,
      blurb: 'U.S. government-backed, ultra-safe. 4.2% for a 3-month lock — '
          'beats the HYSA if you can spare it.',
    ),
    AssetDef(
      id: 'ibond',
      name: 'Series I Bond',
      ticker: 'IBOND',
      categoryId: 'cash',
      kind: AssetKind.cd,
      apy: 0.048,
      termDays: 12,
      minInvestment: 25,
      sector: 'Government',
      creditRating: 'AAA',
      annualPurchaseCap: 10000,
      insured: true,
      blurb: 'Inflation-protected, government-backed. 1-year lock, '
          'capped at \$10k/year.',
    ),
    AssetDef(
      id: 'usbf',
      name: 'Ultra-Short Bond Fund',
      ticker: 'USB',
      categoryId: 'cash',
      kind: AssetKind.etf,
      basePrice: 50.0,
      dailyDrift: 0.0002,
      dailyVol: 0.003,
      dividendYield: 0.050,
      expenseRatio: 0.0008,
      sector: 'Fixed Income',
      sharesOutstanding: 0.5e9,
      insured: false,
      blurb: 'Near-cash: ~5% yield, tiny price wobble, not FDIC-insured.',
    ),

    // ---- Bonds & CDs ----
    AssetDef(
      id: 'cd6',
      name: '6-Month CD',
      ticker: 'CD-6M',
      categoryId: 'fixed',
      kind: AssetKind.cd,
      apy: 0.045,
      termDays: 6,
      minInvestment: 100,
      sector: 'Fixed Income',
      insured: true,
      blurb: 'Locked 6 months. 4.5% APY, redeemable at maturity.',
    ),
    AssetDef(
      id: 'cd1y',
      name: '1-Year CD',
      ticker: 'CD-1Y',
      categoryId: 'fixed',
      kind: AssetKind.cd,
      apy: 0.052,
      termDays: 12,
      minInvestment: 100,
      sector: 'Fixed Income',
      insured: true,
      blurb: 'Locked 12 months. 5.2% APY for committing longer.',
    ),
    AssetDef(
      id: 'cd3y',
      name: '3-Year CD',
      ticker: 'CD-3Y',
      categoryId: 'fixed',
      kind: AssetKind.cd,
      apy: 0.058,
      termDays: 36,
      minInvestment: 250,
      sector: 'Fixed Income',
      insured: true,
      blurb: 'Locked 36 months. 5.8% APY — best fixed rate, longest lock.',
    ),
    // Treasury maturity ladder: longer = higher coupon AND bigger price swings
    // (duration risk). All government-backed, no default risk.
    AssetDef(
      id: 'ust2',
      name: '2-Year Treasury',
      ticker: 'UST2',
      categoryId: 'fixed',
      kind: AssetKind.bond,
      basePrice: 100,
      dailyDrift: 0.0001,
      dailyVol: 0.003,
      apy: 0.043,
      minInvestment: 100,
      sector: 'Government',
      sharesOutstanding: 5.0e9,
      creditRating: 'AAA',
      blurb: 'Short government debt. 4.3% coupon, price barely moves.',
    ),
    AssetDef(
      id: 'ust4',
      name: '4-Year Treasury',
      ticker: 'UST4',
      categoryId: 'fixed',
      kind: AssetKind.bond,
      basePrice: 100,
      dailyDrift: 0.00012,
      dailyVol: 0.005,
      apy: 0.047,
      minInvestment: 100,
      sector: 'Government',
      sharesOutstanding: 5.0e9,
      creditRating: 'AAA',
      blurb: '4.7% coupon for a medium maturity. A bit more price wobble.',
    ),
    AssetDef(
      id: 'ust6',
      name: '6-Year Treasury',
      ticker: 'UST6',
      categoryId: 'fixed',
      kind: AssetKind.bond,
      basePrice: 100,
      dailyDrift: 0.00014,
      dailyVol: 0.007,
      apy: 0.050,
      minInvestment: 100,
      sector: 'Government',
      sharesOutstanding: 5.0e9,
      creditRating: 'AAA',
      blurb: '5.0% coupon. Longer duration swings more when rates move.',
    ),
    AssetDef(
      id: 'ust10',
      name: '10-Year Treasury',
      ticker: 'UST10',
      categoryId: 'fixed',
      kind: AssetKind.bond,
      basePrice: 100,
      dailyDrift: 0.00016,
      dailyVol: 0.010,
      apy: 0.053,
      minInvestment: 100,
      sector: 'Government',
      sharesOutstanding: 5.0e9,
      creditRating: 'AAA',
      blurb: 'The benchmark. 5.3% coupon but the price really moves with rates.',
    ),
    AssetDef(
      id: 'corpbond',
      name: 'Corporate Bond',
      ticker: 'CORP',
      categoryId: 'fixed',
      kind: AssetKind.bond,
      basePrice: 100,
      dailyDrift: 0.0002,
      dailyVol: 0.011,
      apy: 0.065,
      minInvestment: 100,
      sector: 'Credit',
      sharesOutstanding: 2.0e9,
      creditRating: 'BBB',
      defaultRisk: 0.0008,
      blurb: 'Company debt. 6.5% coupon, some price risk and a small chance '
          'of default.',
    ),
    AssetDef(
      id: 'junk',
      name: 'High-Yield Bond',
      ticker: 'JUNK',
      categoryId: 'fixed',
      kind: AssetKind.bond,
      basePrice: 100,
      dailyDrift: 0.0003,
      dailyVol: 0.025,
      apy: 0.095,
      minInvestment: 100,
      sector: 'Credit',
      sharesOutstanding: 1.0e9,
      creditRating: 'B',
      defaultRisk: 0.003,
      blurb: 'Fat 9.5% coupon from shaky issuers. They can DEFAULT — a ~45% '
          'hit to the price — and defaults spike when the economy turns.',
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
      sector: 'Technology',
      sharesOutstanding: 3.0e9,
      eps: 6.1,
      dividendYield: 0.006,
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
      sector: 'Automotive',
      sharesOutstanding: 0.8e9,
      eps: -0.4,
      blurb: 'EV maker. High beta — feast or famine, no profits yet.',
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
      sector: 'Energy',
      sharesOutstanding: 1.2e9,
      eps: 2.4,
      dividendYield: 0.035,
      blurb: 'Renewables utility. Steadier, pays a solid dividend.',
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
      sector: 'Retail',
      sharesOutstanding: 2.5e9,
      eps: 9.2,
      dividendYield: 0.028,
      blurb: 'Defensive blue chip. Low drama, slow and steady.',
    ),
    AssetDef(
      id: 'fnb',
      name: 'First National Bank',
      ticker: 'FNB',
      categoryId: 'equities',
      kind: AssetKind.stock,
      basePrice: 64.0,
      dailyDrift: 0.0013,
      dailyVol: 0.04,
      sector: 'Financials',
      sharesOutstanding: 1.8e9,
      eps: 5.5,
      dividendYield: 0.031,
      blurb: 'Big bank. Cyclical, rate-sensitive, decent dividend.',
    ),
    AssetDef(
      id: 'medi',
      name: 'MediCorp',
      ticker: 'MEDI',
      categoryId: 'equities',
      kind: AssetKind.stock,
      basePrice: 156.0,
      dailyDrift: 0.0015,
      dailyVol: 0.034,
      sector: 'Healthcare',
      sharesOutstanding: 1.5e9,
      eps: 7.8,
      dividendYield: 0.018,
      blurb: 'Pharma giant. Defensive, steady earnings.',
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
      sector: 'Healthcare',
      sharesOutstanding: 0.4e9,
      eps: -1.2,
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
      sector: 'Diversified',
      sharesOutstanding: 0.9e9,
      dividendYield: 0.013,
      expenseRatio: 0.0003,
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
      sector: 'Diversified',
      sharesOutstanding: 1.4e9,
      dividendYield: 0.014,
      expenseRatio: 0.0004,
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
      sector: 'Diversified',
      sharesOutstanding: 0.6e9,
      dividendYield: 0.038,
      expenseRatio: 0.0006,
      blurb: 'Income-focused basket. Calmer, higher payout.',
    ),
    AssetDef(
      id: 'tech',
      name: 'Tech Sector ETF',
      ticker: 'TECH',
      categoryId: 'funds',
      kind: AssetKind.etf,
      basePrice: 198.0,
      dailyDrift: 0.0022,
      dailyVol: 0.033,
      sector: 'Technology',
      sharesOutstanding: 0.5e9,
      dividendYield: 0.007,
      expenseRatio: 0.001,
      blurb: 'Concentrated tech bet in one ticker. Punchier than SPX.',
    ),
    AssetDef(
      id: 'bndx',
      name: 'Bond Index ETF',
      ticker: 'BNDX',
      categoryId: 'funds',
      kind: AssetKind.etf,
      basePrice: 74.0,
      dailyDrift: 0.0004,
      dailyVol: 0.008,
      sector: 'Fixed Income',
      sharesOutstanding: 0.7e9,
      dividendYield: 0.042,
      expenseRatio: 0.0005,
      blurb: 'A basket of bonds. Ballast for a stock-heavy portfolio.',
    ),

    // ---- Crypto ----
    AssetDef(
      id: 'btq',
      name: 'Bitcorn',
      ticker: 'BTQ',
      categoryId: 'crypto',
      kind: AssetKind.crypto,
      basePrice: 43250.0,
      dailyDrift: 0.0075,
      dailyVol: 0.09,
      sector: 'Digital',
      sharesOutstanding: 1.95e7,
      blurb: 'The original. Massive swings, massive narratives.',
    ),
    AssetDef(
      id: 'etq',
      name: 'Etherium',
      ticker: 'ETQ',
      categoryId: 'crypto',
      kind: AssetKind.crypto,
      basePrice: 2280.0,
      dailyDrift: 0.008,
      dailyVol: 0.10,
      sector: 'Digital',
      sharesOutstanding: 1.2e8,
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
      sector: 'Digital',
      sharesOutstanding: 1.4e11,
      blurb: 'A meme. Pure casino. You have been warned.',
    ),
  ];

  /// The career ladder. Entry jobs need nothing; better rungs require a degree
  /// (see [degrees]) — a real time + money investment. Pay is per month.
  static const List<JobDef> jobs = [
    JobDef(id: 'barista', title: 'Barista', pay: 1300),
    JobDef(id: 'retail', title: 'Retail Associate', pay: 1650),
    JobDef(
        id: 'junior_dev',
        title: 'Junior Developer',
        pay: 3700,
        requiredEdu: 1),
    JobDef(id: 'accountant', title: 'Accountant', pay: 5000, requiredEdu: 2),
    JobDef(
        id: 'engineer',
        title: 'Software Engineer',
        pay: 7400,
        requiredEdu: 2),
    JobDef(
        id: 'banker',
        title: 'Investment Banker',
        pay: 12000,
        requiredEdu: 3),
  ];

  /// Degree programs. Each is a study period (part-time pay while enrolled) and
  /// tuition borrowed as a student loan that compounds until repaid.
  static const List<DegreeDef> degrees = [
    DegreeDef(
      id: 'associate',
      name: "Associate's Degree",
      level: 1,
      years: 2,
      tuition: 18000,
      blurb: 'Two years. Opens the door to skilled entry-level roles.',
    ),
    DegreeDef(
      id: 'bachelor',
      name: "Bachelor's Degree",
      level: 2,
      years: 4,
      tuition: 60000,
      blurb: 'Four years. The standard key to professional careers.',
    ),
    DegreeDef(
      id: 'master',
      name: "Master's Degree",
      level: 3,
      years: 6,
      tuition: 110000,
      blurb: 'Six years. Unlocks the highest-paying roles in the game.',
    ),
  ];

  /// Annual interest rate on the outstanding student-loan balance.
  static const double studentLoanRate = 0.06;

  // ---- Lookups (built once) ----
  static final Map<String, AssetDef> _byId = {
    for (final a in assets) a.id: a,
  };

  static AssetDef assetById(String id) => _byId[id]!;

  static List<AssetDef> assetsInCategory(String categoryId) =>
      assets.where((a) => a.categoryId == categoryId).toList();
}
