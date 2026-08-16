import 'dart:math';

import '../data/catalog.dart';
import '../models/asset.dart';

/// Pure market math, kept out of the controller so it can be unit-tested in
/// isolation and reasoned about deterministically (seed the [Random]).
class MarketEngine {
  /// Global "market calm" dial: every asset's weekly volatility is multiplied
  /// by this. 1.0 = raw catalog values; lower = calmer week-to-week swings.
  /// THE knob to make the whole market choppier or steadier.
  static const double volScale = 0.55;

  /// Global expected-return dial: every price-based asset's weekly drift is
  /// multiplied by this. >1 widens the risk premium of stocks/crypto over the
  /// fixed cash rate (which this does NOT touch). Tune so risk beats cash.
  static const double driftScale = 1.0;

  /// Standard deviation of the shared weekly MARKET shock — the common factor
  /// that makes risk assets co-move (real markets aren't a bag of independent
  /// coin flips). Tuned so a beta-1 stock draws ~a third of its weekly variance
  /// from the market, the rest idiosyncratic.
  static const double marketStd = 0.030;

  /// One standard-normal sample via Box–Muller.
  static double gauss(Random rng) {
    final u1 = rng.nextDouble().clamp(1e-12, 1.0);
    final u2 = rng.nextDouble();
    return sqrt(-2 * log(u1)) * cos(2 * pi * u2);
  }

  /// Draw this week's shared market shock (zero-mean). Call ONCE per week and
  /// feed it to every [stepPrice] via `market:`.
  static double marketFactor(Random rng) => marketStd * gauss(rng);

  /// How strongly an asset rides the shared market shock. An explicit
  /// [AssetDef.marketBeta] wins; otherwise a sane per-kind default. Commodities
  /// set their own (energy/industrials high, precious metals near zero/negative).
  static double effectiveBeta(AssetDef def) {
    if (!def.marketBeta.isNaN) return def.marketBeta;
    switch (def.kind) {
      case AssetKind.stock:
        return 1.0;
      case AssetKind.crypto:
        return 1.5;
      case AssetKind.etf:
        return 0.9;
      default:
        return 0.0; // bonds & cash-like: not equity-correlated
    }
  }

  /// Advance a price-based asset by one day (= one game week).
  ///
  /// Factor model: `ret = drift + beta*market + residual*N(0,1) + bias`, where
  /// `market` is the shared weekly shock and the idiosyncratic vol is shrunk so
  /// TOTAL marginal volatility is unchanged — this adds correlation without
  /// making any single asset wilder. [bias] carries a resolved rumor.
  static double stepPrice(double price, AssetDef def, Random rng,
      {double bias = 0, double market = 0}) {
    final totalVol = def.dailyVol * volScale * Catalog.volStepFactor;
    final beta = effectiveBeta(def);
    // The market loading (signed, in vol units) can't exceed the asset's own
    // marginal vol — cap it so a high beta on a low-vol asset can't inflate its
    // volatility. At the cap the asset is fully market-driven (e.g. an index
    // ETF), still at its intended total vol; the rest stays idiosyncratic.
    var marketVol = beta * marketStd;
    if (marketVol.abs() > totalVol) {
      marketVol = marketVol.isNegative ? -totalVol : totalVol;
    }
    final marketComponent = marketStd == 0 ? 0.0 : (marketVol / marketStd) * market;
    final residualVol =
        sqrt(max(0.0, totalVol * totalVol - marketVol * marketVol));
    final ret = def.dailyDrift * driftScale * Catalog.driftStepFactor +
        marketComponent +
        residualVol * gauss(rng) +
        bias;
    final next = price * (1 + ret);
    final floor = def.basePrice * 0.01;
    return next < floor ? floor : next;
  }
}
