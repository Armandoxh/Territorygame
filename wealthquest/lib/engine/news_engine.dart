import 'dart:math';

import '../data/catalog.dart';
import '../models/asset.dart';
import '../models/rumor.dart';

/// Generates the weekly newspaper edition — a handful of rumors targeting
/// random price-based assets. Pure given the [Random], so it stays
/// deterministic under a seed.
class NewsEngine {
  NewsEngine._();

  /// Base chance a rumor is true — a coin flip. The upgrade tree will raise
  /// this later.
  static const double baseReliability = 0.50;

  static const int rumorsPerEdition = 4;

  static List<Rumor> generateEdition(Random rng, int week) {
    final byKind = <AssetKind, List<AssetDef>>{};
    for (final a in Catalog.assets) {
      if (a.kind.isPriceBased) {
        byKind.putIfAbsent(a.kind, () => []).add(a);
      }
    }

    final picks = <AssetDef>[];
    // Guarantee each edition covers the exciting categories.
    for (final k in const [AssetKind.stock, AssetKind.etf, AssetKind.crypto]) {
      final pool = byKind[k];
      if (pool != null && pool.isNotEmpty) {
        picks.add(pool[rng.nextInt(pool.length)]);
      }
    }
    // One wildcard from any price-based asset (could be a bond or a repeat kind).
    final all = Catalog.assets.where((a) => a.kind.isPriceBased).toList();
    if (all.isNotEmpty) picks.add(all[rng.nextInt(all.length)]);

    // Dedupe (keep first), then shuffle for presentation order.
    final seen = <String>{};
    final unique = [
      for (final a in picks)
        if (seen.add(a.id)) a,
    ]..shuffle(rng);

    return [for (final a in unique) _rumorFor(a, rng, week)];
  }

  /// A single targeted tip the player picks up at a life event — same shape as
  /// an edition rumor, but aimed at a chosen [kind] with a caller-set
  /// [reliability] (events are better intel than the open rumor mill).
  static Rumor insiderTip(
      Random rng, int week, AssetKind kind, double reliability) {
    final pool =
        Catalog.assets.where((a) => a.kind == kind && a.kind.isPriceBased).toList();
    final a = pool.isEmpty
        ? Catalog.assets.firstWhere((x) => x.kind.isPriceBased)
        : pool[rng.nextInt(pool.length)];
    final base = _rumorFor(a, rng, week);
    return Rumor(
      assetId: base.assetId,
      dir: base.dir,
      magnitude: base.magnitude,
      reliability: reliability,
      headline: base.headline,
      createdWeek: week,
    );
  }

  static Rumor _rumorFor(AssetDef a, Random rng, int week) {
    final dir = rng.nextBool() ? 1 : -1;
    final magnitude =
        (a.dailyVol * (1.2 + rng.nextDouble() * 1.6) * Catalog.volStepFactor)
            .clamp(0.02, 0.35);
    return Rumor(
      assetId: a.id,
      dir: dir,
      magnitude: magnitude.toDouble(),
      reliability: baseReliability,
      headline: _headline(a, dir, rng),
      createdWeek: week,
    );
  }

  static String _headline(AssetDef a, int dir, Random rng) {
    final bull = dir > 0;
    final List<String> pool;
    switch (a.kind) {
      case AssetKind.crypto:
        pool = bull
            ? [
                'Influencers are pumping ${a.name} — "next leg up is coming"',
                'Whispers of a major exchange listing for ${a.ticker}',
                'Forums say smart money is quietly piling into ${a.name}',
              ]
            : [
                'Chatter of a security exploit hitting ${a.name}',
                'Talk that a whale is about to dump ${a.ticker}',
                'Rumors of a regulatory crackdown on ${a.name}',
              ];
        break;
      case AssetKind.bond:
        pool = bull
            ? [
                'Word is the Fed will cut rates — ${a.name} set to rally',
                'Insiders expect heavy demand for ${a.ticker} at auction',
              ]
            : [
                'Chatter of a surprise rate hike — pressure on ${a.name}',
                'Rumors of a credit downgrade for ${a.ticker}',
              ];
        break;
      case AssetKind.etf:
        pool = bull
            ? [
                'Strategists whisper a ${a.sector} rally is brewing (${a.ticker})',
                'Big funds reportedly rotating into ${a.name}',
              ]
            : [
                'Talk that ${a.sector} is about to roll over (${a.ticker})',
                'Outflows rumored from ${a.name}',
              ];
        break;
      case AssetKind.stock:
      default:
        pool = bull
            ? [
                'Insiders whisper ${a.name} is about to land a blockbuster deal',
                'Word is ${a.name} crushed earnings this quarter',
                'Rumor: a big fund is quietly accumulating ${a.ticker}',
                'Buzz of a buyout offer for ${a.name}',
              ]
            : [
                'Talk of an accounting probe at ${a.name}',
                'Sources hint ${a.name} will badly miss its numbers',
                'Rumor: key executives are heading for the exits at ${a.ticker}',
                'Whispers of a product recall at ${a.name}',
              ];
    }
    return pool[rng.nextInt(pool.length)];
  }
}
