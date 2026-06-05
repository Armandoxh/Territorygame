import 'package:flutter/material.dart';

import '../engine/sports_engine.dart';
import '../models/bet.dart';
import '../state/game_controller.dart';
import '../util/format.dart';
import 'widgets/amount_sheet.dart';
import 'widgets/ui_helpers.dart';

/// "DraftDay" — a sports book. Bet on the monthly slate; wagers resolve when you
/// hit Next Month. The house keeps a ~6% edge, so it's pure thrill.
class SportsBody extends StatelessWidget {
  const SportsBody({super.key, required this.game});

  final GameController game;

  Future<void> _bet(BuildContext context, SportsEvent e, bool home) async {
    final team = home ? e.home : e.away;
    final dec = home ? e.homeDecimal : e.awayDecimal;
    final amount = await showAmountSheet(
      context,
      title: 'Bet on $team',
      actionLabel: 'Place bet',
      max: game.cash,
      helper:
          'Odds ${SportsEngine.american(dec)} — win pays \$${(dec).toStringAsFixed(2)} per \$1. The house keeps ~6%.',
    );
    if (amount == null || !context.mounted) return;
    final err = game.placeBet(e, home, amount);
    _toast(context, err ?? 'Bet ${money(amount)} on $team. Good luck.');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: kLoss.withOpacity(0.10),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: kLoss.withOpacity(0.4)),
          ),
          child: Text(
            '⚠ The house always wins (~6% edge). Bets resolve on Next Month. '
            'Bet for fun, not your retirement.',
            style: theme.textTheme.bodySmall,
          ),
        ),
        if (game.bets.isNotEmpty) ...[
          Text('Your open bets', style: theme.textTheme.titleMedium),
          const SizedBox(height: 6),
          ...game.bets.map((b) => _OpenBet(bet: b)),
          const SizedBox(height: 16),
        ],
        Text("This month's slate", style: theme.textTheme.titleMedium),
        const SizedBox(height: 6),
        ...game.sportsSlate.map((e) => _EventCard(
              event: e,
              onBet: (home) => _bet(context, e, home),
            )),
      ],
    );
  }
}

class _OpenBet extends StatelessWidget {
  const _OpenBet({required this.bet});
  final PendingBet bet;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: ListTile(
        dense: true,
        leading: const Icon(Icons.confirmation_number_outlined),
        title: Text(bet.label),
        subtitle: Text('Stake ${money(bet.stake)}',
            style: theme.textTheme.bodySmall),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text('to win', style: theme.textTheme.labelSmall),
            Text(money(bet.potentialPayout),
                style: theme.textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.bold, color: kGain)),
          ],
        ),
      ),
    );
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard({required this.event, required this.onBet});
  final SportsEvent event;
  final void Function(bool home) onBet;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${event.sport}  ${event.home}  vs  ${event.away}',
                style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => onBet(true),
                    child: Text(
                        '${event.home}  ${SportsEngine.american(event.homeDecimal)}'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => onBet(false),
                    child: Text(
                        '${event.away}  ${SportsEngine.american(event.awayDecimal)}'),
                  ),
                ),
              ],
            ),
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
