import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../data/cities.dart';
import '../state/game_state.dart';
import '../state/save_service.dart';
import '../version.dart';
import 'metro_map.dart';
import 'transit_style.dart';

/// One screen, dashboard voice (STYLE.md): the sign-bar header, the living
/// map, a LINES panel (unlock lines, add trains), SERVICE upgrades, and
/// tappable stations for per-station work (food courts). The game ticks at
/// frame rate while open; a periodic timer persists it; time away is
/// credited on return.
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
    final dt = (elapsed - _lastElapsed).inMicroseconds /
        Duration.microsecondsPerSecond;
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
        title: const Text('While you were away…'),
        content: Text(
          'Your system kept running.\n\n'
          '~$riders riders carried\n'
          'Fares collected: +\$${credit.toStringAsFixed(0)}\n'
          'Busiest station: ${game.busiestStation.name}',
        ),
        actions: [
          FilledButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('COLLECT')),
        ],
      ),
    );
  }

  void _openStation(StationDef st) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(),
      builder: (context) => ListenableBuilder(
        listenable: game,
        builder: (context, _) => _StationSheet(game: game, station: st),
      ),
    );
  }

  Future<void> _confirmRestart() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Start over?'),
        content: const Text(
            'This erases your transit empire — cash, lines, upgrades. No undo.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('ERASE & RESTART')),
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
                    MetroMap(game: game, onStationTap: _openStation),
                    const SizedBox(height: 4),
                    Text('Pinch to zoom · drag to pan · tap a station for details.',
                        style: TransitStyle.signage(
                            size: 10,
                            color: const Color(0x99000000),
                            weight: FontWeight.w600)),
                    const SizedBox(height: 16),
                    const SectionLabel('LINES'),
                    const SizedBox(height: 8),
                    DataPanel(
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: [
                          for (var i = 0; i < game.city.lines.length; i++) ...[
                            if (i > 0)
                              Container(
                                  height: 1, color: TransitStyle.hairline),
                            _LineRow(game: game, line: game.city.lines[i]),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    const SectionLabel('SERVICE UPGRADES'),
                    const SizedBox(height: 8),
                    DataPanel(
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: [
                          _UpgradeRow(
                            name: 'EXPRESS MOTORS',
                            level: game.speedLevel,
                            blurb: '+12% train speed per level',
                            cost: game.nextSpeedCost,
                            canAfford: game.cash >= game.nextSpeedCost,
                            onBuy: () => game.buySpeed(),
                          ),
                          Container(height: 1, color: TransitStyle.hairline),
                          _UpgradeRow(
                            name: 'BIGGER CARS',
                            level: game.capacityLevel,
                            blurb: '+6 riders boarded per stop',
                            cost: game.nextCapacityCost,
                            canAfford: game.cash >= game.nextCapacityCost,
                            onBuy: () => game.buyCapacity(),
                          ),
                          Container(height: 1, color: TransitStyle.hairline),
                          _UpgradeRow(
                            name: 'STEP-FREE STATIONS',
                            level: game.accessLevel,
                            blurb: 'Accessibility: +10% ridership per level',
                            cost: game.nextAccessCost,
                            canAfford: game.cash >= game.nextAccessCost,
                            onBuy: () => game.buyAccess(),
                          ),
                        ],
                      ),
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

/// The header is a station sign: black bar, white rule, the bullets of every
/// line you run, cash in signage type.
class _Header extends StatelessWidget {
  const _Header({required this.game});
  final GameState game;

  @override
  Widget build(BuildContext context) {
    return StationSign(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              for (final line in game.city.lines)
                if (game.isUnlocked(line.id))
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: RouteBullet(
                        label: line.bullet, color: line.color, size: 22),
                  ),
              const SizedBox(width: 2),
              Text('METRO MAGNATE',
                  style: TransitStyle.signage(size: 13, spacing: 3)),
            ],
          ),
          const SizedBox(height: 8),
          Text('\$${game.cash.toStringAsFixed(0)}',
              style: TransitStyle.signage(size: 40, weight: FontWeight.w900)),
          const SizedBox(height: 2),
          Text(
            '≈ \$${game.avgRate.toStringAsFixed(1)}/sec · '
            '${game.totalRiders.toStringAsFixed(0)} riders served',
            style: TransitStyle.signage(
                size: 12, color: Colors.white70, weight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

/// One row of the LINES panel: bullet, name, and either the unlock buy or
/// the train count + next-train buy.
class _LineRow extends StatelessWidget {
  const _LineRow({required this.game, required this.line});

  final GameState game;
  final LineDef line;

  @override
  Widget build(BuildContext context) {
    final unlocked = game.isUnlocked(line.id);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
      child: Row(
        children: [
          RouteBullet(
              label: line.bullet,
              color: line.color,
              size: 26,
              dimmed: !unlocked),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(line.name.toUpperCase(),
                    style: TransitStyle.signage(
                        size: 12,
                        color: TransitStyle.ink,
                        weight: FontWeight.w900,
                        spacing: 0.5)),
                Text(
                  unlocked
                      ? '${game.trainCount(line.id)} train'
                          '${game.trainCount(line.id) == 1 ? '' : 's'} in service'
                      : '${line.stationIds.length} stations · planned route',
                  style: TransitStyle.signage(
                      size: 11,
                      color: const Color(0x99000000),
                      weight: FontWeight.w600),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (unlocked)
            OutlinedButton(
              onPressed: game.cash >= game.nextTrainCost(line)
                  ? () => game.buyTrain(line.id)
                  : null,
              child: Text(
                  '+ TRAIN \$${game.nextTrainCost(line).toStringAsFixed(0)}'),
            )
          else
            FilledButton(
              onPressed: game.cash >= line.unlockCost
                  ? () => game.buyLine(line.id)
                  : null,
              child:
                  Text('UNLOCK \$${line.unlockCost.toStringAsFixed(0)}'),
            ),
        ],
      ),
    );
  }
}

/// One row of the SERVICE UPGRADES panel — a minimalist data row.
class _UpgradeRow extends StatelessWidget {
  const _UpgradeRow({
    required this.name,
    required this.level,
    required this.blurb,
    required this.cost,
    required this.canAfford,
    required this.onBuy,
  });

  final String name;
  final int level;
  final String blurb;
  final double cost;
  final bool canAfford;
  final VoidCallback onBuy;

  @override
  Widget build(BuildContext context) {
    final maxed = level >= GameState.levelMax;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$name · LV $level/${GameState.levelMax}',
                    style: TransitStyle.signage(
                        size: 12,
                        color: TransitStyle.ink,
                        weight: FontWeight.w900,
                        spacing: 0.5)),
                Text(blurb,
                    style: TransitStyle.signage(
                        size: 11,
                        color: const Color(0x99000000),
                        weight: FontWeight.w600)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          maxed
              ? Text('MAX',
                  style: TransitStyle.signage(
                      size: 12,
                      color: TransitStyle.ink,
                      weight: FontWeight.w900))
              : OutlinedButton(
                  onPressed: canAfford ? onBuy : null,
                  child: Text('\$${cost.toStringAsFixed(0)}'),
                ),
        ],
      ),
    );
  }
}

/// The per-station sheet: platform data + the food-court concession upgrade.
class _StationSheet extends StatelessWidget {
  const _StationSheet({required this.game, required this.station});

  final GameState game;
  final StationDef station;

  @override
  Widget build(BuildContext context) {
    final level = game.foodLevel[station.id] ?? 0;
    final maxed = level >= GameState.foodMax;
    final cost = game.foodCost(level);
    final servingLines = [
      for (final line in game.city.lines)
        if (game.isUnlocked(line.id) &&
            line.stationIds.contains(station.id))
          line,
    ];
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            StationSign(
              child: Row(
                children: [
                  for (final line in servingLines)
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: RouteBullet(
                          label: line.bullet, color: line.color, size: 20),
                    ),
                  const SizedBox(width: 2),
                  Expanded(
                    child: Text(station.name.toUpperCase(),
                        style: TransitStyle.signage(size: 16, spacing: 1)),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            DataPanel(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _Stat(
                      label: 'DEMAND',
                      value:
                          '${(station.demand * game.demandMult * 60).toStringAsFixed(0)}/min'),
                  _Stat(
                      label: 'WAITING',
                      value:
                          (game.waiting[station.id] ?? 0).floor().toString()),
                  _Stat(
                      label: 'FOOD COURT',
                      value: level == 0 ? '—' : 'LV $level'),
                ],
              ),
            ),
            const SizedBox(height: 8),
            DataPanel(
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('FOOD COURT',
                            style: TransitStyle.signage(
                                size: 12,
                                color: TransitStyle.ink,
                                weight: FontWeight.w900,
                                spacing: 0.5)),
                        Text(
                          'Concessions: +\$${GameState.foodBonusPerLevel.toStringAsFixed(2)} '
                          'per boarding rider, per level.',
                          style: TransitStyle.signage(
                              size: 11,
                              color: const Color(0x99000000),
                              weight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  maxed
                      ? Text('MAX',
                          style: TransitStyle.signage(
                              size: 12,
                              color: TransitStyle.ink,
                              weight: FontWeight.w900))
                      : FilledButton(
                          onPressed: game.cash >= cost
                              ? () => game.buyFood(station.id)
                              : null,
                          child: Text(
                              'BUILD \$${cost.toStringAsFixed(0)}'),
                        ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value,
            style: TransitStyle.signage(
                size: 18, color: TransitStyle.ink, weight: FontWeight.w900)),
        const SizedBox(height: 2),
        Text(label,
            style: TransitStyle.signage(
                size: 10,
                color: const Color(0x99000000),
                weight: FontWeight.w800,
                spacing: 1)),
      ],
    );
  }
}
