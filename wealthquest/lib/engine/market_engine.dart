import 'dart:math';

import '../models/asset.dart';

/// Pure market math, kept out of the controller so it can be unit-tested in
/// isolation and reasoned about deterministically (seed the [Random]).
class MarketEngine {
  /// Global "market calm" dial: every asset's weekly volatility is multiplied
  /// by this. 1.0 = raw catalog values; lower = calmer week-to-week swings.
  /// THE knob to make the whole market choppier or steadier.
  static const double volScale = 0.55;

  /// One standard-normal sample via Box–Muller.
  static double gauss(Random rng) {
    final u1 = rng.nextDouble().clamp(1e-12, 1.0);
    final u2 = rng.nextDouble();
    return sqrt(-2 * log(u1)) * cos(2 * pi * u2);
  }

  /// Advance a price-based asset by one day (= one game week).
  ///
  /// Geometric random walk: `price *= 1 + drift + vol * N(0,1) + bias`, floored
  /// so a price can crater but never goes to zero or negative. [bias] carries
  /// the effect of a resolved rumor for the week.
  static double stepPrice(double price, AssetDef def, Random rng,
      {double bias = 0}) {
    final ret = def.dailyDrift + def.dailyVol * volScale * gauss(rng) + bias;
    final next = price * (1 + ret);
    final floor = def.basePrice * 0.01;
    return next < floor ? floor : next;
  }
}
