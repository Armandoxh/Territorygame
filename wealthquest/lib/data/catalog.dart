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

  static const int startAge = 15;
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
    AssetDef(
      id: 'preipo',
      name: 'Pre-IPO Unicorn',
      ticker: 'UNI',
      categoryId: 'equities',
      kind: AssetKind.stock,
      basePrice: 28.0,
      dailyDrift: 0.0034,
      dailyVol: 0.085,
      sector: 'Technology',
      sharesOutstanding: 0.3e9,
      eps: -0.8,
      unlockLevel: 1,
      blurb: 'Late-stage private shares only the connected can buy. Huge upside, '
          'huge risk. (Unlocked at Prestige 1.)',
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
      marketBeta: 0.0, // bonds don't ride the equity market shock
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
      // A high-variance GAMBLE: median a touch BELOW the best safe play (you
      // give up expected median for the lottery upside), with a fat right tail
      // (moonshots) and brutal drawdowns. Drift sits just above the vol-drag so
      // the median is modestly positive but the tail does the work. Playtest-tuned.
      dailyDrift: 0.0064,
      dailyVol: 0.10,
      sector: 'Digital',
      sharesOutstanding: 1.95e7,
      blurb: 'The original. Massive swings, massive narratives. A coin-flip with '
          'a moonshot tail — not a retirement plan.',
    ),
    AssetDef(
      id: 'etq',
      name: 'Etherium',
      ticker: 'ETQ',
      categoryId: 'crypto',
      kind: AssetKind.crypto,
      basePrice: 2280.0,
      dailyDrift: 0.0066,
      dailyVol: 0.115,
      sector: 'Digital',
      sharesOutstanding: 1.2e8,
      blurb: 'Smart-contract platform. Even wilder than BTQ — bigger swings '
          'both ways.',
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

    // ---- Commodities (traded in the Comex app, not the Sherwood market) ----
    // — Precious metals: safe havens, ~uncorrelated to a slightly negative beta —
    AssetDef(
      id: 'gold',
      name: 'Gold',
      ticker: 'GLD',
      categoryId: 'commodities',
      kind: AssetKind.commodity,
      basePrice: 2050.0,
      dailyDrift: 0.0004,
      dailyVol: 0.026,
      sector: 'Metals',
      sharesOutstanding: 6.0e9,
      safeHaven: true,
      marketBeta: -0.15,
      unit: '/oz',
      blurb: 'The classic safe haven. Climbs when markets panic, lags in booms.',
    ),
    AssetDef(
      id: 'silver',
      name: 'Silver',
      ticker: 'SLV',
      categoryId: 'commodities',
      kind: AssetKind.commodity,
      basePrice: 24.5,
      dailyDrift: 0.0005,
      dailyVol: 0.045,
      sector: 'Metals',
      sharesOutstanding: 8.0e9,
      safeHaven: true,
      marketBeta: -0.05,
      unit: '/oz',
      blurb: 'Gold\'s wilder cousin — a safe haven with more whip and industrial use.',
    ),
    AssetDef(
      id: 'platinum',
      name: 'Platinum',
      ticker: 'PLT',
      categoryId: 'commodities',
      kind: AssetKind.commodity,
      basePrice: 980.0,
      dailyDrift: 0.0006,
      dailyVol: 0.04,
      sector: 'Metals',
      sharesOutstanding: 2.0e9,
      safeHaven: true,
      marketBeta: 0.30,
      unit: '/oz',
      unlockLevel: 1,
      blurb: 'A rarer safe-haven metal — both precious and industrial. '
          '(Unlocked at Prestige 1.)',
    ),
    AssetDef(
      id: 'palladium',
      name: 'Palladium',
      ticker: 'PALL',
      categoryId: 'commodities',
      kind: AssetKind.commodity,
      basePrice: 1450.0,
      dailyDrift: 0.0005,
      dailyVol: 0.06,
      sector: 'Metals',
      sharesOutstanding: 1.5e9,
      marketBeta: 0.40,
      unit: '/oz',
      blurb: 'The catalytic-converter metal — precious, but priced off car output.',
    ),

    // — Energy: pro-cyclical, geopolitical, weather-driven —
    AssetDef(
      id: 'oil',
      name: 'Crude Oil',
      ticker: 'OIL',
      categoryId: 'commodities',
      kind: AssetKind.commodity,
      basePrice: 78.0,
      dailyDrift: 0.0006,
      dailyVol: 0.06,
      sector: 'Energy',
      sharesOutstanding: 4.0e9,
      marketBeta: 0.55,
      unit: '/bbl',
      blurb: 'Pro-cyclical and geopolitical — booms and busts with the economy.',
    ),
    AssetDef(
      id: 'gasoline',
      name: 'Gasoline',
      ticker: 'RBOB',
      categoryId: 'commodities',
      kind: AssetKind.commodity,
      basePrice: 2.45,
      dailyDrift: 0.0005,
      dailyVol: 0.07,
      sector: 'Energy',
      sharesOutstanding: 3.0e9,
      marketBeta: 0.50,
      unit: '/gal',
      blurb: 'Refined crude with a seasonal kick — driving season pumps it up.',
    ),
    AssetDef(
      id: 'natgas',
      name: 'Natural Gas',
      ticker: 'GAS',
      categoryId: 'commodities',
      kind: AssetKind.commodity,
      basePrice: 2.85,
      dailyDrift: 0.0003,
      dailyVol: 0.11,
      sector: 'Energy',
      sharesOutstanding: 3.0e9,
      marketBeta: 0.30,
      unit: '/MMBtu',
      blurb: 'Brutally volatile — weather and storage send it flying.',
    ),

    // — Industrial metals: the global-growth bellwethers —
    AssetDef(
      id: 'copper',
      name: 'Copper',
      ticker: 'CPR',
      categoryId: 'commodities',
      kind: AssetKind.commodity,
      basePrice: 4.15,
      dailyDrift: 0.0007,
      dailyVol: 0.05,
      sector: 'Industrial',
      sharesOutstanding: 5.0e9,
      marketBeta: 0.85,
      unit: '/lb',
      blurb: 'Dr. Copper — tracks industrial demand and global growth most of all.',
    ),
    AssetDef(
      id: 'aluminum',
      name: 'Aluminum',
      ticker: 'ALU',
      categoryId: 'commodities',
      kind: AssetKind.commodity,
      basePrice: 2.30,
      dailyDrift: 0.0005,
      dailyVol: 0.045,
      sector: 'Industrial',
      sharesOutstanding: 5.0e9,
      marketBeta: 0.70,
      unit: '/lb',
      blurb: 'Energy-hungry to smelt; rises and falls with global manufacturing.',
    ),

    // — Grains: weather and harvests, lightly tied to the economy —
    AssetDef(
      id: 'wheat',
      name: 'Wheat',
      ticker: 'WHT',
      categoryId: 'commodities',
      kind: AssetKind.commodity,
      basePrice: 6.40,
      dailyDrift: 0.0003,
      dailyVol: 0.055,
      sector: 'Agriculture',
      sharesOutstanding: 4.0e9,
      marketBeta: 0.15,
      unit: '/bushel',
      blurb: 'Harvests and droughts drive it — marches to its own drum.',
    ),
    AssetDef(
      id: 'corn',
      name: 'Corn',
      ticker: 'CRN',
      categoryId: 'commodities',
      kind: AssetKind.commodity,
      basePrice: 4.80,
      dailyDrift: 0.0003,
      dailyVol: 0.05,
      sector: 'Agriculture',
      sharesOutstanding: 5.0e9,
      marketBeta: 0.15,
      unit: '/bushel',
      blurb: 'Feed, fuel and food — weather and ethanol demand call the tune.',
    ),
    AssetDef(
      id: 'soybeans',
      name: 'Soybeans',
      ticker: 'SOY',
      categoryId: 'commodities',
      kind: AssetKind.commodity,
      basePrice: 13.20,
      dailyDrift: 0.0004,
      dailyVol: 0.05,
      sector: 'Agriculture',
      sharesOutstanding: 4.0e9,
      marketBeta: 0.20,
      unit: '/bushel',
      blurb: 'A global export crop — swings with weather and trade policy.',
    ),

    // — Softs: tropical crops, pure weather lottery —
    AssetDef(
      id: 'coffee',
      name: 'Coffee',
      ticker: 'KC',
      categoryId: 'commodities',
      kind: AssetKind.commodity,
      basePrice: 1.85,
      dailyDrift: 0.0004,
      dailyVol: 0.075,
      sector: 'Softs',
      sharesOutstanding: 2.0e9,
      marketBeta: 0.10,
      unit: '/lb',
      blurb: 'A frost in Brazil can double it overnight. Pure weather lottery.',
    ),
    AssetDef(
      id: 'sugar',
      name: 'Sugar',
      ticker: 'SB',
      categoryId: 'commodities',
      kind: AssetKind.commodity,
      basePrice: 0.22,
      dailyDrift: 0.0003,
      dailyVol: 0.06,
      sector: 'Softs',
      sharesOutstanding: 3.0e9,
      marketBeta: 0.10,
      unit: '/lb',
      blurb: 'Sweet and cyclical — harvests, ethanol, and the weather.',
    ),
    AssetDef(
      id: 'cotton',
      name: 'Cotton',
      ticker: 'CT',
      categoryId: 'commodities',
      kind: AssetKind.commodity,
      basePrice: 0.82,
      dailyDrift: 0.0003,
      dailyVol: 0.055,
      sector: 'Softs',
      sharesOutstanding: 2.5e9,
      marketBeta: 0.25,
      unit: '/lb',
      blurb: 'A fiber tied to consumer demand and how many acres got planted.',
    ),

    // — Livestock: herd cycles, feed costs, the occasional disease scare —
    AssetDef(
      id: 'cattle',
      name: 'Live Cattle',
      ticker: 'LC',
      categoryId: 'commodities',
      kind: AssetKind.commodity,
      basePrice: 1.78,
      dailyDrift: 0.0003,
      dailyVol: 0.035,
      sector: 'Livestock',
      sharesOutstanding: 2.0e9,
      marketBeta: 0.15,
      unit: '/lb',
      blurb: 'Slow herd cycles and feed costs — lumbering, trending moves.',
    ),
    AssetDef(
      id: 'hogs',
      name: 'Lean Hogs',
      ticker: 'HE',
      categoryId: 'commodities',
      kind: AssetKind.commodity,
      basePrice: 0.85,
      dailyDrift: 0.0003,
      dailyVol: 0.06,
      sector: 'Livestock',
      sharesOutstanding: 2.0e9,
      marketBeta: 0.10,
      unit: '/lb',
      blurb: 'Disease scares and feed prices whip it around.',
    ),
  ];

  /// The starting career track everyone begins in.
  static const String startingTrackId = 'service';

  /// Career tracks: pick a line and climb it by TENURE (auto-promotion). Each
  /// trades off ramp time, ceiling, and the schooling/debt it demands. Rung pay
  /// is per month; rungMonths[i] is how long you spend on rung i before the next.
  static const List<CareerTrack> careerTracks = [
    // ☕ No degree, the starter track, low ceiling — zero debt, instant income.
    CareerTrack(
      id: 'service',
      name: 'Service & Hospitality',
      emoji: '☕',
      // The starter track: a part-time gig you can hold from the start age (the
      // player begins on it), no degree. Climb to managing a region — but the
      // ceiling is modest.
      minAge: startAge,
      blurb: 'Start earning today, no degree. Climb to managing a region — but '
          'the ceiling is modest.',
      rungs: [
        JobDef(id: 'svc_crew', title: 'Barista / Crew', pay: 1300),
        JobDef(id: 'svc_lead', title: 'Shift Lead', pay: 2000),
        JobDef(id: 'svc_mgr', title: 'Store Manager', pay: 3400),
        JobDef(id: 'svc_regional', title: 'Regional Manager', pay: 6000),
      ],
      rungMonths: [48, 84, 108, 0], // Service: top ~20 yrs
    ),
    // 🔧 A cheap, short trade school — then earn well fast with a solid ceiling
    // and no big-college debt. The anti-debt path (but not free).
    CareerTrack(
      id: 'trades',
      name: 'Skilled Trades',
      emoji: '🔧',
      requiredDegreeId: 'trade',
      blurb: 'Electrician, plumber, welder. A quick trade-school cert, then real '
          'money fast and your own shop at the top — without the four-year debt.',
      rungs: [
        JobDef(id: 'trade_appr', title: 'Apprentice', pay: 3200),
        JobDef(id: 'trade_journey', title: 'Journeyman', pay: 6000),
        JobDef(id: 'trade_master', title: 'Master Tradesperson', pay: 10000),
        JobDef(id: 'trade_owner', title: 'Contractor / Shop Owner', pay: 20000),
      ],
      rungMonths: [48, 108, 144, 0], // Trades: top ~25 yrs
    ),
    // 💻 Cheap, fast education; high ceiling. The best ROI on a degree.
    CareerTrack(
      id: 'tech',
      name: 'Software & Tech',
      emoji: '💻',
      blurb: 'An associate degree is enough to start. Fast ramp, high ceiling — '
          'the best return on tuition.',
      minEduLevel: 1,
      rungs: [
        JobDef(id: 'tech_junior', title: 'Junior Developer', pay: 5000, requiredEdu: 1),
        JobDef(id: 'tech_swe', title: 'Software Engineer', pay: 8500, requiredEdu: 1),
        JobDef(id: 'tech_senior', title: 'Senior Engineer', pay: 13000, requiredEdu: 1),
        JobDef(id: 'tech_staff', title: 'Staff Engineer', pay: 19000, requiredEdu: 1),
        JobDef(id: 'tech_director', title: 'Engineering Director', pay: 28000, requiredEdu: 1),
      ],
      rungMonths: [48, 84, 96, 108, 0], // Tech: top ~28 yrs
    ),
    // 💼 Bachelor's; brutal grind, very high ceiling. Analyst → MD.
    CareerTrack(
      id: 'finance',
      name: 'Finance & Banking',
      emoji: '💼',
      blurb: 'Bachelor\'s to start. Long hours and a hard climb — but Managing '
          'Director money is enormous.',
      minEduLevel: 2,
      rungs: [
        JobDef(id: 'fin_analyst', title: 'Analyst', pay: 8000, requiredEdu: 2),
        JobDef(id: 'fin_assoc', title: 'Associate', pay: 13000, requiredEdu: 2),
        JobDef(id: 'fin_vp', title: 'Vice President', pay: 21000, requiredEdu: 2),
        JobDef(id: 'fin_director', title: 'Director', pay: 35000, requiredEdu: 2),
        JobDef(id: 'fin_md', title: 'Managing Director', pay: 58000, requiredEdu: 2),
      ],
      rungMonths: [48, 96, 120, 144, 0], // Finance: top ~34 yrs (the grind)
    ),
    // 📊 Master's required, steady and respectable — but a lower ceiling.
    CareerTrack(
      id: 'accounting',
      name: 'Accounting',
      emoji: '📊',
      blurb: 'A master\'s gets you a solid, stable corporate ladder to CFO — '
          'comfortable, dependable, but it caps out lower.',
      minEduLevel: 3,
      rungs: [
        JobDef(id: 'acct_staff', title: 'Staff Accountant', pay: 6500, requiredEdu: 3),
        JobDef(id: 'acct_senior', title: 'Senior Accountant', pay: 10000, requiredEdu: 3),
        JobDef(id: 'acct_mgr', title: 'Accounting Manager', pay: 17000, requiredEdu: 3),
        JobDef(id: 'acct_controller', title: 'Controller', pay: 30000, requiredEdu: 3),
        JobDef(id: 'acct_cfo', title: 'CFO', pay: 52000, requiredEdu: 3),
      ],
      // Faster ramp than Finance + a high floor: the master's gets you senior
      // sooner, so you out-earn the finance grind through much of mid-career
      // before its higher ceiling pulls ahead. Top ~30 yrs.
      rungMonths: [36, 84, 108, 132, 0],
    ),
    // 🩺 Huge loan, 8 years of school, years of low-paid residency — then the
    // highest ceiling in the game. The long game.
    CareerTrack(
      id: 'medicine',
      name: 'Medicine',
      emoji: '🩺',
      blurb: 'Medical school is a fortune and 8 years; then years of low-paid '
          'residency. Survive it and you out-earn everyone.',
      minEduLevel: 3,
      requiredDegreeId: 'med',
      rungs: [
        JobDef(id: 'med_resident', title: 'Resident', pay: 5000, requiredEdu: 3),
        JobDef(id: 'med_fellow', title: 'Fellow', pay: 8000, requiredEdu: 3),
        JobDef(id: 'med_attending', title: 'Attending Physician', pay: 30000, requiredEdu: 3),
        JobDef(id: 'med_specialist', title: 'Specialist', pay: 48000, requiredEdu: 3),
        JobDef(id: 'med_chief', title: 'Chief of Medicine', pay: 72000, requiredEdu: 3),
      ],
      rungMonths: [60, 48, 132, 156, 0], // Medicine: top ~33 yrs (after school)
    ),
    // ⚖️ Law school loan, long climb, partner-track upside.
    CareerTrack(
      id: 'law',
      name: 'Law',
      emoji: '⚖️',
      blurb: 'Law school debt and a punishing associate grind, but making '
          'Partner pays like few other careers.',
      minEduLevel: 3,
      requiredDegreeId: 'law',
      rungs: [
        JobDef(id: 'law_assoc', title: 'Associate Attorney', pay: 9000, requiredEdu: 3),
        JobDef(id: 'law_senior', title: 'Senior Associate', pay: 16000, requiredEdu: 3),
        JobDef(id: 'law_jr_partner', title: 'Junior Partner', pay: 28000, requiredEdu: 3),
        JobDef(id: 'law_partner', title: 'Partner', pay: 52000, requiredEdu: 3),
      ],
      rungMonths: [60, 120, 180, 0], // Law: Partner ~30 yrs
    ),
    // 🚀 Prestige reward: no degree, slow burn, life-changing exit. Unlocked by
    // retiring and starting over.
    CareerTrack(
      id: 'founder',
      name: 'Startup Founder',
      emoji: '🚀',
      blurb: 'Ramen-noodle years, then funding, then scale — and an exit that '
          'dwarfs any salary. Unlocked at Prestige 1.',
      unlockLevel: 1,
      rungs: [
        JobDef(id: 'founder_garage', title: 'Bootstrapper', pay: 2000, unlockLevel: 1),
        JobDef(id: 'founder_seed', title: 'Funded Founder', pay: 6000, unlockLevel: 1),
        JobDef(id: 'founder_scale', title: 'Scale-up CEO', pay: 18000, unlockLevel: 1),
        JobDef(id: 'founder_exit', title: 'Exited Founder', pay: 58000, unlockLevel: 1),
      ],
      rungMonths: [60, 120, 180, 0], // Founder: exit ~30 yrs
    ),
  ];

  /// All rungs across every track, flattened (for lookups + the balance report).
  static final List<JobDef> jobs = [
    for (final t in careerTracks) ...t.rungs,
  ];

  static final Map<String, CareerTrack> _trackById = {
    for (final t in careerTracks) t.id: t,
  };
  static final Map<String, CareerTrack> _trackByEntry = {
    for (final t in careerTracks) t.entry.id: t,
  };

  static CareerTrack? trackById(String? id) => id == null ? null : _trackById[id];

  /// The track whose ENTRY rung is [jobId] (used to map a "take job" to joining
  /// a track at the bottom).
  static CareerTrack? trackForEntryJob(String jobId) => _trackByEntry[jobId];

  /// Degree programs. Each is a study period (part-time pay while enrolled) and
  /// tuition borrowed as a student loan that compounds until repaid.
  static const List<DegreeDef> degrees = [
    DegreeDef(
      id: 'trade',
      name: 'Trade School',
      level: 0, // a vocational cert, not a general-education level
      years: 3,
      tuition: 20000,
      professional: true, // specific credential — only unlocks Skilled Trades
      blurb: 'Three cheap years of hands-on training — the key to the Trades.',
    ),
    DegreeDef(
      id: 'associate',
      name: "Associate's Degree",
      level: 1,
      years: 2,
      tuition: 36000,
      blurb: 'Two years. Opens the door to skilled entry-level roles.',
    ),
    DegreeDef(
      id: 'bachelor',
      name: "Bachelor's Degree",
      level: 2,
      years: 4,
      tuition: 100000,
      blurb: 'Four years. The standard key to professional careers.',
    ),
    DegreeDef(
      id: 'master',
      name: "Master's Degree",
      level: 3,
      years: 6,
      tuition: 200000,
      blurb: 'Six years. Unlocks the highest-paying corporate roles — and a big loan.',
    ),
    DegreeDef(
      id: 'med',
      name: 'Medical School (MD)',
      level: 3,
      years: 8,
      tuition: 340000,
      professional: true,
      blurb: 'Eight years and a fortune in loans — the only door into Medicine.',
    ),
    DegreeDef(
      id: 'law',
      name: 'Law School (JD)',
      level: 3,
      years: 7,
      tuition: 230000,
      professional: true,
      blurb: 'Seven years and heavy debt — required to practice Law.',
    ),
  ];

  /// Annual interest rate on the outstanding student-loan balance. High enough
  /// that paying it down competes with investing — a real decision.
  static const double studentLoanRate = 0.075;

  /// Standard repayment term once you graduate — the loan amortizes over this
  /// like a mortgage (a required monthly payment, not an ignorable balance).
  static const int studentLoanRepaymentMonths = 120; // 10 years

  // ---- Income tax (on wages) ----
  /// Income shielded from tax before brackets apply (a standard deduction).
  static const double standardDeduction = 14600;

  /// Preferential flat rate on investment income in a TAXABLE brokerage:
  /// qualified dividends / bond coupons (paid monthly) and realized capital
  /// gains on a sale. Lower than wage brackets — and avoided entirely inside a
  /// tax-sheltered account (the 401k). This is what makes WHERE you hold money
  /// matter: a taxable account skims your gains; the 401k compounds untaxed.
  static const double dividendTaxRate = 0.15;
  static const double capitalGainsRate = 0.15;

  /// Progressive federal-style brackets: [upper bound, marginal rate]. Applied
  /// to taxable wages = gross salary − pre-tax 401(k) − standard deduction.
  static const List<List<double>> taxBrackets = [
    [11600, 0.10],
    [47150, 0.12],
    [100525, 0.22],
    [191950, 0.24],
    [243725, 0.32],
    [609350, 0.35],
    [double.infinity, 0.37],
  ];

  /// Annual income tax on [annualTaxableIncome] (already net of deductions).
  static double incomeTaxOnTaxable(double annualTaxableIncome) {
    if (annualTaxableIncome <= 0) return 0;
    var tax = 0.0;
    var lower = 0.0;
    for (final b in taxBrackets) {
      final upper = b[0];
      if (annualTaxableIncome <= lower) break;
      final top = annualTaxableIncome < upper ? annualTaxableIncome : upper;
      tax += (top - lower) * b[1];
      lower = upper;
    }
    return tax;
  }

  // ---- Lookups (built once) ----
  static final Map<String, AssetDef> _byId = {
    for (final a in assets) a.id: a,
  };

  static AssetDef assetById(String id) => _byId[id]!;

  static List<AssetDef> assetsInCategory(String categoryId) =>
      assets.where((a) => a.categoryId == categoryId).toList();

  /// Names of content (jobs + assets) that unlock at exactly prestige [level].
  /// Used by the retirement/legacy screen to show what's new next life.
  static List<String> unlocksAt(int level) {
    final out = <String>[];
    for (final j in jobs) {
      if (j.unlockLevel == level) out.add('${j.title} — career');
    }
    for (final a in assets) {
      if (a.unlockLevel == level) out.add('${a.name} — ${a.kind.label.toLowerCase()}');
    }
    return out;
  }
}
