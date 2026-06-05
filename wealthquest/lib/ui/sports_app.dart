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

/// What a $100 bet pays back in total at these odds, e.g. "$100 → $260".
String _payBack(double dec) => '\$100 → \$${(dec * 100).round()}';

/// Payout multiplier, e.g. "2.60×".
String _mult(double dec) => '${dec.toStringAsFixed(2)}×';

class _SportsBodyState extends State<SportsBody> {
  final List<_SlipLeg> _slip = [];

  /// Stake field for a combined parlay (singles use their own per-pick fields).
  final _stakeCtrl = TextEditingController();

  /// Per-pick stake fields, keyed by event id, for the Singles view.
  final Map<int, TextEditingController> _singleCtrls = {};

  /// Singles (false) vs Parlay (true). You start in Singles and tap "Parlay"
  /// to deliberately combine your picks — that toggle IS "create a parlay".
  bool _parlayMode = false;

  GameController get game => widget.game;

  @override
  void dispose() {
    _stakeCtrl.dispose();
    for (final c in _singleCtrls.values) {
      c.dispose();
    }
    super.dispose();
  }

  TextEditingController _ctrlFor(int eventId) =>
      _singleCtrls.putIfAbsent(eventId, () => TextEditingController());

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
        _singleCtrls.remove(e.id)?.dispose();
      } else {
        _slip[i] = leg; // swap to the other side
      }
    });
  }

  bool _selected(int eventId, bool home) =>
      _slip.any((l) => l.eventId == eventId && l.home == home);

  void _removeLeg(int eventId) {
    setState(() {
      _slip.removeWhere((x) => x.eventId == eventId);
      _singleCtrls.remove(eventId)?.dispose();
    });
  }

  void _clearSlip() {
    setState(() {
      _slip.clear();
      for (final c in _singleCtrls.values) {
        c.dispose();
      }
      _singleCtrls.clear();
      _stakeCtrl.clear();
    });
  }

  /// Place every picked leg as its own straight bet (each with its own stake).
  /// Picks with no stake are left in the slip; the rest are cleared.
  void _placeSingles() {
    final placed = <int>[];
    String? firstErr;
    for (final l in List.of(_slip)) {
      final stake = double.tryParse(_ctrlFor(l.eventId).text) ?? 0;
      if (stake <= 0) continue;
      final err = game.placeParlay([
        ParlayLeg(
          eventId: l.eventId,
          label: l.label,
          decimalOdds: l.decimalOdds,
          winProb: l.winProb,
        )
      ], stake);
      if (err != null) {
        firstErr ??= err;
      } else {
        placed.add(l.eventId);
      }
    }
    if (placed.isEmpty) {
      _toast(firstErr ?? 'Enter a stake on at least one pick.');
      return;
    }
    setState(() {
      for (final id in placed) {
        _slip.removeWhere((x) => x.eventId == id);
        _singleCtrls.remove(id)?.dispose();
      }
    });
    _toast(firstErr ??
        'Placed ${placed.length} single${placed.length == 1 ? '' : 's'}. Good luck.');
  }

  /// Combine all picks into one parlay (every leg must hit; odds multiply).
  void _placeParlay() {
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
    _clearSlip();
    _toast('Parlay placed. Resolves on Next Month — good luck.');
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
            'How to bet: tap a team to pick it. "\$100 → \$260" means a \$100 '
            'bet pays back \$260 if they win. Pick 2+ teams and switch your '
            'slip to Parlay to combine them into one bigger-payout bet (all '
            'must win). The house keeps an edge, so bet for fun.',
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
    final showParlay = _parlayMode && _slip.length >= 2;
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
                Text('Bet slip', style: theme.textTheme.titleMedium),
                TextButton(
                  onPressed: _clearSlip,
                  child: const Text('Clear'),
                ),
              ],
            ),
            // 2+ picks unlock the Singles/Parlay choice — that's how you make
            // a parlay: add picks, then tap "Parlay" to combine them.
            if (_slip.length >= 2) ...[
              const SizedBox(height: 4),
              SizedBox(
                width: double.infinity,
                child: SegmentedButton<bool>(
                  showSelectedIcon: false,
                  segments: const [
                    ButtonSegment(
                      value: false,
                      label: Text('Singles'),
                      icon: Icon(Icons.receipt_long, size: 18),
                    ),
                    ButtonSegment(
                      value: true,
                      label: Text('Parlay'),
                      icon: Icon(Icons.auto_awesome, size: 18),
                    ),
                  ],
                  selected: {_parlayMode},
                  onSelectionChanged: (s) =>
                      setState(() => _parlayMode = s.first),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                showParlay
                    ? 'One bet — all ${_slip.length} picks must hit. Odds multiply, one stake.'
                    : 'Each pick is placed as its own bet with its own stake.',
                style: theme.textTheme.labelSmall,
              ),
            ],
            const SizedBox(height: 8),
            if (showParlay) _buildParlay(theme) else _buildSingles(theme),
          ],
        ),
      ),
    );
  }

  Widget _buildParlay(ThemeData theme) {
    var dec = 1.0;
    for (final l in _slip) {
      dec *= l.decimalOdds;
    }
    final stake = double.tryParse(_stakeCtrl.text) ?? 0;
    final payout = stake * dec;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ..._slip.map((l) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  Expanded(
                      child:
                          Text(l.label, style: theme.textTheme.bodyMedium)),
                  Text(_mult(l.decimalOdds),
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(fontWeight: FontWeight.bold)),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    icon: const Icon(Icons.close, size: 16),
                    onPressed: () => _removeLeg(l.eventId),
                  ),
                ],
              ),
            )),
        Text('All ${_slip.length} must win · pays ${_mult(dec)} your stake',
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
                  labelText: 'Parlay stake',
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
          onPressed: stake > 0 ? _placeParlay : null,
          child: Text('Place ${_slip.length}-leg parlay'),
        ),
      ],
    );
  }

  Widget _buildSingles(ThemeData theme) {
    var totalStake = 0.0;
    var totalPayout = 0.0;
    var staked = 0;
    for (final l in _slip) {
      final s = double.tryParse(_ctrlFor(l.eventId).text) ?? 0;
      if (s > 0) staked++;
      totalStake += s;
      totalPayout += s * l.decimalOdds;
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ..._slip.map((l) {
          final ctrl = _ctrlFor(l.eventId);
          final s = double.tryParse(ctrl.text) ?? 0;
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(l.label, style: theme.textTheme.bodyMedium),
                      Text('${_mult(l.decimalOdds)} · ${_payBack(l.decimalOdds)}',
                          style: theme.textTheme.labelSmall
                              ?.copyWith(fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
                SizedBox(
                  width: 88,
                  child: TextField(
                    controller: ctrl,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                    ],
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(
                      prefixText: '\$',
                      isDense: true,
                      border: OutlineInputBorder(),
                      labelText: 'Stake',
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                SizedBox(
                  width: 60,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text('win', style: theme.textTheme.labelSmall),
                      Text(s > 0 ? money(s * l.decimalOdds) : '—',
                          style: theme.textTheme.bodySmall?.copyWith(
                              color: kGain, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.close, size: 16),
                  onPressed: () => _removeLeg(l.eventId),
                ),
              ],
            ),
          );
        }),
        if (_slip.length >= 2) ...[
          const Divider(),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Total stake ${money(totalStake)}',
                  style: theme.textTheme.bodySmall),
              Text('to win ${money(totalPayout)}',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: kGain, fontWeight: FontWeight.bold)),
            ],
          ),
        ],
        const SizedBox(height: 10),
        FilledButton(
          onPressed: staked > 0 ? _placeSingles : null,
          child: Text(staked <= 1 ? 'Place bet' : 'Place $staked singles'),
        ),
      ],
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
      // A game you've already bet is locked — only one wager per game.
      final fav = dec < 2.0; // shorter price = favorite
      return Expanded(
        child: InkWell(
          onTap: locked ? null : () => onPick(home),
          borderRadius: BorderRadius.circular(12),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 120),
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
            decoration: BoxDecoration(
              color: sel
                  ? theme.colorScheme.primary.withOpacity(0.18)
                  : Colors.transparent,
              border: Border.all(
                color: sel
                    ? theme.colorScheme.primary
                    : theme.colorScheme.outlineVariant,
                width: sel ? 2 : 1,
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (sel) ...[
                      Icon(Icons.check_circle,
                          size: 16, color: theme.colorScheme.primary),
                      const SizedBox(width: 4),
                    ],
                    Flexible(
                      child: Text(team,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleSmall
                              ?.copyWith(fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(_payBack(dec),
                    style: theme.textTheme.labelMedium
                        ?.copyWith(color: kGain, fontWeight: FontWeight.w700)),
                Text(fav ? 'Favorite' : 'Underdog',
                    style: theme.textTheme.labelSmall
                        ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
              ],
            ),
          ),
        ),
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
