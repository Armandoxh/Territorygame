import 'package:flutter/material.dart';

import '../engine/market_engine.dart';
import '../models/asset.dart';
import '../state/game_controller.dart';
import '../util/format.dart';
import 'asset_detail_screen.dart';
import 'widgets/ui_helpers.dart';

/// "Comex" — a real commodities desk, organized by sector: energy, metals,
/// industrial, grains, softs, livestock. Traded like stocks (buy / sell /
/// short) but with no dividends. Crucially, commodities now CO-MOVE with the
/// stock market: energy & industrial metals ride the weekly market shock,
/// precious metals hedge against it.
class CommoditiesBody extends StatelessWidget {
  const CommoditiesBody({super.key, required this.game});

  final GameController game;

  /// Sectors in the order a trader scans them.
  static const List<String> _sectorOrder = [
    'Energy',
    'Metals',
    'Industrial',
    'Agriculture',
    'Softs',
    'Livestock',
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final items = game.unlockedAssets('commodities');
    final bySector = <String, List<AssetDef>>{};
    for (final a in items) {
      bySector.putIfAbsent(a.sector, () => []).add(a);
    }
    final sectors = [
      ..._sectorOrder.where(bySector.containsKey),
      ...bySector.keys.where((s) => !_sectorOrder.contains(s)),
    ];

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
      children: [
        _SentimentBanner(factor: game.lastMarketFactor),
        for (final s in sectors) ...[
          Padding(
            padding: const EdgeInsets.only(top: 12, bottom: 4),
            child: Text(s, style: theme.textTheme.titleMedium),
          ),
          ...bySector[s]!.map((a) => _CommodityRow(game: game, def: a)),
        ],
      ],
    );
  }
}

/// Reads the week's shared market shock and tells the player how commodities
/// are reacting — the teaching moment for the stock↔commodity link.
class _SentimentBanner extends StatelessWidget {
  const _SentimentBanner({required this.factor});
  final double factor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final String mood;
    final String detail;
    final Color color;
    if (factor > 0.008) {
      mood = '📈 Risk-on week';
      detail =
          'Equities pushed higher — energy and industrial metals rode along; '
          'gold lagged.';
      color = kGain;
    } else if (factor < -0.008) {
      mood = '📉 Risk-off week';
      detail =
          'Equities fell — growth-linked commodities dipped while gold caught '
          'a safe-haven bid.';
      color = kLoss;
    } else {
      mood = '➖ Quiet market';
      detail =
          'Commodities move WITH stocks: energy & industrial metals track the '
          'market, precious metals hedge against it.';
      color = theme.colorScheme.primary;
    }
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(mood,
              style: theme.textTheme.titleSmall
                  ?.copyWith(fontWeight: FontWeight.bold, color: color)),
          const SizedBox(height: 2),
          Text(detail, style: theme.textTheme.bodySmall),
        ],
      ),
    );
  }
}

/// How a commodity relates to the stock market, derived from its beta.
({String text, Color color}) _correlation(AssetDef def, ThemeData theme) {
  final b = MarketEngine.effectiveBeta(def);
  if (b <= -0.05) {
    return (text: 'stock hedge ↓', color: kGain);
  } else if (b >= 0.6) {
    return (text: 'tracks stocks ↑↑', color: theme.colorScheme.primary);
  } else if (b >= 0.3) {
    return (text: 'moves with stocks ↑', color: theme.colorScheme.primary);
  } else if (b > 0.05) {
    return (text: 'loosely w/ stocks', color: theme.colorScheme.onSurfaceVariant);
  }
  return (text: 'independent', color: theme.colorScheme.onSurfaceVariant);
}

Widget _tag(ThemeData theme, String text, Color color) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: color.withOpacity(0.16),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(text,
          style: theme.textTheme.labelSmall
              ?.copyWith(color: color, fontWeight: FontWeight.w700)),
    );

class _CommodityRow extends StatelessWidget {
  const _CommodityRow({required this.game, required this.def});

  final GameController game;
  final AssetDef def;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ch = game.dailyChange(def.id);
    final corr = _correlation(def, theme);
    return Card(
      child: ListTile(
        isThreeLine: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        leading: CircleAvatar(
          backgroundColor: theme.colorScheme.primary.withOpacity(0.18),
          child: Text(def.ticker.substring(0, 2),
              style: theme.textTheme.labelSmall),
        ),
        title: Wrap(
          spacing: 6,
          runSpacing: 2,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(def.name,
                style: theme.textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.w600)),
            if (def.safeHaven) _tag(theme, 'safe haven', kGain),
            _tag(theme, corr.text, corr.color),
          ],
        ),
        subtitle: Text(def.blurb,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        trailing: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text('${price(game.priceOf(def.id))}${def.unit}',
                style: theme.textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.bold)),
            Text(signedPct(ch),
                style: theme.textTheme.bodySmall?.copyWith(color: gainColor(ch))),
          ],
        ),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => AssetDetailScreen(game: game, def: def),
          ),
        ),
      ),
    );
  }
}
