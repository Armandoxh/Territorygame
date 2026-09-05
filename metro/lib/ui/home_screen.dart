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
/// map, and a LINES / NETWORK tab strip — LINES unlocks routes and opens
/// per-line sheets (trains + scoped upgrades), NETWORK sells the city-wide
/// levers. Stations tap open for per-station work (food courts). The game
/// ticks at frame rate while open; a periodic timer persists it; time away
/// is credited on return.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with SingleTickerProviderStateMixin {
  GameState game = GameState();
  int _tab = 0; // 0 = LINES, 1 = NETWORK
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
    final riders = (credit / game.currentFare).round();
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

  void _openLine(LineDef line) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(),
      builder: (context) => ListenableBuilder(
        listenable: game,
        builder: (context, _) => _LineSheet(game: game, line: line),
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
                    Text('Tap a line for its trains & upgrades · tap a station for concessions · NETWORK tab for city-wide works.',
                        style: TransitStyle.signage(
                            size: 10,
                            color: const Color(0x99000000),
                            weight: FontWeight.w600)),
                    const SizedBox(height: 16),
                    _TabBar(
                      tabs: const ['LINES', 'NETWORK'],
                      selected: _tab,
                      onSelect: (i) => setState(() => _tab = i),
                    ),
                    const SizedBox(height: 8),
                    if (_tab == 0)
                      DataPanel(
                        padding: EdgeInsets.zero,
                        child: Column(
                          children: [
                            for (var i = 0;
                                i < game.city.lines.length;
                                i++) ...[
                              if (i > 0)
                                Container(
                                    height: 1, color: TransitStyle.hairline),
                              _LineRow(
                                  game: game,
                                  line: game.city.lines[i],
                                  onOpen: _openLine),
                            ],
                          ],
                        ),
                      )
                    else
                      _NetworkPanel(game: game),
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

/// Square-cornered dashboard tab strip: 1px ink border, active tab inverts
/// to the sign-bar black — same visual language as the data panels.
class _TabBar extends StatelessWidget {
  const _TabBar(
      {required this.tabs, required this.selected, required this.onSelect});

  final List<String> tabs;
  final int selected;
  final void Function(int) onSelect;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: TransitStyle.ink),
        color: Colors.white,
      ),
      child: Row(
        children: [
          for (var i = 0; i < tabs.length; i++)
            Expanded(
              child: GestureDetector(
                onTap: () => onSelect(i),
                child: Container(
                  color: i == selected ? TransitStyle.ink : Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 9),
                  alignment: Alignment.center,
                  child: Text(
                    tabs[i],
                    style: TransitStyle.signage(
                        size: 12,
                        color: i == selected ? Colors.white : TransitStyle.ink,
                        weight: FontWeight.w900,
                        spacing: 2),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// The NETWORK tab: upgrades that hit every line at once — signals, doors,
/// marketing, fares. The system-wide counterpart to the per-line sheets.
class _NetworkPanel extends StatelessWidget {
  const _NetworkPanel({required this.game});
  final GameState game;

  @override
  Widget build(BuildContext context) {
    return DataPanel(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < GameState.globalUpgrades.length; i++) ...[
            if (i > 0) Container(height: 1, color: TransitStyle.hairline),
            _UpgradeRow(
              name: GameState.globalUpgrades[i].name,
              level: game.globalLevelOf(GameState.globalUpgrades[i].id),
              maxLevel: GameState.globalUpgrades[i].maxLevel,
              blurb: _liveBlurb(GameState.globalUpgrades[i]),
              cost: game.nextGlobalCost(GameState.globalUpgrades[i].id),
              canAfford: game.cash >=
                  game.nextGlobalCost(GameState.globalUpgrades[i].id),
              onBuy: () => game.buyGlobal(GameState.globalUpgrades[i].id),
            ),
          ],
        ],
      ),
    );
  }

  /// The fare row shows the live fare so the header number always traces
  /// back to a purchase the player made.
  String _liveBlurb(GlobalUpgradeDef def) => def.id == 'fare'
      ? '${def.blurb} · now \$${game.currentFare.toStringAsFixed(2)}'
      : def.blurb;
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
            'fare \$${game.currentFare.toStringAsFixed(2)}/rider · '
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
  const _LineRow(
      {required this.game, required this.line, required this.onOpen});

  final GameState game;
  final LineDef line;
  final void Function(LineDef) onOpen;

  @override
  Widget build(BuildContext context) {
    final unlocked = game.isUnlocked(line.id);
    return InkWell(
      onTap: unlocked ? () => onOpen(line) : null,
      child: Padding(
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
      ),
    );
  }
}

/// The per-line sheet: THIS line's trains and its own upgrades — nothing
/// here blankets across the network.
class _LineSheet extends StatelessWidget {
  const _LineSheet({required this.game, required this.line});

  final GameState game;
  final LineDef line;

  @override
  Widget build(BuildContext context) {
    final id = line.id;
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
                  RouteBullet(
                      label: line.bullet, color: line.color, size: 22),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(line.name.toUpperCase(),
                        style: TransitStyle.signage(size: 16, spacing: 1)),
                  ),
                  Text(
                      '${game.trainCount(id)} train'
                      '${game.trainCount(id) == 1 ? '' : 's'}',
                      style: TransitStyle.signage(
                          size: 12,
                          color: Colors.white70,
                          weight: FontWeight.w600)),
                ],
              ),
            ),
            const SizedBox(height: 12),
            DataPanel(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  _UpgradeRow(
                    name: 'ADD TRAIN',
                    level: game.trainCount(id),
                    maxLevel: 99,
                    blurb: 'Another ${line.bullet} train in service',
                    cost: game.nextTrainCost(line),
                    canAfford: game.cash >= game.nextTrainCost(line),
                    onBuy: () => game.buyTrain(id),
                  ),
                  Container(height: 1, color: TransitStyle.hairline),
                  _UpgradeRow(
                    name: 'EXPRESS MOTORS',
                    level: game.speedLevelOf(id),
                    blurb: '+15% speed for ${line.bullet} trains',
                    cost: game.nextSpeedCost(id),
                    canAfford: game.cash >= game.nextSpeedCost(id),
                    onBuy: () => game.buySpeed(id),
                  ),
                  Container(height: 1, color: TransitStyle.hairline),
                  _UpgradeRow(
                    name: 'BIGGER CARS',
                    level: game.carLevelOf(id),
                    blurb:
                        'Riders per stop: ${game.capacityFor(id).toStringAsFixed(0)} (+6 per level)',
                    cost: game.nextCarCost(id),
                    canAfford: game.cash >= game.nextCarCost(id),
                    onBuy: () => game.buyCars(id),
                  ),
                  Container(height: 1, color: TransitStyle.hairline),
                  _UpgradeRow(
                    name: 'STEP-FREE STATIONS',
                    level: game.accessLevelOf(id),
                    blurb: "+10% ridership on this line's stations",
                    cost: game.nextAccessCost(id),
                    canAfford: game.cash >= game.nextAccessCost(id),
                    onBuy: () => game.buyAccess(id),
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

/// A minimalist upgrade data row (used by the line sheet).
class _UpgradeRow extends StatelessWidget {
  const _UpgradeRow({
    required this.name,
    required this.level,
    this.maxLevel = GameState.levelMax,
    required this.blurb,
    required this.cost,
    required this.canAfford,
    required this.onBuy,
  });

  final String name;
  final int level;
  final int maxLevel;
  final String blurb;
  final double cost;
  final bool canAfford;
  final VoidCallback onBuy;

  @override
  Widget build(BuildContext context) {
    final maxed = level >= maxLevel;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                    maxLevel > GameState.levelMax
                        ? '$name · $level in service'
                        : '$name · LV $level/$maxLevel',
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
                          '${(station.demand * game.demandMultAt(station.id) * 60).toStringAsFixed(0)}/min'),
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
