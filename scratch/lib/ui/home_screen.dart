import 'dart:async';

import 'package:flutter/material.dart';

import '../state/game_state.dart';
import '../state/save_service.dart';
import '../version.dart';
import 'scratch_card.dart';

/// v0.1: one screen. Cash on top, the ticket in the middle, two upgrades
/// below. Everything else (tiers, machines, golden tickets) layers onto this.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  GameState game = GameState();
  Timer? _saveTimer;
  bool _revealed = false;

  @override
  void initState() {
    super.initState();
    game.addListener(_scheduleSave);
    _restore();
  }

  Future<void> _restore() async {
    final loaded = await SaveService.load();
    if (loaded == null || !mounted) return;
    setState(() {
      game.removeListener(_scheduleSave);
      game.dispose();
      game = loaded;
      game.addListener(_scheduleSave);
    });
  }

  void _scheduleSave() {
    _saveTimer?.cancel();
    _saveTimer =
        Timer(const Duration(milliseconds: 800), () => SaveService.save(game));
  }

  @override
  void dispose() {
    _saveTimer?.cancel();
    game.removeListener(_scheduleSave);
    game.dispose();
    super.dispose();
  }

  void _collect() {
    setState(() {
      _revealed = false;
      game.settleCurrent();
    });
  }

  Future<void> _confirmRestart() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Start over?'),
        content: const Text(
            'This erases your empire — cash, upgrades, stats. No undo.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Erase & restart')),
        ],
      ),
    );
    if (ok != true) return;
    await SaveService.clear();
    setState(() {
      _revealed = false;
      game.removeListener(_scheduleSave);
      game.dispose();
      game = GameState();
      game.addListener(_scheduleSave);
    });
    SaveService.save(game);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: ListenableBuilder(
          listenable: game,
          builder: (context, _) {
            final t = game.current;
            return Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
                  children: [
                    _Header(game: game),
                    const SizedBox(height: 16),
                    if (t != null) ...[
                      ScratchCard(
                        key: ObjectKey(t),
                        ticket: t,
                        onRevealed: () => setState(() => _revealed = true),
                      ),
                      const SizedBox(height: 12),
                      if (_revealed)
                        FilledButton(
                          onPressed: _collect,
                          style: FilledButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            textStyle: theme.textTheme.titleMedium
                                ?.copyWith(fontWeight: FontWeight.bold),
                          ),
                          child: Text(t.isWinner
                              ? 'Collect \$${t.payout.toStringAsFixed(0)}'
                              : 'Next ticket'),
                        ),
                    ] else ...[
                      _BuyArea(game: game),
                    ],
                    const SizedBox(height: 20),
                    Text('UPGRADES',
                        style: theme.textTheme.labelMedium?.copyWith(
                            letterSpacing: 2,
                            color: theme.colorScheme.onSurfaceVariant)),
                    const SizedBox(height: 8),
                    _UpgradeCard(
                      emoji: '🤞',
                      name: 'Lucky Fingers',
                      level: game.luckLevel,
                      maxLevel: GameState.luckMax,
                      blurb: 'More tickets win.',
                      cost: game.nextLuckCost,
                      canAfford: game.cash >= game.nextLuckCost,
                      onBuy: () => game.buyLuck(),
                    ),
                    const SizedBox(height: 8),
                    _UpgradeCard(
                      emoji: '💎',
                      name: 'Bigger Prizes',
                      level: game.payoutLevel,
                      maxLevel: GameState.payoutMax,
                      blurb: '+15% to every prize.',
                      cost: game.nextPayoutCost,
                      canAfford: game.cash >= game.nextPayoutCost,
                      onBuy: () => game.buyPayout(),
                    ),
                    const SizedBox(height: 20),
                    Center(
                      child: TextButton(
                        onPressed: _confirmRestart,
                        child: Text(
                          'v$kAppVersion · build $kBuildNumber · restart',
                          style: theme.textTheme.labelSmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.game});
  final GameState game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Text('SCRATCH EMPIRE',
            style: theme.textTheme.labelLarge?.copyWith(
                letterSpacing: 4, color: theme.colorScheme.primary)),
        const SizedBox(height: 6),
        Text('\$${game.cash.toStringAsFixed(2)}',
            style: theme.textTheme.displaySmall
                ?.copyWith(fontWeight: FontWeight.w900)),
        const SizedBox(height: 4),
        Text(
          '${game.ticketsScratched} scratched · biggest win '
          '\$${game.biggestWin.toStringAsFixed(0)}',
          style: theme.textTheme.labelSmall
              ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }
}

/// Buy a ticket — or, if you're broke, find a free one on the ground.
/// (The softlock guard: play never dead-ends.)
class _BuyArea extends StatelessWidget {
  const _BuyArea({required this.game});
  final GameState game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (game.canFindFreeTicket) {
      return Column(
        children: [
          Text('Out of cash!',
              style: theme.textTheme.titleSmall
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          const SizedBox(height: 8),
          FilledButton.tonal(
            onPressed: () => game.findFreeTicket(),
            style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(
                    horizontal: 24, vertical: 18)),
            child: const Text('🎫  You spot a ticket on the ground — grab it!'),
          ),
        ],
      );
    }
    return FilledButton(
      onPressed: game.canBuy ? () => game.buyTicket() : null,
      style: FilledButton.styleFrom(
        padding: const EdgeInsets.symmetric(vertical: 20),
        textStyle:
            theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
      ),
      child: Text(
          '🎟  Buy a ${game.ticket.name} ticket · \$${game.ticket.cost.toStringAsFixed(0)}'),
    );
  }
}

class _UpgradeCard extends StatelessWidget {
  const _UpgradeCard({
    required this.emoji,
    required this.name,
    required this.level,
    required this.maxLevel,
    required this.blurb,
    required this.cost,
    required this.canAfford,
    required this.onBuy,
  });

  final String emoji;
  final String name;
  final int level;
  final int maxLevel;
  final String blurb;
  final double cost;
  final bool canAfford;
  final VoidCallback onBuy;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final maxed = level >= maxLevel;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
        child: Row(
          children: [
            Text(emoji, style: const TextStyle(fontSize: 26)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('$name · Lv $level/$maxLevel',
                      style: theme.textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.bold)),
                  Text(blurb, style: theme.textTheme.bodySmall),
                ],
              ),
            ),
            const SizedBox(width: 8),
            maxed
                ? Text('MAX',
                    style: theme.textTheme.labelLarge?.copyWith(
                        color: theme.colorScheme.primary,
                        fontWeight: FontWeight.bold))
                : FilledButton.tonal(
                    onPressed: canAfford ? onBuy : null,
                    child: Text('\$${cost.toStringAsFixed(0)}'),
                  ),
          ],
        ),
      ),
    );
  }
}
