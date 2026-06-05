import 'package:flutter/material.dart';

import '../data/catalog.dart';
import '../models/asset.dart';
import '../state/game_controller.dart';
import '../util/format.dart';
import 'asset_detail_screen.dart';
import 'widgets/ui_helpers.dart';

/// "Comex" — a dedicated commodities desk: metals, energy, industrial, and
/// agriculture. Traded like stocks (buy / sell / short) but with no dividends;
/// gold & silver are safe havens that rally when the market panics.
class CommoditiesBody extends StatelessWidget {
  const CommoditiesBody({super.key, required this.game});

  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final items = Catalog.assetsInCategory('commodities');
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: theme.colorScheme.primary.withOpacity(0.10),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            'Trade raw goods — metals, energy, crops. No dividends, just price. '
            'Gold and silver are safe havens: they tend to climb when stocks '
            'crash and lag when stocks boom, so they balance a risky portfolio.',
            style: theme.textTheme.bodySmall,
          ),
        ),
        ...items.map((a) => _CommodityRow(game: game, def: a)),
      ],
    );
  }
}

class _CommodityRow extends StatelessWidget {
  const _CommodityRow({required this.game, required this.def});

  final GameController game;
  final AssetDef def;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ch = game.dailyChange(def.id);
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        leading: CircleAvatar(
          backgroundColor: theme.colorScheme.primary.withOpacity(0.18),
          child: Text(def.ticker.substring(0, 2),
              style: theme.textTheme.labelSmall),
        ),
        title: Row(
          children: [
            Flexible(child: Text(def.name, overflow: TextOverflow.ellipsis)),
            if (def.safeHaven) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: kGain.withOpacity(0.16),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text('safe haven',
                    style: theme.textTheme.labelSmall
                        ?.copyWith(color: kGain, fontWeight: FontWeight.w700)),
              ),
            ],
          ],
        ),
        subtitle: Text(def.sector, style: theme.textTheme.bodySmall),
        trailing: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(price(game.priceOf(def.id)),
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
