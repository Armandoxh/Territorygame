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
    final assets = game.unlockedAssets(category.id);
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
      if (def.kind == AssetKind.cd || def.lockKind == LockKind.hard) {
        bottom = '${def.termDays}mo lock';
      } else if (def.lockKind == LockKind.penalty) {
        bottom = '${def.termDays}mo · early fee';
      } else {
        bottom = 'liquid';
      }
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
        subtitle: _Subtitle(def: def),
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

/// Row subtitle: sector/type + minimum, plus a green income pill flagging
/// assets that pay you cash (stock/ETF dividends or a bond coupon).
class _Subtitle extends StatelessWidget {
  const _Subtitle({required this.def});

  final AssetDef def;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final base = def.sector.isNotEmpty ? def.sector : def.kind.label;
    final text =
        def.minInvestment > 0 ? '$base · min ${moneyWhole(def.minInvestment)}' : base;

    // Bonds pay a coupon; stocks/ETFs may pay a dividend; crypto pays nothing.
    final isCoupon = def.kind == AssetKind.bond;
    final yield = isCoupon ? def.incomeYield : def.dividendYield;

    return Row(
      children: [
        Flexible(
          child: Text(text,
              style: theme.textTheme.bodySmall, overflow: TextOverflow.ellipsis),
        ),
        if (yield > 0) ...[
          const SizedBox(width: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
            decoration: BoxDecoration(
              color: kGain.withOpacity(0.18),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              '${pct(yield)} ${isCoupon ? 'coupon' : 'div'}',
              style: theme.textTheme.labelSmall
                  ?.copyWith(color: kGain, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ],
    );
  }
}
