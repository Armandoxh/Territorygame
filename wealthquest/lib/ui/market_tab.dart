import 'package:flutter/material.dart';

import '../data/catalog.dart';
import '../models/asset.dart';
import '../state/game_controller.dart';
import '../util/format.dart';
import 'asset_detail_screen.dart';
import 'widgets/ui_helpers.dart';

/// Market screen: one sub-tab per category, each its own scrollable window.
/// Tapping a row opens the full asset detail screen.
class MarketTab extends StatelessWidget {
  const MarketTab({super.key, required this.game});

  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DefaultTabController(
      length: Catalog.categories.length,
      child: Column(
        children: [
          TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            labelStyle: theme.textTheme.titleSmall,
            tabs: [
              for (final c in Catalog.categories) Tab(text: c.label),
            ],
          ),
          Expanded(
            child: TabBarView(
              children: [
                for (final c in Catalog.categories)
                  _CategoryView(game: game, category: c),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CategoryView extends StatelessWidget {
  const _CategoryView({required this.game, required this.category});

  final GameController game;
  final AssetCategory category;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final assets = Catalog.assetsInCategory(category.id);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
      children: [
        Text(
          category.blurb,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 8),
        ...assets.map((a) => _AssetRow(game: game, def: a)),
      ],
    );
  }
}

class _AssetRow extends StatelessWidget {
  const _AssetRow({required this.game, required this.def});

  final GameController game;
  final AssetDef def;

  void _open(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => AssetDetailScreen(game: game, def: def),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final String top;
    final String bottom;
    Color bottomColor = theme.colorScheme.onSurfaceVariant;

    if (def.kind.isPriceBased) {
      top = price(game.priceOf(def.id));
      final ch = game.dailyChange(def.id);
      bottom = signedPct(ch);
      bottomColor = gainColor(ch);
    } else {
      top = '${pct(def.apy)} APY';
      bottom = def.kind == AssetKind.cd ? '${def.termDays}w lock' : 'liquid';
    }

    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        leading: CircleAvatar(
          backgroundColor: theme.colorScheme.primary.withOpacity(0.18),
          child: Text(
            def.ticker.length >= 2 ? def.ticker.substring(0, 2) : def.ticker,
            style: theme.textTheme.labelSmall,
          ),
        ),
        title: Text(def.name),
        subtitle: Text(
          () {
            final base = def.sector.isNotEmpty ? def.sector : def.kind.label;
            return def.minInvestment > 0
                ? '$base · min ${moneyWhole(def.minInvestment)}'
                : base;
          }(),
          style: theme.textTheme.bodySmall,
        ),
        trailing: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(top,
                style: theme.textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.bold)),
            Text(bottom,
                style: theme.textTheme.bodySmall?.copyWith(color: bottomColor)),
          ],
        ),
        onTap: () => _open(context),
      ),
    );
  }
}
