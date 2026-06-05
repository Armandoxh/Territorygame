import 'package:flutter/material.dart';

import '../data/life.dart';
import '../state/game_controller.dart';
import '../util/format.dart';
import 'widgets/app_scaffold.dart';
import 'widgets/swipe_back.dart';
import 'widgets/ui_helpers.dart';

/// "Life" — where your money actually goes. A breakdown of living expenses,
/// the home/car your income affords (read-only flavor for now), and events you
/// can attend to pick up a market tip.
class LifeApp extends StatelessWidget {
  const LifeApp({super.key, required this.game});

  final GameController game;

  @override
  Widget build(BuildContext context) {
    return SwipeBack(
      child: DefaultTabController(
        length: 4,
        child: Scaffold(
          appBar: AppBar(
            title: const Text('Life'),
            bottom: const TabBar(
              isScrollable: true,
              tabs: [
                Tab(text: 'Expenses'),
                Tab(text: 'Housing'),
                Tab(text: 'Transport'),
                Tab(text: 'Events'),
              ],
            ),
          ),
          body: ListenableBuilder(
            listenable: game,
            builder: (context, _) => TabBarView(
              children: [
                _ExpensesTab(game: game),
                _LifestyleTab(
                  game: game,
                  title: 'Where you live',
                  tier: LifeData.apartmentFor(game.job.pay),
                  share: LifeData.housingShare,
                  shareLabel: 'housing',
                ),
                _LifestyleTab(
                  game: game,
                  title: 'What you drive',
                  tier: LifeData.carFor(game.job.pay),
                  share: LifeData.transportShare,
                  shareLabel: 'transportation',
                ),
                _EventsTab(game: game),
              ],
            ),
          ),
          floatingActionButton: FloatingActionButton.extended(
            heroTag: null,
            onPressed: () => nextMonth(context, game),
            icon: const Icon(Icons.skip_next),
            label: const Text('Next Month'),
          ),
          floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
        ),
      ),
    );
  }
}

class _ExpensesTab extends StatelessWidget {
  const _ExpensesTab({required this.game});
  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final total = game.dailyExpenses;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Monthly living expenses',
                    style: theme.textTheme.titleMedium),
                const SizedBox(height: 4),
                Text(money(total),
                    style: theme.textTheme.headlineMedium
                        ?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text(
                  'These come out of your cash every month — before anything you '
                  'invest. They creep up as you earn more: a bigger paycheck '
                  'buys a nicer life.',
                  style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text('Where it goes', style: theme.textTheme.titleMedium),
        const SizedBox(height: 4),
        ...LifeData.breakdown.map((s) => _SliceRow(slice: s, total: total)),
      ],
    );
  }
}

class _SliceRow extends StatelessWidget {
  const _SliceRow({required this.slice, required this.total});
  final ExpenseSlice slice;
  final double total;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text('${slice.emoji}  ${slice.label}',
                  style: theme.textTheme.bodyMedium),
              const Spacer(),
              Text('${money(total * slice.share)}  ·  '
                  '${(slice.share * 100).round()}%',
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: slice.share,
              minHeight: 6,
              backgroundColor: theme.colorScheme.surfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _LifestyleTab extends StatelessWidget {
  const _LifestyleTab({
    required this.game,
    required this.title,
    required this.tier,
    required this.share,
    required this.shareLabel,
  });

  final GameController game;
  final String title;
  final LifestyleTier tier;
  final double share;
  final String shareLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cost = game.dailyExpenses * share;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
      children: [
        Text(title, style: theme.textTheme.titleMedium),
        const SizedBox(height: 8),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tier.name,
                    style: theme.textTheme.titleLarge
                        ?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                Text(tier.blurb, style: theme.textTheme.bodyMedium),
                const Divider(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('~${money(cost)} / month',
                        style: theme.textTheme.titleMedium),
                    Text('${(share * 100).round()}% of expenses',
                        style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant)),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: theme.colorScheme.primary.withOpacity(0.08),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            'Right now your $shareLabel tier follows your income automatically. '
            'Choosing your own (and trading cost for lifestyle) is coming soon.',
            style: theme.textTheme.bodySmall,
          ),
        ),
      ],
    );
  }
}

class _EventsTab extends StatelessWidget {
  const _EventsTab({required this.game});
  final GameController game;

  void _attend(BuildContext context, LifeEvent e) {
    final err = game.attendLifeEvent(e);
    final msg = err ?? 'You picked up a tip — check The Daily Ledger.';
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final used = game.attendedEventThisMonth;
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
            'Get out and meet people. Each event costs cash and lands you one '
            'market tip in The Daily Ledger — pricier rooms mean better intel. '
            'One outing per month.',
            style: theme.textTheme.bodySmall,
          ),
        ),
        if (used)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text("You've already been out this month.",
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ),
        ...LifeData.events.map((e) {
          final affordable = game.cash >= e.cost;
          final enabled = !used && affordable;
          return Card(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text('${e.emoji}  ${e.name}',
                          style: theme.textTheme.titleSmall),
                      const Spacer(),
                      Text(money(e.cost),
                          style: theme.textTheme.titleSmall
                              ?.copyWith(fontWeight: FontWeight.bold)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(e.blurb, style: theme.textTheme.bodySmall),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Chip(
                        visualDensity: VisualDensity.compact,
                        label: Text('~${(e.reliability * 100).round()}% reliable',
                            style: theme.textTheme.labelSmall),
                      ),
                      const Spacer(),
                      FilledButton.tonal(
                        onPressed: enabled ? () => _attend(context, e) : null,
                        child: Text(affordable ? 'Attend' : 'Need cash'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }
}
