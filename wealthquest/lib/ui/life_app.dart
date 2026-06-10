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
        length: 5,
        child: Scaffold(
          appBar: AppBar(
            title: const Text('Life'),
            actions: [CashBadge(game: game)],
            bottom: const TabBar(
              isScrollable: true,
              tabs: [
                Tab(text: 'Expenses'),
                Tab(text: 'Family'),
                Tab(text: 'Housing'),
                Tab(text: 'Transport'),
                Tab(text: 'Events'),
              ],
            ),
          ),
          body: ListenableBuilder(
            listenable: game,
            builder: (context, _) => TabBarView(
              // Tap tabs to switch; horizontal swipe stays free for swipe-back
              // instead of being eaten by the pager (which let it hit the
              // browser's back/refresh gesture).
              physics: const NeverScrollableScrollPhysics(),
              children: [
                _ExpensesTab(game: game),
                _FamilyTab(game: game),
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
          floatingActionButton: advanceControls(context, game),
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

class _FamilyTab extends StatelessWidget {
  const _FamilyTab({required this.game});
  final GameController game;

  void _toast(BuildContext context, String msg) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg)));
  }

  void _date(BuildContext context) {
    final before = game.relationship;
    final err = game.goOnDate();
    if (err != null) {
      _toast(context, err);
    } else if (game.relationship == RelationshipStage.partnered &&
        before != RelationshipStage.partnered) {
      _toast(context, "It's official — you're a couple! A second income starts.");
    } else {
      _toast(context, 'A lovely date. ${game.datesBeen}/'
          '${GameController.datesToPartner} until it gets serious.');
    }
  }

  String get _stageLabel {
    switch (game.relationship) {
      case RelationshipStage.single:
        return 'Single';
      case RelationshipStage.dating:
        return 'Dating';
      case RelationshipStage.partnered:
        return 'Partnered';
      case RelationshipStage.married:
        return 'Married';
    }
  }

  String get _stageEmoji {
    switch (game.relationship) {
      case RelationshipStage.single:
        return '🙂';
      case RelationshipStage.dating:
        return '🌹';
      case RelationshipStage.partnered:
        return '💑';
      case RelationshipStage.married:
        return '💍';
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final partnered = game.hasPartner;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
      children: [
        // Relationship status.
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(_stageEmoji, style: const TextStyle(fontSize: 22)),
                    const SizedBox(width: 8),
                    Text(_stageLabel,
                        style: theme.textTheme.titleLarge
                            ?.copyWith(fontWeight: FontWeight.bold)),
                  ],
                ),
                const SizedBox(height: 6),
                if (!partnered)
                  Text(
                    'Go out and meet someone. A few good dates and you settle '
                    'down — bringing a second income into the household.',
                    style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant),
                  )
                else
                  Text(
                    'Your partner brings home ${money(game.partnerMonthlyIncome)} '
                    'a month — it lands in your cash every month automatically.',
                    style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant),
                  ),
                if (game.relationship == RelationshipStage.dating) ...[
                  const SizedBox(height: 10),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: (game.datesBeen / GameController.datesToPartner)
                          .clamp(0.0, 1.0),
                      minHeight: 6,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text('${game.datesBeen}/${GameController.datesToPartner} dates',
                      style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant)),
                ],
                const SizedBox(height: 14),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (!partnered)
                      FilledButton.icon(
                        onPressed: game.cash >= GameController.dateCost
                            ? () => _date(context)
                            : null,
                        icon: const Icon(Icons.favorite, size: 18),
                        label: Text(
                            'Go on a date · ${money(GameController.dateCost)}'),
                      ),
                    if (game.relationship == RelationshipStage.partnered)
                      FilledButton.tonalIcon(
                        onPressed: game.cash >= GameController.weddingCost
                            ? () => _toast(context,
                                game.proposeMarriage() ?? 'You got married! 🎉')
                            : null,
                        icon: const Icon(Icons.diamond, size: 18),
                        label: Text(
                            'Get married · ${money(GameController.weddingCost)}'),
                      ),
                    if (partnered)
                      FilledButton.tonalIcon(
                        onPressed: game.children < GameController.maxChildren &&
                                game.cash >= GameController.childUpfrontCost
                            ? () => _toast(context,
                                game.haveChild() ?? 'Welcome to the family! 👶')
                            : null,
                        icon: const Icon(Icons.child_friendly, size: 18),
                        label: Text(
                            'Have a child · ${money(GameController.childUpfrontCost)}'),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
        // Kids.
        if (game.children > 0) ...[
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              leading: const Text('👨‍👩‍👧', style: TextStyle(fontSize: 22)),
              title: Text('${game.children} '
                  '${game.children == 1 ? 'child' : 'children'}'),
              subtitle: Text(
                  '${money(game.childcareCost)} / month in childcare & costs'),
            ),
          ),
        ],
        const SizedBox(height: 12),
        // Social standing.
        _StandingCard(game: game),
      ],
    );
  }
}

/// Shows your social standing tier and progress to the next, plus what it
/// unlocks — the "who you know" that opens better event rooms.
class _StandingCard extends StatelessWidget {
  const _StandingCard({required this.game});
  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const thresholds = [5, 15, 30];
    final tier = game.standingTier;
    final atTop = tier >= 3;
    final next = atTop ? null : thresholds[tier];
    final prev = tier == 0 ? 0 : thresholds[tier - 1];
    final progress = atTop
        ? 1.0
        : ((game.socialStanding - prev) / (next! - prev)).clamp(0.0, 1.0);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.groups, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('Social standing',
                      style: theme.textTheme.titleMedium),
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(game.standingLabel,
                      textAlign: TextAlign.right,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: theme.colorScheme.primary)),
                ),
              ],
            ),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(value: progress, minHeight: 8),
            ),
            const SizedBox(height: 6),
            Text(
              atTop
                  ? "Inner circle — every room in town is open to you."
                  : '${game.socialStanding}/$next to the next tier. '
                      'Go out, marry, and grow your family to climb.',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
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
            'Get out and meet people. Each event costs cash and lands one market '
            'tip in The Daily Ledger. Your social standing (${game.standingLabel}) '
            'opens better rooms and sharpens every tip. One outing per month.',
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
          final locked = game.standingTier < e.minTier;
          final affordable = game.cash >= e.cost;
          final enabled = !used && affordable && !locked;
          // Effective intel quality includes your standing bonus.
          final eff = locked
              ? e.reliability
              : (e.reliability + game.standingTier * 0.03).clamp(0.0, 0.92);
          return Opacity(
            opacity: locked ? 0.6 : 1,
            child: Card(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text('${e.emoji}  ${e.name}',
                              style: theme.textTheme.titleSmall),
                        ),
                        const SizedBox(width: 8),
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
                          label: Text('~${(eff * 100).round()}% reliable',
                              style: theme.textTheme.labelSmall),
                        ),
                        const Spacer(),
                        if (locked)
                          Chip(
                            visualDensity: VisualDensity.compact,
                            avatar: const Icon(Icons.lock_outline, size: 14),
                            label: Text(_tierName(e.minTier),
                                style: theme.textTheme.labelSmall),
                          )
                        else
                          FilledButton.tonal(
                            onPressed: enabled ? () => _attend(context, e) : null,
                            child: Text(affordable ? 'Attend' : 'Need cash'),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        }),
      ],
    );
  }

  static String _tierName(int tier) => const [
        'Newcomer',
        'Connected',
        'Well-connected',
        'Inner circle',
      ][tier];
}
