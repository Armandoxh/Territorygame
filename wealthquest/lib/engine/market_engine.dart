import 'dart:math';

import '../models/asset.dart';

/// Pure market math, kept out of the controller so it can be unit-tested in
/// isolation and reasoned about deterministically (seed the [Random]).
class MarketEngine {
  /// One standard-normal sample via Box–Muller.
  static double gauss(Random rng) {
    final u1 = rng.nextDouble().clamp(1e-12, 1.0);
    final u2 = rng.nextDouble();
    return sqrt(-2 * log(u1)) * cos(2 * pi * u2);
  }

  /// Advance a price-based asset by one day (= one game week).
  ///
  /// Geometric random walk: `price *= 1 + drift + vol * N(0,1)`, floored so a
  /// price can crater but never goes to zero or negative.
  static double stepPrice(double price, AssetDef def, Random rng) {
    final ret = def.dailyDrift + def.dailyVol * gauss(rng);
    final next = price * (1 + ret);
    final floor = def.basePrice * 0.01;
    return next < floor ? floor : next;
  }
}
