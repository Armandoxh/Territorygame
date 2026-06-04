import 'dart:math';

import '../models/asset.dart';
import '../models/climate.dart';

/// Pure macro-economy math: how the market regime evolves week to week, how
/// strongly each asset reacts (beta), and the occasional sector boom/bust.
/// Seedable via the [Random] passed in.
class ClimateEngine {
  ClimateEngine._();

  /// Fraction an uninsured cash holding loses in a crash week.
  static const double crashCashLoss = 0.02;

  static const double _refVol = 0.03; // a "typical" stock's weekly vol
  static const double _maxBeta = 1.8;

  /// How hard an asset swings with the macro climate. Low-vol assets (bonds,
  /// cash funds) barely move; crypto swings the most. Capped so a crash doesn't
  /// vaporize crypto entirely.
  static double beta(AssetDef a) {
    if (a.dailyVol <= 0) return 0;
    final b = a.dailyVol / _refVol;
    return b > _maxBeta ? _maxBeta : b;
  }

  /// Markov transition for the market regime. Crashes are rare and always
  /// snap to a recovery the following week.
  static MarketRegime nextRegime(MarketRegime cur, Random rng) {
    final r = rng.nextDouble();
    switch (cur) {
      case MarketRegime.crash:
        return MarketRegime.recovery;
      case MarketRegime.recovery:
        return r < 0.45 ? MarketRegime.recovery : MarketRegime.normal;
      case MarketRegime.boom:
        if (r < 0.80) return MarketRegime.boom;
        if (r < 0.94) return MarketRegime.normal;
        if (r < 0.99) return MarketRegime.downturn;
        return MarketRegime.crash; // ~1%
      case MarketRegime.downturn:
        if (r < 0.70) return MarketRegime.downturn;
        if (r < 0.85) return MarketRegime.normal;
        if (r < 0.93) return MarketRegime.boom;
        return MarketRegime.crash; // ~7% — bear markets crash more often
      case MarketRegime.normal:
        if (r < 0.84) return MarketRegime.normal;
        if (r < 0.91) return MarketRegime.boom;
        if (r < 0.988) return MarketRegime.downturn;
        return MarketRegime.crash; // ~1.2%
    }
  }

  /// Sectors that can get their own boom/bust headlines.
  static const List<String> eventableSectors = [
    'Technology',
    'Energy',
    'Healthcare',
    'Automotive',
    'Retail',
    'Financials',
    'Digital',
  ];

  static String _displaySector(String sector) =>
      sector == 'Digital' ? 'Crypto' : sector;

  static SectorEvent randomSectorEvent(Random rng) {
    final sector = eventableSectors[rng.nextInt(eventableSectors.length)];
    final dir = rng.nextBool() ? 1 : -1;
    final magnitude = 0.02 + rng.nextDouble() * 0.03; // 2%–5% / week
    final weeks = 1 + rng.nextInt(3); // 1–3 weeks
    final name = _displaySector(sector);
    final bullPool = [
      '$name stocks are on a tear',
      'Money is pouring into $name',
      '$name is the market\'s darling right now',
    ];
    final bearPool = [
      '$name is selling off hard',
      'Trouble brewing across $name',
      'Investors are fleeing $name',
    ];
    final pool = dir > 0 ? bullPool : bearPool;
    return SectorEvent(
      sector: sector,
      dir: dir,
      magnitude: magnitude,
      headline: pool[rng.nextInt(pool.length)],
      weeksLeft: weeks,
    );
  }
}
