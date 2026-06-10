import 'package:flutter/material.dart';

import '../data/catalog.dart';
import '../models/asset.dart';
import '../models/holding.dart';
import '../state/game_controller.dart';
import '../util/format.dart';
import 'widgets/amount_sheet.dart';
import 'widgets/ui_helpers.dart';

class PortfolioTab extends StatelessWidget {
  const PortfolioTab({super.key, required this.game});

  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (game.holdings.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.savings_outlined,
                  size: 56, color: theme.colorScheme.onSurfaceVariant),
              const SizedBox(height: 12),
              Text('No investments yet',
                  style: theme.textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(
                'Head to the Market tab and put your cash to work.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      );
    }

    final totalValue = game.holdingsValue;
    var totalCost = 0.0;
    for (final h in game.holdings) {
      totalCost += h.costBasis;
    }
    final totalPl = totalValue - totalCost;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Invested value',
                        style: theme.textTheme.labelMedium),
                    Text(moneyWhole(totalValue),
                        style: theme.textTheme.headlineSmall
                            ?.copyWith(fontWeight: FontWeight.bold)),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('Total P/L', style: theme.textTheme.labelMedium),
                    Text(
                      '${totalPl >= 0 ? '+' : ''}${money(totalPl)}',
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: gainColor(totalPl),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        ...game.holdings.map((h) => _HoldingTile(game: game, holding: h)),
      ],
    );
  }
}

class _HoldingTile extends StatelessWidget {
  const _HoldingTile({required this.game, required this.holding});

  final GameController game;
  final Holding holding;

  Future<void> _sell(BuildContext context) async {
    final def = Catalog.assetById(holding.assetId);
    if (holding.isLocked) {
      final left = holding.maturityDay - game.day;
      _toast(context, '${def.name} is locked for $left more month(s).');
      return;
    }
    final value = game.valueOf(holding);
    final amount = await showAmountSheet(
      context,
      title: 'Sell ${def.name}',
      actionLabel: 'Sell',
      max: value,
      helper: holding.kind.isPriceBased
          ? 'Price ${price(game.priceOf(def.id))} • ${signedPct(game.dailyChange(def.id))} this month'
          : null,
    );
    if (amount == null || !context.mounted) return;
    final err = game.sell(holding, amount, max: amount >= value - 0.01);
    _toast(context, err ?? 'Sold ${money(amount)} of ${def.name}.');
  }

  Future<void> _cover(BuildContext context) async {
    final def = Catalog.assetById(holding.assetId);
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Cover short on ${def.name}?'),
        content: Text(
            'Close this short for ${money(game.valueOf(holding))} back to cash.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(c, true),
              child: const Text('Cover')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final err = game.coverShort(holding);
    _toast(context, err ?? 'Covered short on ${def.name}.');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final def = Catalog.assetById(holding.assetId);
    final value = game.valueOf(holding);
    final pl = game.profitOf(holding);

    final String subtitle;
    if (holding.isShort) {
      subtitle = 'SHORT position';
    } else if (holding.kind == AssetKind.cd || holding.kind == AssetKind.fund) {
      subtitle = holding.matured
          ? 'Matured • free to withdraw'
          : holding.hardLock
              ? 'Locked • matures month ${holding.maturityDay}'
              : 'Early-exit fee until month ${holding.maturityDay}';
    } else if (holding.kind.isInterestBearing) {
      subtitle = '${def.kind.label} • ${pct(def.apy)} APY';
    } else {
      subtitle =
          '${def.kind.label}${def.sector.isNotEmpty ? ' • ${def.sector}' : ''}';
    }

    final plLabel = holding.kind == AssetKind.savings
        ? 'interest +${money(pl)}'
        : '${pl >= 0 ? '+' : ''}${money(pl)}';

    // The cost breakdown the player asked to see: what they paid per unit, what
    // a unit goes for now, and the totals. Per-unit only makes sense for
    // price-based positions (stocks/ETFs/bonds/crypto/commodities); savings,
    // CDs and funds are balances, so we show invested vs. worth instead.
    final sharesStr =
        holding.shares.toStringAsFixed(holding.shares >= 10 ? 1 : 4);
    final List<List<String>> stats;
    if (holding.isShort) {
      stats = [
        ['Size', '$sharesStr units'],
        ['Now / unit', price(game.priceOf(def.id))],
        ['Entry / unit', price(holding.entryPrice)],
        ['Margin posted', money(holding.costBasis)],
      ];
    } else if (holding.kind.isPriceBased) {
      final avgPaid =
          holding.shares > 0 ? holding.costBasis / holding.shares : 0.0;
      stats = [
        ['Units', sharesStr],
        ['Now / unit', price(game.priceOf(def.id))],
        ['Paid / unit', price(avgPaid)],
        ['Total paid', money(holding.costBasis)],
      ];
    } else {
      stats = [
        ['Invested', money(holding.costBasis)],
        ['Worth now', money(value)],
      ];
    }

    return Card(
      child: Column(
        children: [
          ListTile(
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            leading: holding.isShort
                ? const Icon(Icons.trending_down, color: kLoss)
                : holding.isLocked
                    ? const Icon(Icons.lock_outline)
                    : const Icon(Icons.show_chart),
            title: Text(def.name),
            subtitle: Text(subtitle, style: theme.textTheme.bodySmall),
            trailing: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(money(value),
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.bold)),
                Text(plLabel,
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: gainColor(pl))),
              ],
            ),
            onTap: () => holding.isShort ? _cover(context) : _sell(context),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: _statGrid(theme, stats),
          ),
        ],
      ),
    );
  }

  /// Lay the cost figures out two-per-row, each cell flexible so long values
  /// never overflow on a narrow phone.
  Widget _statGrid(ThemeData theme, List<List<String>> pairs) {
    final rows = <Widget>[];
    for (var i = 0; i < pairs.length; i += 2) {
      rows.add(Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: _stat(theme, pairs[i][0], pairs[i][1])),
            const SizedBox(width: 12),
            Expanded(
              child: i + 1 < pairs.length
                  ? _stat(theme, pairs[i + 1][0], pairs[i + 1][1])
                  : const SizedBox.shrink(),
            ),
          ],
        ),
      ));
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: rows);
  }

  Widget _stat(ThemeData theme, String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: theme.textTheme.labelSmall
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        Text(value,
            style:
                theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
      ],
    );
  }
}

void _toast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}
