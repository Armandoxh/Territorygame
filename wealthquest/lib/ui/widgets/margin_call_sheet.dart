import 'package:flutter/material.dart';
import 'lucide.dart';

import '../../data/catalog.dart';
import '../../data/properties.dart';
import '../../models/holding.dart';
import '../../state/game_controller.dart';
import '../../util/format.dart';
import 'ui_helpers.dart';

/// A blocking margin-call dialog. The player has run negative for too long and
/// must liquidate investments or real estate until cash is back to ≥ $0 before
/// they can continue. Can't be dismissed by tapping outside or swiping back.
Future<void> showMarginCall(BuildContext context, GameController game) {
  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (context) {
      return PopScope(
        canPop: false,
        child: ListenableBuilder(
          listenable: game,
          builder: (context, _) {
            final theme = Theme.of(context);
            final settled = game.cash >= -0.01;
            final stuck = !settled && !game.hasLiquidatableAssets;
            final bankrupt = game.faceBankruptcy; // stuck, underwater, unmarked
            // Stuck + underwater but a prior bankruptcy still on record blocks
            // re-filing — no escape hatch, you have to grind out of the hole.
            final blocked = game.bankruptcyBlocked;
            final canContinue = settled || stuck;
            return Dialog(
              insetPadding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 560),
                child: DefaultTabController(
                  length: 2,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Lucide('triangle-alert',
                                    color: kLoss),
                                const SizedBox(width: 8),
                                Text('Margin call',
                                    style: theme.textTheme.titleLarge),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(
                              blocked
                                  ? "You're underwater with nothing left to "
                                      "sell — but you filed for bankruptcy "
                                      "within the last 7 years, so you can't "
                                      "file again for "
                                      "${(game.bankruptcyMonthsLeft / 12).ceil()} "
                                      "more year(s). No reset this time: keep "
                                      "going and grind the debt down. The "
                                      "overdraft fee keeps biting until you do."
                                  : bankrupt
                                      ? "You're out of cash and out of things to "
                                          "sell, and you're underwater. There's "
                                          "only one way out: bankruptcy. Your "
                                          "assets get liquidated and consumer "
                                          "debt wiped, but you lose everything "
                                          "you built — and a 7-year mark bars "
                                          "you from financing, garnishes "
                                          "${(GameController.bankruptcyGarnishRate * 100).toStringAsFixed(0)}% "
                                          "of every paycheck, and you can't file "
                                          "again until it clears. (Your 401(k) "
                                          "is protected.)"
                                      : "You've run out of cash for too long. "
                                          "Sell off investments or real estate "
                                          "until your cash is back above \$0.",
                              style: theme.textTheme.bodySmall,
                            ),
                            const SizedBox(height: 12),
                            Row(
                              mainAxisAlignment:
                                  MainAxisAlignment.spaceBetween,
                              children: [
                                Text('Cash',
                                    style: theme.textTheme.titleMedium),
                                Text(
                                  money(game.cash),
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: settled ? kGain : kLoss,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const TabBar(
                        tabs: [
                          Tab(text: 'Portfolio'),
                          Tab(text: 'Real estate'),
                        ],
                      ),
                      Expanded(
                        child: TabBarView(
                          children: [
                            _PortfolioList(game: game),
                            _PropertyList(game: game),
                          ],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(12),
                        child: SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            style: bankrupt
                                ? FilledButton.styleFrom(backgroundColor: kLoss)
                                : null,
                            onPressed: canContinue
                                ? () {
                                    if (bankrupt) {
                                      game.declareBankruptcy();
                                    } else {
                                      game.clearOverdraftStreak();
                                    }
                                    Navigator.pop(context);
                                  }
                                : null,
                            child: Text(
                              bankrupt
                                  ? 'Declare bankruptcy'
                                  : settled
                                      ? 'Continue'
                                      : blocked
                                          ? 'Ride it out — continue'
                                          : stuck
                                              ? 'Nothing left to sell — continue'
                                              : 'Raise \$${(-game.cash).toStringAsFixed(0)} more',
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      );
    },
  );
}

class _PortfolioList extends StatelessWidget {
  const _PortfolioList({required this.game});
  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (game.holdings.isEmpty) {
      return Center(
        child: Text('No investments to sell.',
            style: theme.textTheme.bodyMedium),
      );
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      children: [
        for (final h in game.holdings) _tile(context, h),
      ],
    );
  }

  Widget _tile(BuildContext context, Holding h) {
    final def = Catalog.assetById(h.assetId);
    final locked = h.isLocked && !h.isShort;
    return Card(
      child: ListTile(
        dense: true,
        title: Text('${def.name}${h.isShort ? ' (short)' : ''}'),
        subtitle: Text(locked
            ? 'Locked for ${h.maturityDay - game.day} more month(s)'
            : money(game.valueOf(h))),
        trailing: locked
            ? const Chip(label: Text('Locked'))
            : FilledButton.tonal(
                onPressed: () {
                  if (h.isShort) {
                    game.coverShort(h);
                  } else {
                    game.sell(h, 0, max: true);
                  }
                },
                child: Text(h.isShort ? 'Cover' : 'Sell all'),
              ),
      ),
    );
  }
}

class _PropertyList extends StatelessWidget {
  const _PropertyList({required this.game});
  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (game.properties.isEmpty) {
      return Center(
        child:
            Text('No real estate to sell.', style: theme.textTheme.bodyMedium),
      );
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      children: [
        for (final h in game.properties)
          Card(
            child: ListTile(
              dense: true,
              title: Text(Properties.byId(h.defId).name),
              subtitle: Text('Equity ${money(h.equity)}'),
              trailing: FilledButton.tonal(
                onPressed: () {
                  final err = game.sellProperty(h);
                  if (err != null) {
                    ScaffoldMessenger.of(context)
                      ..hideCurrentSnackBar()
                      ..showSnackBar(SnackBar(content: Text(err)));
                  }
                },
                child: const Text('Sell'),
              ),
            ),
          ),
      ],
    );
  }
}
