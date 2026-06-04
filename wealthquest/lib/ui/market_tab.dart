import 'package:flutter/material.dart';

import '../data/catalog.dart';
import '../models/asset.dart';
import '../state/game_controller.dart';
import '../util/format.dart';
import 'widgets/amount_sheet.dart';
import 'widgets/ui_helpers.dart';

class MarketTab extends StatelessWidget {
  const MarketTab({super.key, required this.game});

  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
      children: [
        for (final cat in Catalog.categories) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 12, 4, 2),
            child: Text(cat.label, style: theme.textTheme.titleMedium),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
            child: Text(
              cat.blurb,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          ...Catalog.assetsInCategory(cat.id)
              .map((a) => _AssetTile(game: game, def: a)),
        ],
      ],
    );
  }
}

class _AssetTile extends StatelessWidget {
  const _AssetTile({required this.game, required this.def});

  final GameController game;
  final AssetDef def;

  Future<void> _buy(BuildContext context) async {
    final helper = def.kind.isPriceBased
        ? '${def.blurb}\nPrice ${price(game.priceOf(def.id))} • ${signedPct(game.dailyChange(def.id))} this week'
        : def.blurb;
    final amount = await showAmountSheet(
      context,
      title: 'Buy ${def.name}',
      actionLabel: 'Buy',
      max: game.cash,
      helper: helper,
    );
    if (amount == null || !context.mounted) return;
    final err = game.buy(def, amount);
    _toast(context, err ?? 'Bought ${money(amount)} of ${def.name}.');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final String trailingTop;
    final String trailingBottom;
    Color bottomColor = theme.colorScheme.onSurfaceVariant;

    if (def.kind.isPriceBased) {
      trailingTop = price(game.priceOf(def.id));
      final ch = game.dailyChange(def.id);
      trailingBottom = signedPct(ch);
      bottomColor = gainColor(ch);
    } else {
      trailingTop = '${pct(def.apy)} APY';
      trailingBottom = def.kind == AssetKind.cd
          ? '${def.termDays}d lock'
          : 'liquid';
    }

    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        leading: CircleAvatar(
          backgroundColor: theme.colorScheme.primary.withOpacity(0.18),
          child: Text(
            def.ticker.length >= 2
                ? def.ticker.substring(0, 2)
                : def.ticker,
            style: theme.textTheme.labelSmall,
          ),
        ),
        title: Text(def.name),
        subtitle: Text(
          '${def.kind.label} • ${def.ticker}',
          style: theme.textTheme.bodySmall,
        ),
        trailing: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(trailingTop,
                style: theme.textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.bold)),
            Text(trailingBottom,
                style: theme.textTheme.bodySmall?.copyWith(color: bottomColor)),
          ],
        ),
        onTap: () => _buy(context),
      ),
    );
  }
}

void _toast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}
