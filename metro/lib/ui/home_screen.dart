import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../state/game_state.dart';
import '../state/save_service.dart';
import '../version.dart';
import 'metro_map.dart';

/// v0.1: one screen. Cash on top, the living map in the middle, three
/// upgrades below. The game ticks at frame rate while open; a periodic timer
/// persists it; time away is credited on return.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with SingleTickerProviderStateMixin {
  GameState game = GameState();
  late final Ticker _ticker = createTicker(_onTick);
  Duration _lastElapsed = Duration.zero;
  Timer? _savePulse;

  @override
  void initState() {
    super.initState();
    _ticker.start();
    // Continuous ticking means a debounced-on-change save would never fire —
    // persist on a steady pulse instead.
    _savePulse = Timer.periodic(
        const Duration(seconds: 10), (_) => SaveService.save(game));
    _restore();
  }

  void _onTick(Duration elapsed) {
    final dt =
        (elapsed - _lastElapsed).inMicroseconds / Duration.microsecondsPerSecond;
    _lastElapsed = elapsed;
    // Clamp big gaps (backgrounded tab) — long absences are the offline
    // system's job, not one giant frame's.
    game.tick(dt.clamp(0.0, 0.25));
  }

  Future<void> _restore() async {
    final loaded = await SaveService.load();
    if (loaded == null || !mounted) return;
    setState(() {
      game.dispose();
      game = loaded;
    });
    final credit =
        loaded.applyOfflineEarnings(DateTime.now().millisecondsSinceEpoch);
    if (credit > 0 && mounted) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _showWelcomeBack(credit);
      });
    }
  }

  void _showWelcomeBack(double credit) {
    final riders = (credit / GameState.fare).round();
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('🚇 While you were away…'),
        content: Text(
          'Your line kept running.\n\n'
          '~$riders riders rode the ${game.line.name}\n'
          'Fares collected: +\$${credit.toStringAsFixed(0)}\n'
          'Busiest station: ${game.busiestStation.name}',
        ),
        actions: [
          FilledButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Collect')),
        ],
      ),
    );
  }

  Future<void> _confirmRestart() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Start over?'),
        content: const Text(
            'This erases your transit empire — cash, upgrades, stats. No undo.'),
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
      game.dispose();
      game = GameState();
    });
    SaveService.save(game);
  }

  @override
  void dispose() {
    _savePulse?.cancel();
    _ticker.dispose();
    SaveService.save(game);
    game.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: ListenableBuilder(
          listenable: game,
          builder: (context, _) {
            return Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 460),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  children: [
                    _Header(game: game),
                    const SizedBox(height: 12),
                    MetroMap(game: game),
                    const SizedBox(height: 16),
                    Text('UPGRADES',
                        style: theme.textTheme.labelMedium?.copyWith(
                            letterSpacing: 2,
                            color: theme.colorScheme.onSurfaceVariant)),
                    const SizedBox(height: 8),
                    _UpgradeCard(
                      emoji: '🚄',
                      name: 'Express Motors',
                      level: game.speedLevel,
                      blurb: '+12% train speed — more laps, more fares.',
                      cost: game.nextSpeedCost,
                      canAfford: game.cash >= game.nextSpeedCost,
                      onBuy: () => game.buySpeed(),
                    ),
                    const SizedBox(height: 8),
                    _UpgradeCard(
                      emoji: '🚃',
                      name: 'Bigger Cars',
                      level: game.capacityLevel,
                      blurb: '+6 riders boarded per stop.',
                      cost: game.nextCapacityCost,
                      canAfford: game.cash >= game.nextCapacityCost,
                      onBuy: () => game.buyCapacity(),
                    ),
                    const SizedBox(height: 8),
                    _UpgradeCard(
                      emoji: '♿',
                      name: 'Step-Free Stations',
                      level: game.accessLevel,
                      blurb:
                          'Elevators & ramps — accessible stations serve +10% more riders.',
                      cost: game.nextAccessCost,
                      canAfford: game.cash >= game.nextAccessCost,
                      onBuy: () => game.buyAccess(),
                    ),
                    const SizedBox(height: 16),
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
        Text('METRO MAGNATE',
            style: theme.textTheme.labelLarge?.copyWith(
                letterSpacing: 4, color: theme.colorScheme.primary)),
        const SizedBox(height: 6),
        Text('\$${game.cash.toStringAsFixed(0)}',
            style: theme.textTheme.displaySmall
                ?.copyWith(fontWeight: FontWeight.w900)),
        const SizedBox(height: 4),
        Text(
          '≈ \$${game.avgRate.toStringAsFixed(1)}/sec · '
          '${game.totalRiders.toStringAsFixed(0)} riders served',
          style: theme.textTheme.labelSmall
              ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }
}

class _UpgradeCard extends StatelessWidget {
  const _UpgradeCard({
    required this.emoji,
    required this.name,
    required this.level,
    required this.blurb,
    required this.cost,
    required this.canAfford,
    required this.onBuy,
  });

  final String emoji;
  final String name;
  final int level;
  final String blurb;
  final double cost;
  final bool canAfford;
  final VoidCallback onBuy;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final maxed = level >= GameState.levelMax;
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
                  Text('$name · Lv $level/${GameState.levelMax}',
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
