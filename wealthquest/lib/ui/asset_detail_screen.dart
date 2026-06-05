import 'package:flutter/material.dart';

import '../models/asset.dart';
import '../models/holding.dart';
import '../state/game_controller.dart';
import '../util/format.dart';
import 'widgets/amount_sheet.dart';
import 'widgets/candle_chart.dart';
import 'widgets/swipe_back.dart';
import 'widgets/ui_helpers.dart';

/// Drill-in screen for a single investment: chart, fundamentals, your
/// position, and buy/sell. This is the "everything a real investor needs"
/// view.
class AssetDetailScreen extends StatelessWidget {
  const AssetDetailScreen({super.key, required this.game, required this.def});

  final GameController game;
  final AssetDef def;

  Future<void> _buy(BuildContext context) async {
    var maxBuy = game.cash;
    String? capNote;
    if (def.annualPurchaseCap > 0) {
      final remaining = game.remainingAnnualCap(def);
      if (remaining < maxBuy) maxBuy = remaining;
      capNote = '${money(remaining)} left to buy this year (cap ${moneyWhole(def.annualPurchaseCap)}/yr)';
    }
    final amount = await showAmountSheet(
      context,
      title: 'Buy ${def.name}',
      actionLabel: 'Buy',
      max: maxBuy,
      helper: def.kind.isPriceBased
          ? 'Price ${price(game.priceOf(def.id))} • ${signedPct(game.dailyChange(def.id))} this month'
          : capNote ?? def.blurb,
    );
    if (amount == null || !context.mounted) return;
    final err = game.buy(def, amount);
    _toast(context, err ?? 'Bought ${money(amount)} of ${def.name}.');
  }

  Future<void> _short(BuildContext context) async {
    final amount = await showAmountSheet(
      context,
      title: 'Short ${def.name}',
      actionLabel: 'Open short',
      max: game.cash,
      helper:
          'You profit if the price FALLS. Your stake is the margin — you get stopped out if the price roughly doubles.',
    );
    if (amount == null || !context.mounted) return;
    final err = game.short(def, amount);
    _toast(context, err ?? 'Opened a ${money(amount)} short on ${def.name}.');
  }

  Future<void> _sell(BuildContext context, Holding h) async {
    if (h.isLocked) {
      _toast(context, 'Locked for ${h.maturityDay - game.day} more month(s).');
      return;
    }
    final value = game.valueOf(h);
    final amount = await showAmountSheet(
      context,
      title: 'Sell ${def.name}',
      actionLabel: 'Sell',
      max: value,
    );
    if (amount == null || !context.mounted) return;
    final err = game.sell(h, amount, max: amount >= value - 0.01);
    _toast(context, err ?? 'Sold ${money(amount)} of ${def.name}.');
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: game,
      builder: (context, _) {
        final theme = Theme.of(context);
        final priceBased = def.kind.isPriceBased;
        final positions =
            game.holdings.where((h) => h.assetId == def.id).toList();

        return SwipeBack(
          child: Scaffold(
          appBar: AppBar(
            title: Text(def.name),
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(20),
              child: Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  '${def.kind.label} • ${def.ticker}${def.sector.isNotEmpty ? ' • ${def.sector}' : ''}',
                  style: theme.textTheme.bodySmall,
                ),
              ),
            ),
          ),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              if (priceBased) _priceHeader(theme),
              if (priceBased) ...[
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: CandleChart(series: game.priceHistoryFor(def.id)),
                  ),
                ),
              ],
              if (priceBased) _rumorsSection(context),
              const SizedBox(height: 12),
              _statsCard(context),
              const SizedBox(height: 12),
              _positionCard(context, positions),
              const SizedBox(height: 12),
              Text('About', style: theme.textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(def.blurb, style: theme.textTheme.bodyMedium),
              const SizedBox(height: 24),
              if (priceBased)
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () => _buy(context),
                        icon: const Icon(Icons.add),
                        label: const Text('Buy'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => _short(context),
                        icon: const Icon(Icons.trending_down),
                        label: const Text('Short'),
                      ),
                    ),
                  ],
                )
              else
                FilledButton.icon(
                  onPressed: () => _buy(context),
                  icon: const Icon(Icons.add),
                  label: Text('Buy ${def.name}'),
                ),
            ],
          ),
        ),
        );
      },
    );
  }

  Widget _priceHeader(ThemeData theme) {
    final ch = game.dailyChange(def.id);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          price(game.priceOf(def.id)),
          style: theme.textTheme.displaySmall
              ?.copyWith(fontWeight: FontWeight.bold),
        ),
        const SizedBox(width: 12),
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(
            '${ch >= 0 ? '▲' : '▼'} ${signedPct(ch)} this month',
            style: theme.textTheme.titleMedium?.copyWith(color: gainColor(ch)),
          ),
        ),
      ],
    );
  }

  Widget _rumorsSection(BuildContext context) {
    final rumors = game.currentRumorsForAsset(def.id);
    if (rumors.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.newspaper, size: 18),
                  const SizedBox(width: 8),
                  Text('Word on the street',
                      style: theme.textTheme.titleSmall),
                ],
              ),
              const SizedBox(height: 8),
              ...rumors.map((r) {
                final color = r.isBullish ? kGain : kLoss;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        r.isBullish
                            ? Icons.trending_up
                            : Icons.trending_down,
                        size: 16,
                        color: color,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text('"${r.headline}"',
                            style: theme.textTheme.bodyMedium
                                ?.copyWith(fontStyle: FontStyle.italic)),
                      ),
                    ],
                  ),
                );
              }),
              const SizedBox(height: 4),
              Text(
                'Rumors are often wrong — trade with skepticism.',
                style: theme.textTheme.labelSmall?.copyWith(
                  fontStyle: FontStyle.italic,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _statsCard(BuildContext context) {
    final theme = Theme.of(context);
    final rows = <MapEntry<String, String>>[];

    if (def.kind.isPriceBased) {
      rows.add(MapEntry('Market cap', moneyCompact(game.marketCap(def))));
      rows.add(MapEntry('1-yr high', price(game.high52(def.id))));
      rows.add(MapEntry('1-yr low', price(game.low52(def.id))));
      rows.add(MapEntry('Volatility', '${pct(def.annualVol)} / yr'));
      if (def.kind.isEquity) {
        final pe = game.peRatio(def);
        rows.add(MapEntry('P/E ratio', pe == null ? 'N/A' : pe.toStringAsFixed(1)));
        rows.add(MapEntry('EPS (annual)', def.eps <= 0 ? 'N/A' : money(def.eps)));
      }
      if (def.incomeYield > 0) {
        rows.add(MapEntry(
          def.kind == AssetKind.bond ? 'Coupon' : 'Dividend yield',
          pct(def.incomeYield),
        ));
      }
      if (def.expenseRatio > 0) {
        rows.add(MapEntry('Expense ratio', pct(def.expenseRatio)));
      }
      if (def.creditRating.isNotEmpty) {
        rows.add(MapEntry('Credit rating', def.creditRating));
      }
      if (def.categoryId == 'cash') {
        rows.add(MapEntry('Insured', def.insured ? 'FDIC / Govt' : 'Not insured'));
      }
    } else {
      rows.add(MapEntry('APY', pct(def.apy)));
      if (def.minBalance > 0) {
        rows.add(MapEntry('Keep at least', moneyWhole(def.minBalance)));
        rows.add(MapEntry('If below', '${pct(def.belowMinApy)} APY'));
      }
      rows.add(MapEntry('Rate', def.rateType));
      rows.add(MapEntry('Insured', def.insured ? 'FDIC / Govt' : 'Not insured'));
      if (def.crashLoss > 0) {
        rows.add(MapEntry('Crash risk', '−${pct(def.crashLoss)} in a crash'));
      }
      if (def.kind == AssetKind.cd || def.lockKind == LockKind.hard) {
        rows.add(MapEntry('Term', '${def.termDays} months'));
        rows.add(const MapEntry('Liquidity', 'Hard-locked until maturity'));
      } else if (def.lockKind == LockKind.penalty) {
        rows.add(MapEntry('Term', '${def.termDays} months'));
        rows.add(MapEntry(
            'Early exit', 'forfeit ${pct(def.earlyPenalty)} of gains'));
      } else {
        rows.add(const MapEntry('Liquidity', 'Withdraw anytime'));
      }
    }
    if (def.annualPurchaseCap > 0) {
      rows.add(MapEntry('Annual limit', '${moneyWhole(def.annualPurchaseCap)}/yr'));
      rows.add(MapEntry('Left this year', moneyWhole(game.remainingAnnualCap(def))));
    }
    if (def.minInvestment > 0) {
      rows.add(MapEntry('Minimum', moneyWhole(def.minInvestment)));
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Key stats', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            ...rows.map(
              (r) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(r.key,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        )),
                    Text(r.value,
                        style: theme.textTheme.bodyMedium
                            ?.copyWith(fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _positionCard(BuildContext context, List<Holding> positions) {
    final theme = Theme.of(context);
    if (positions.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(Icons.info_outline,
                  size: 18, color: theme.colorScheme.onSurfaceVariant),
              const SizedBox(width: 10),
              Expanded(
                child: Text('You don\'t own this yet.',
                    style: theme.textTheme.bodyMedium),
              ),
            ],
          ),
        ),
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Your position', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            ...positions.map((h) {
              final value = game.valueOf(h);
              final pl = game.profitOf(h);
              final sub = h.isShort
                  ? 'SHORT • ${h.shares.toStringAsFixed(2)} @ ${price(h.entryPrice)}'
                  : (h.kind == AssetKind.cd || h.kind == AssetKind.fund)
                      ? (h.matured
                          ? 'Matured • free to withdraw'
                          : h.hardLock
                              ? 'Locked • matures month ${h.maturityDay}'
                              : 'Early-exit fee until month ${h.maturityDay}')
                      : h.kind.isInterestBearing
                          ? 'Balance'
                          : '${h.shares.toStringAsFixed(h.shares >= 10 ? 2 : 4)} units';
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(money(value),
                              style: theme.textTheme.titleSmall?.copyWith(
                                  fontWeight: FontWeight.bold)),
                          Text(sub,
                              style: theme.textTheme.bodySmall?.copyWith(
                                  color: h.isShort ? kLoss : null,
                                  fontWeight:
                                      h.isShort ? FontWeight.bold : null)),
                          Text(
                            '${pl >= 0 ? '+' : ''}${money(pl)}',
                            style: theme.textTheme.bodySmall
                                ?.copyWith(color: gainColor(pl)),
                          ),
                        ],
                      ),
                    ),
                    OutlinedButton(
                      onPressed: h.isShort
                          ? () {
                              final err = game.coverShort(h);
                              _toast(context, err ?? 'Covered short.');
                            }
                          : h.isLocked
                              ? null
                              : () => _sell(context, h),
                      child: Text(h.isShort
                          ? 'Cover'
                          : h.kind == AssetKind.cd
                              ? 'Redeem'
                              : 'Sell'),
                    ),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}

void _toast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}
