import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../engine/sports_engine.dart';
import '../models/bet.dart';
import '../state/game_controller.dart';
import '../util/format.dart';
import 'widgets/ui_helpers.dart';

/// "DraftDay" — a sports book with single bets AND parlays, organized into a
/// section per sport. Tap odds to add picks to your slip; 2+ picks = a parlay.
class SportsBody extends StatefulWidget {
  const SportsBody({super.key, required this.game});

  final GameController game;

  @override
  State<SportsBody> createState() => _SportsBodyState();
}

class _SlipLeg {
  final int eventId;
  final bool home;
  final String label;
  final double decimalOdds;
  final double winProb;
  _SlipLeg(this.eventId, this.home, this.label, this.decimalOdds, this.winProb);
}

class _SportsBodyState extends State<SportsBody> {
  final List<_SlipLeg> _slip = [];
  final _stakeCtrl = TextEditingController();

  GameController get game => widget.game;

  @override
  void dispose() {
    _stakeCtrl.dispose();
    super.dispose();
  }

  void _toggle(SportsEvent e, bool home) {
    setState(() {
      final i = _slip.indexWhere((l) => l.eventId == e.id);
      final leg = _SlipLeg(
        e.id,
        home,
        '${home ? e.home : e.away} (vs ${home ? e.away : e.home})',
        home ? e.homeDecimal : e.awayDecimal,
        home ? e.homeProb : 1 - e.homeProb,
      );
      if (i == -1) {
        _slip.add(leg);
      } else if (_slip[i].home == home) {
        _slip.removeAt(i); // tapping the same side again removes it
      } else {
        _slip[i] = leg; // swap to the other side
      }
    });
  }

  bool _selected(int eventId, bool home) =>
      _slip.any((l) => l.eventId == eventId && l.home == home);

  void _place() {
    final stake = double.tryParse(_stakeCtrl.text) ?? 0;
    final legs = [
      for (final l in _slip)
        ParlayLeg(
          eventId: l.eventId,
          label: l.label,
          decimalOdds: l.decimalOdds,
          winProb: l.winProb,
        )
    ];
    final err = game.placeParlay(legs, stake);
    if (err != null) {
      _toast(err);
      return;
    }
    setState(() {
      _slip.clear();
      _stakeCtrl.clear();
    });
    _toast('Bet placed. Resolves on Next Month — good luck.');
  }

  void _toast(String m) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(m)));
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
            '⚠ House edge ~6% per leg — and a parlay multiplies the vig too. '
            'Bets resolve on Next Month. For fun, not your retirement.',
            style: theme.textTheme.bodySmall,
          ),
        ),
        if (_slip.isNotEmpty) _buildSlip(theme),
        if (game.bets.isNotEmpty) ...[
          Text('Your open bets', style: theme.textTheme.titleMedium),
          const SizedBox(height: 6),
          ...game.bets.map((b) => _OpenBet(bet: b)),
          const SizedBox(height: 16),
        ],
        for (final s in SportsEngine.sports) ..._buildSportSection(theme, s),
      ],
    );
  }

  Widget _buildSlip(ThemeData theme) {
    var dec = 1.0;
    for (final l in _slip) {
      dec *= l.decimalOdds;
    }
    final stake = double.tryParse(_stakeCtrl.text) ?? 0;
    final payout = stake * dec;
    final isParlay = _slip.length > 1;
    return Card(
      color: theme.colorScheme.primary.withOpacity(0.10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(isParlay ? 'Parlay slip (${_slip.length} legs)' : 'Bet slip',
                    style: theme.textTheme.titleMedium),
                TextButton(
                  onPressed: () => setState(_slip.clear),
                  child: const Text('Clear'),
                ),
              ],
            ),
            ..._slip.map((l) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      Expanded(child: Text(l.label, style: theme.textTheme.bodyMedium)),
                      Text(SportsEngine.american(l.decimalOdds),
                          style: theme.textTheme.bodyMedium
                              ?.copyWith(fontWeight: FontWeight.bold)),
                      IconButton(
                        visualDensity: VisualDensity.compact,
                        icon: const Icon(Icons.close, size: 16),
                        onPressed: () =>
                            setState(() => _slip.removeWhere((x) => x.eventId == l.eventId)),
                      ),
                    ],
                  ),
                )),
            if (isParlay)
              Text('Combined: ${SportsEngine.american(dec)}',
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.bold, color: kGain)),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _stakeCtrl,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                    ],
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(
                      prefixText: '\$ ',
                      isDense: true,
                      border: OutlineInputBorder(),
                      labelText: 'Stake',
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('to win', style: theme.textTheme.labelSmall),
                    Text(money(payout),
                        style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold, color: kGain)),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 10),
            FilledButton(
              onPressed: stake > 0 ? _place : null,
              child: Text(isParlay ? 'Place parlay' : 'Place bet'),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildSportSection(ThemeData theme, List<String> sport) {
    final games =
        game.sportsSlate.where((e) => e.sportName == sport[0]).toList();
    if (games.isEmpty) return const [];
    return [
      Padding(
        padding: const EdgeInsets.only(top: 10, bottom: 4),
        child: Text('${sport[1]}  ${sport[0]}',
            style: theme.textTheme.titleMedium),
      ),
      ...games.map((e) => _EventCard(
            event: e,
            locked: game.hasBetOn(e.id),
            homeSelected: _selected(e.id, true),
            awaySelected: _selected(e.id, false),
            onPick: (home) => _toggle(e, home),
          )),
    ];
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard({
    required this.event,
    required this.locked,
    required this.homeSelected,
    required this.awaySelected,
    required this.onPick,
  });

  final SportsEvent event;
  final bool locked;
  final bool homeSelected;
  final bool awaySelected;
  final void Function(bool home) onPick;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    Widget pick(bool home, String team, double dec, bool sel) {
      final label = '$team  ${SportsEngine.american(dec)}';
      // A game you've already bet is locked — only one wager per game.
      final onPressed = locked ? null : () => onPick(home);
      return Expanded(
        child: sel
            ? FilledButton(onPressed: onPressed, child: Text(label))
            : OutlinedButton(onPressed: onPressed, child: Text(label)),
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${event.home}  vs  ${event.away}',
                style: theme.textTheme.bodyMedium),
            const SizedBox(height: 8),
            if (locked)
              Row(
                children: [
                  Icon(Icons.lock_outline,
                      size: 16, color: theme.colorScheme.outline),
                  const SizedBox(width: 6),
                  Text('Bet placed — settles next month',
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: theme.colorScheme.outline)),
                ],
              )
            else
              Row(
                children: [
                  pick(true, event.home, event.homeDecimal, homeSelected),
                  const SizedBox(width: 10),
                  pick(false, event.away, event.awayDecimal, awaySelected),
                ],
              ),
          ],
        ),
      ),
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
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
        child: Row(
          children: [
            Icon(bet.isParlay ? Icons.auto_awesome : Icons.confirmation_number_outlined),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(bet.title, style: theme.textTheme.titleSmall),
                  if (bet.isParlay)
                    Text(bet.legs.join(' + '),
                        style: theme.textTheme.labelSmall, maxLines: 2),
                  Text('Stake ${money(bet.stake)}',
                      style: theme.textTheme.bodySmall),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text('to win', style: theme.textTheme.labelSmall),
                Text(money(bet.potentialPayout),
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.bold, color: kGain)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
