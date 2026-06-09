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
  final String key; // which selection within the game (one per game)
  final String label;
  final double decimalOdds;
  final double winProb;
  _SlipLeg(this.eventId, this.key, this.label, this.decimalOdds, this.winProb);
}

/// "47.5" / "3" — drop a trailing ".0".
String _line(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);

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

  void _pick(BetOption o) {
    setState(() {
      final i = _slip.indexWhere((l) => l.eventId == o.eventId);
      final leg = _SlipLeg(o.eventId, o.selectionKey,
          '${o.pickLabel} · ${o.groupLabel}', o.decimalOdds, o.winProb);
      if (i == -1) {
        _slip.add(leg);
      } else if (_slip[i].key == o.selectionKey) {
        _slip.removeAt(i); // tapping the same pick again removes it
        _singleCtrls.remove(o.eventId)?.dispose();
      } else {
        _slip[i] = leg; // switch selection within the same game
      }
    });
  }

  bool _selected(int eventId, String key) =>
      _slip.any((l) => l.eventId == eventId && l.key == key);

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
        if (game.featuredParlays.isNotEmpty) ..._buildFeatured(theme),
        Container(
          padding: const EdgeInsets.all(12),
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: kLoss.withOpacity(0.10),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: kLoss.withOpacity(0.4)),
          ),
          child: Text(
            'How to bet: tap any line — moneyline (who wins), spread (margin), '
            'total (over/under), or a player prop. Odds like "-110" / "+150" are '
            'American: +150 pays \$150 profit on \$100. One pick per game; combine '
            'picks across games into a parlay (all must win) for a bigger payout. '
            'The house keeps an edge, so bet for fun.',
            style: theme.textTheme.bodySmall,
          ),
        ),
        if (game.betsSettled > 0) _buildRecord(theme),
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
            isSelected: (key) => _selected(e.id, key),
            onPick: _pick,
          )),
    ];
  }

  Widget _buildRecord(ThemeData theme) {
    final net = game.betNetProfit;
    final netColor = net >= 0 ? kGain : kLoss;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.insights, size: 18),
                const SizedBox(width: 6),
                Text('Your betting record', style: theme.textTheme.titleSmall),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _stat(theme, 'Settled', '${game.betsSettled}'),
                _stat(theme, 'Hit rate',
                    '${(game.betWinRate * 100).toStringAsFixed(0)}%'),
                _stat(theme, 'Net P&L', money(net), color: netColor),
              ],
            ),
            if (game.betHistory.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text('Recent', style: theme.textTheme.labelSmall),
              const SizedBox(height: 4),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final r in game.betHistory.take(8))
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: (r.won ? kGain : kLoss).withOpacity(0.15),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        r.won
                            ? '+${money(r.profit)}'
                            : '−${money(r.stake)}',
                        style: theme.textTheme.labelSmall?.copyWith(
                            color: r.won ? kGain : kLoss,
                            fontWeight: FontWeight.bold),
                      ),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _stat(ThemeData theme, String label, String value, {Color? color}) =>
      Column(
        children: [
          Text(value,
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.bold, color: color)),
          Text(label,
              style: theme.textTheme.labelSmall
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        ],
      );

  /// The DraftKings-style strip of pre-built, boosted parlays at the top.
  List<Widget> _buildFeatured(ThemeData theme) {
    return [
      Row(
        children: [
          Text('🔥 Featured parlays', style: theme.textTheme.titleMedium),
          const SizedBox(width: 8),
          Expanded(
            child: Text('one tap to load · boosted',
                style: theme.textTheme.labelSmall
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ),
        ],
      ),
      const SizedBox(height: 8),
      SizedBox(
        height: 240,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: game.featuredParlays.length,
          separatorBuilder: (_, __) => const SizedBox(width: 12),
          itemBuilder: (_, i) {
            final p = game.featuredParlays[i];
            final available =
                p.legs.every((l) => !game.hasBetOn(l.eventId));
            return _FeaturedCard(
              parlay: p,
              available: available,
              onTap: () => _openFeaturedSheet(p),
            );
          },
        ),
      ),
      const SizedBox(height: 16),
    ];
  }

  /// Tap a featured card → a stake sheet (with quick chips) to fire it off.
  void _openFeaturedSheet(FeaturedParlay p) {
    final ctrl = TextEditingController();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetCtx) {
        return StatefulBuilder(builder: (ctx, setSheet) {
          final theme = Theme.of(ctx);
          final stake = double.tryParse(ctrl.text) ?? 0;
          final payout = stake * p.boostedDecimal;
          void quick(double amt) {
            ctrl.text = amt.toStringAsFixed(0);
            setSheet(() {});
          }

          Widget chip(String label, double amt) => ActionChip(
                label: Text(label),
                onPressed: () => quick(amt),
              );

          return Padding(
            padding: EdgeInsets.fromLTRB(
                20, 0, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                          child: Text(p.name,
                              style: theme.textTheme.titleLarge)),
                      _boostBadge(theme, p.boost),
                    ],
                  ),
                  Text(p.blurb,
                      style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant)),
                  const SizedBox(height: 12),
                  ...p.legs.map((l) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Row(
                          children: [
                            Expanded(
                                child: Text(l.label,
                                    style: theme.textTheme.bodyMedium)),
                            Text(_mult(l.decimalOdds),
                                style: theme.textTheme.bodyMedium
                                    ?.copyWith(fontWeight: FontWeight.bold)),
                          ],
                        ),
                      )),
                  const Divider(),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('All ${p.legs.length} must hit',
                          style: theme.textTheme.bodyMedium),
                      Text('pays ${_mult(p.boostedDecimal)}',
                          style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold, color: kGain)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: ctrl,
                    autofocus: true,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                    ],
                    onChanged: (_) => setSheet(() {}),
                    decoration: const InputDecoration(
                      prefixText: '\$ ',
                      border: OutlineInputBorder(),
                      labelText: 'Stake',
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: [
                      chip('\$25', 25),
                      chip('\$50', 50),
                      chip('\$100', 100),
                      chip('Max', game.cash > 0 ? game.cash.floorToDouble() : 0.0),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('To win', style: theme.textTheme.bodyMedium),
                      Text(stake > 0 ? money(payout) : '—',
                          style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold, color: kGain)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: stake > 0
                        ? () {
                            final err = game.placeFeatured(p, stake);
                            Navigator.pop(ctx);
                            _toast(err ??
                                'Placed ${p.name} for ${money(stake)} — good luck.');
                          }
                        : null,
                    child: Text('Place ${p.legs.length}-leg parlay'),
                  ),
                ],
              ),
            ),
          );
        });
      },
    ).whenComplete(ctrl.dispose);
  }
}

/// The "+30% boost" pill shown on featured parlays.
Widget _boostBadge(ThemeData theme, double boost) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: kGain.withOpacity(0.18),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text('🔥 +${(boost * 100).round()}% boost',
          style: theme.textTheme.labelSmall
              ?.copyWith(color: kGain, fontWeight: FontWeight.bold)),
    );

/// One pre-built featured parlay, shown as a tappable card in the top strip.
class _FeaturedCard extends StatelessWidget {
  const _FeaturedCard({
    required this.parlay,
    required this.available,
    required this.onTap,
  });

  final FeaturedParlay parlay;
  final bool available;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // "Lions (vs Bears)" -> "Lions"
    final teams = parlay.legs.map((l) => l.label.split(' (').first).join(' · ');
    return Opacity(
      opacity: available ? 1 : 0.5,
      child: SizedBox(
        width: 232,
        child: Card(
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: available ? onTap : null,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: _boostBadge(theme, parlay.boost),
                  ),
                  const SizedBox(height: 8),
                  Text(parlay.name,
                      style: theme.textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 2),
                  Text(parlay.blurb,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                  const SizedBox(height: 6),
                  Text('${parlay.legs.length} legs · $teams',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.labelSmall),
                  const Spacer(),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(_mult(parlay.boostedDecimal),
                              style: theme.textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.bold, color: kGain)),
                          Text(_payBack(parlay.boostedDecimal),
                              style: theme.textTheme.labelSmall),
                        ],
                      ),
                      available
                          ? Icon(Icons.add_circle,
                              color: theme.colorScheme.primary)
                          : Text('placed',
                              style: theme.textTheme.labelSmall
                                  ?.copyWith(color: theme.colorScheme.outline)),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard({
    required this.event,
    required this.locked,
    required this.isSelected,
    required this.onPick,
  });

  final SportsEvent event;
  final bool locked;
  final bool Function(String key) isSelected;
  final void Function(BetOption o) onPick;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final byKey = {for (final o in event.options()) o.selectionKey: o};

    // One tappable odds cell. [main] is the headline (line or odds); [sub] the
    // American price underneath (omitted for the moneyline column).
    Widget cell(String key, String main, {String? sub}) {
      final o = byKey[key];
      if (o == null) return const SizedBox.shrink();
      final sel = isSelected(key);
      return Padding(
        padding: const EdgeInsets.all(3),
        child: InkWell(
          onTap: locked ? null : () => onPick(o),
          borderRadius: BorderRadius.circular(10),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 120),
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
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
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(main,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: sub == null ? kGain : null)),
                if (sub != null)
                  Text(sub,
                      style: theme.textTheme.labelSmall
                          ?.copyWith(color: kGain, fontWeight: FontWeight.w700)),
              ],
            ),
          ),
        ),
      );
    }

    String amer(String key) => SportsEngine.american(byKey[key]!.decimalOdds);

    final favHome = event.spreadPoints >= 0;
    final spLine = _line(event.spreadPoints.abs());
    final tot = _line(event.totalPoints);

    // A grid row: team name + spread / total / moneyline cells.
    Widget gridRow(String name, String spKey, String spMain, String totKey,
            String totMain, String mlKey) =>
        Row(
          children: [
            Expanded(
              flex: 5,
              child: Padding(
                padding: const EdgeInsets.only(right: 6),
                child: Text(name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.bold)),
              ),
            ),
            Expanded(flex: 4, child: cell(spKey, spMain, sub: amer(spKey))),
            Expanded(flex: 4, child: cell(totKey, totMain, sub: amer(totKey))),
            Expanded(flex: 3, child: cell(mlKey, amer(mlKey))),
          ],
        );

    Widget colHead(String t, int flex) => Expanded(
        flex: flex,
        child: Text(t,
            textAlign: TextAlign.center,
            style: theme.textTheme.labelSmall
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant)));

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${event.sport}  ${event.away}  @  ${event.home}',
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
            else ...[
              Row(
                children: [
                  const Expanded(flex: 5, child: SizedBox()),
                  colHead('Spread', 4),
                  colHead('Total', 4),
                  colHead('Money', 3),
                ],
              ),
              gridRow(event.away, 'sp_a', favHome ? '+$spLine' : '-$spLine',
                  'tot_o', 'O $tot', 'ml_a'),
              gridRow(event.home, 'sp_h', favHome ? '-$spLine' : '+$spLine',
                  'tot_u', 'U $tot', 'ml_h'),
              if (event.props.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text('Player props', style: theme.textTheme.labelSmall),
                const SizedBox(height: 2),
                for (var i = 0; i < event.props.length; i++)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 1),
                    child: Row(
                      children: [
                        Expanded(
                          flex: 5,
                          child: Padding(
                            padding: const EdgeInsets.only(right: 6),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(event.props[i].player,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: theme.textTheme.bodySmall?.copyWith(
                                        fontWeight: FontWeight.bold)),
                                Text(event.props[i].stat,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: theme.textTheme.labelSmall?.copyWith(
                                        color:
                                            theme.colorScheme.onSurfaceVariant)),
                              ],
                            ),
                          ),
                        ),
                        Expanded(
                          flex: 4,
                          child: cell('p${i}_o',
                              'O ${_line(event.props[i].line)}',
                              sub: SportsEngine.american(
                                  event.props[i].overDecimal)),
                        ),
                        Expanded(
                          flex: 3,
                          child: cell('p${i}_u',
                              'U ${_line(event.props[i].line)}',
                              sub: SportsEngine.american(
                                  event.props[i].underDecimal)),
                        ),
                      ],
                    ),
                  ),
              ],
            ],
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
