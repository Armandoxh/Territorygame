import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../data/cities.dart';
import '../state/game_state.dart';
import '../state/save_service.dart';
import '../util/city_audio.dart';
import '../version.dart';
import 'metro_map.dart';
import 'transit_style.dart';

/// One screen, dashboard voice (STYLE.md): slim sign-bar header, a single
/// GOAL status line, the living map with live-state chips floating in its
/// corner, and a four-tab console — LINES (routes + per-line sheets),
/// OPS (rush timetable + commission desk), GOALS (the full ladder),
/// NETWORK (city-wide upgrades). The game ticks at frame rate while open;
/// a periodic timer persists it; time away is credited on return.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with SingleTickerProviderStateMixin {
  GameState game = GameState();
  int _seenGoalSeq = 0;
  int _seenBoardSeqAudio = 0;
  int _seenUnlockCount = 1;

  /// Playtest fast-forward: 1× or 10×. Simulated as many small sub-ticks
  /// so the physics stay exact — just compressed.
  double _timeScale = 1;
  bool _rushWasActive = false;
  int _seenCommissionSeq = 0;
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
    var remaining = dt.clamp(0.0, 0.25) * _timeScale;
    while (remaining > 0) {
      final step = remaining < 0.05 ? remaining : 0.05;
      game.tick(step);
      remaining -= step;
    }
    // The soundtrack: the sim is the score. One pluck per frame at most.
    if (game.boardSeq != _seenBoardSeqAudio) {
      _seenBoardSeqAudio = game.boardSeq;
      if (game.lastBoardLineId.isNotEmpty) {
        final lineIndex = game.city.lines
            .indexWhere((l) => l.id == game.lastBoardLineId);
        CityAudio.boarding(lineIndex,
            game.lastBoardCount / game.capacityFor(game.lastBoardLineId));
      }
    }
    if (game.commissionSeq != _seenCommissionSeq) {
      _seenCommissionSeq = game.commissionSeq;
      if (game.lastCommissionWon) {
        CityAudio.commendation();
      } else {
        CityAudio.rush();
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          backgroundColor:
              game.lastCommissionWon ? TransitStyle.ink : const Color(0xFFC62828),
          shape: const RoundedRectangleBorder(),
          duration: const Duration(seconds: 3),
          content: Text(
            game.lastCommissionWon
                ? 'COMMISSION COMPLETE — bonus paid'
                : 'COMMISSION EXPIRED — city hall moves on',
            style: TransitStyle.signage(size: 12, spacing: 1),
          ),
        ));
      }
    }
    if (game.rushActive != _rushWasActive) {
      _rushWasActive = game.rushActive;
      if (game.rushActive) CityAudio.rush();
    }
    if (game.unlockedLineIds.length != _seenUnlockCount) {
      if (game.unlockedLineIds.length > _seenUnlockCount) {
        CityAudio.unlock();
      }
      _seenUnlockCount = game.unlockedLineIds.length;
    }
    if (game.goalSeq != _seenGoalSeq) {
      _seenGoalSeq = game.goalSeq;
      CityAudio.commendation();
      if (mounted && game.lastGoalName.isNotEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          backgroundColor: TransitStyle.ink,
          shape: const RoundedRectangleBorder(),
          duration: const Duration(seconds: 3),
          content: Text(
            'COMMENDATION — ${game.lastGoalName} · income '
            '×${game.lastGoalReward.toStringAsFixed(2)}',
            style: TransitStyle.signage(size: 12, spacing: 1),
          ),
        ));
      }
    }
  }

  Future<void> _restore() async {
    final loaded = await SaveService.load();
    if (loaded == null || !mounted) return;
    setState(() {
      game.dispose();
      game = loaded;
      _seenBoardSeqAudio = loaded.boardSeq;
      _seenUnlockCount = loaded.unlockedLineIds.length;
      _seenGoalSeq = loaded.goalSeq;
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

  Future<void> _confirmMoveOn() async {
    final next = game.nextCity;
    if (next == null || !game.canMoveOn) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Open ${next.name}?'),
        content: Text(
            '${game.city.name} is complete. Move the operation to '
            '${next.name}: your cash and every commendation come with you, '
            'and the new network starts fresh at '
            '${next.costScale.toStringAsFixed(0)}× stakes. '
            '${game.city.name} stays finished — there is no going back.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Not yet')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: Text('OPEN ${next.name.toUpperCase()}')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    // Close any open sheets — they hold listeners on the old world.
    Navigator.of(context).popUntil((r) => r.isFirst);
    setState(() {
      final old = game;
      game = old.moveOn();
      old.dispose();
      _seenGoalSeq = game.goalSeq;
      _seenBoardSeqAudio = game.boardSeq;
      _seenUnlockCount = game.unlockedLineIds.length;
    });
    SaveService.save(game);
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
      _seenBoardSeqAudio = 0;
      _seenUnlockCount = 1;
      _seenGoalSeq = 0;
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

  /// Every panel opens as a bottom sheet so the map keeps the screen.
  void _openPanel(int i) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(),
      isScrollControlled: true,
      builder: (context) => ConstrainedBox(
        constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.8),
        child: ListenableBuilder(
          listenable: game,
          builder: (context, _) => switch (i) {
            0 => _LinesSheet(game: game, onOpen: _openLine),
            1 => _OpsSheet(game: game),
            2 => _GoalsSheet(game: game, onMoveOn: _confirmMoveOn),
            _ => _NetworkSheet(game: game, onRestart: _confirmRestart),
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // The map IS the screen: a slim sign-bar header and goal strip up top,
    // the living map filling everything else, and the panel tabs pinned to
    // the bottom. No scrolling ancestor — pinch/pan belongs to the map.
    return Scaffold(
      body: SafeArea(
        // Browsers gate audio behind a user gesture — any first tap
        // anywhere starts the soundtrack.
        child: Listener(
          behavior: HitTestBehavior.translucent,
          onPointerDown: (_) => CityAudio.ensureStarted(),
          child: ListenableBuilder(
          listenable: game,
          builder: (context, _) {
            return Column(
              children: [
                _Header(
                    game: game,
                    muted: CityAudio.isMuted,
                    onToggleMute: () => setState(() {
                          CityAudio.ensureStarted();
                          CityAudio.toggleMute();
                        }),
                    timeScale: _timeScale,
                    onToggleSpeed: () => setState(() {
                          _timeScale = _timeScale == 1 ? 10 : 1;
                        })),
                _StatusStrip(game: game, onTap: () => _openPanel(2)),
                Expanded(
                  child: Stack(
                    children: [
                      Positioned.fill(
                        child:
                            MetroMap(game: game, onStationTap: _openStation),
                      ),
                      // Live state floats OVER the map instead of
                      // stacking layout bands above it.
                      Positioned(
                        top: 8,
                        right: 8,
                        child:
                            _LiveChips(game: game, onTap: () => _openPanel(1)),
                      ),
                      Positioned(
                        left: 8,
                        right: 8,
                        bottom: 8,
                        child: _CoachBar(
                            game: game,
                            onDismiss: () =>
                                setState(() => game.coachStep += 1)),
                      ),
                    ],
                  ),
                ),
                _TabBar(
                  tabs: const ['LINES', 'OPS', 'GOALS', 'NETWORK'],
                  selected: -1,
                  onSelect: _openPanel,
                  badges: [
                    false,
                    !game.commissionActive && game.commissionLineId != null,
                    game.canMoveOn,
                    false,
                  ],
                ),
              ],
            );
          },
          ),
        ),
      ),
    );
  }
}

/// A sheet's black header: title row plus a live BALANCE line, so what you
/// can afford is always on screen while you shop.
class _SheetSign extends StatelessWidget {
  const _SheetSign({required this.game, required this.title});
  final GameState game;
  final Widget title;

  @override
  Widget build(BuildContext context) {
    return StationSign(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          title,
          const SizedBox(height: 6),
          Row(
            children: [
              Text('BALANCE',
                  style: TransitStyle.signage(
                      size: 10,
                      color: Colors.white70,
                      weight: FontWeight.w800,
                      spacing: 1.5)),
              const Spacer(),
              Text('\$${game.cash.toStringAsFixed(0)}',
                  style: TransitStyle.signage(
                      size: 16, weight: FontWeight.w900)),
            ],
          ),
        ],
      ),
    );
  }
}

/// The LINES bottom sheet: unlock lines, add trains, open per-line sheets.
class _LinesSheet extends StatelessWidget {
  const _LinesSheet({required this.game, required this.onOpen});
  final GameState game;
  final void Function(LineDef) onOpen;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _SheetSign(
              game: game,
              title: Text('LINES',
                  style: TransitStyle.signage(size: 16, spacing: 1)),
            ),
            const SizedBox(height: 12),
            Flexible(
              child: SingleChildScrollView(
                child: DataPanel(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (var i = 0; i < game.city.lines.length; i++) ...[
                        if (i > 0)
                          Container(height: 1, color: TransitStyle.hairline),
                        _LineRow(
                            game: game,
                            line: game.city.lines[i],
                            onOpen: onOpen),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The NETWORK bottom sheet: the city-wide upgrades + the build footer.
class _NetworkSheet extends StatelessWidget {
  const _NetworkSheet({required this.game, required this.onRestart});
  final GameState game;
  final VoidCallback onRestart;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _SheetSign(
              game: game,
              title: Text('NETWORK',
                  style: TransitStyle.signage(size: 16, spacing: 1)),
            ),
            const SizedBox(height: 12),
            Flexible(
              child: SingleChildScrollView(
                child: _NetworkPanel(game: game),
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: TextButton(
                onPressed: onRestart,
                child: Text(
                  'v$kAppVersion · build $kBuildNumber · restart',
                  style: TransitStyle.signage(
                      size: 10,
                      color: const Color(0x99000000),
                      weight: FontWeight.w600),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One first-session coach mark: the tip text and the milestone that
/// auto-dismisses it. A veteran save satisfies every milestone at once
/// and never sees a tip.
class _CoachTip {
  const _CoachTip(this.text, this.done);
  final String text;
  final bool Function(GameState) done;
}

const _coachTips = [
  _CoachTip(
      'Welcome, Magnate. Your ① train runs itself — riders queue at '
      'stations and pay \$2 each when it scoops them. Pinch the map to '
      'look around your city.',
      _riders300),
  _CoachTip(
      'Money buys throughput. Tap LINES below → ① MERIDIAN LOCAL → '
      'ADD TRAIN. It will enter exactly opposite your first train.',
      _twoTrains),
  _CoachTip(
      'Next stop: a second line. Save up and UNLOCK the Ⓐ HARBOR RUNNER '
      'from the LINES sheet — watch it draw itself onto the map.',
      _twoLines),
  _CoachTip(
      'Stations have their own works: tap any station dot for food '
      'courts, fare gates, escalators and more. Line sheets can buy them '
      'for every stop at once.',
      _anyStationWork),
  _CoachTip(
      'The GOALS tab below is the long game — every goal you '
      'complete is a permanent income multiplier, and finishing the '
      'ladder opens the next city.',
      _twoGoals),
];

bool _riders300(GameState g) => g.totalRiders >= 300;
bool _twoTrains(GameState g) => g.trains.length >= 2;
bool _twoLines(GameState g) => g.unlockedLineIds.length >= 2;
bool _anyStationWork(GameState g) =>
    g.foodLevel.values.any((v) => v > 0) ||
    g.gateLevel.values.any((v) => v > 0) ||
    g.platformLevel.values.any((v) => v > 0) ||
    g.parkingLevel.values.any((v) => v > 0) ||
    g.escalatorLevel.values.any((v) => v > 0) ||
    g.securityLevel.values.any((v) => v > 0);
bool _twoGoals(GameState g) => g.goalsDone >= 2;

/// The coach strip under the goal bar: the current tip, dismissible,
/// gone forever once the first session's milestones are done.
class _CoachBar extends StatelessWidget {
  const _CoachBar({required this.game, required this.onDismiss});
  final GameState game;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    // Auto-advance past every tip whose milestone is already met.
    while (game.coachStep < _coachTips.length &&
        _coachTips[game.coachStep].done(game)) {
      game.coachStep += 1;
    }
    if (game.coachStep >= _coachTips.length) return const SizedBox.shrink();
    final tip = _coachTips[game.coachStep];
    return DataPanel(
      padding: const EdgeInsets.fromLTRB(12, 8, 6, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('TIP',
              style: TransitStyle.signage(
                  size: 10,
                  color: const Color(0xFFEE352E),
                  weight: FontWeight.w900,
                  spacing: 1.5)),
          const SizedBox(width: 10),
          Expanded(
            child: Text(tip.text,
                style: TransitStyle.signage(
                    size: 11,
                    color: TransitStyle.ink,
                    weight: FontWeight.w600)),
          ),
          GestureDetector(
            onTap: onDismiss,
            child: const Padding(
              padding: EdgeInsets.all(4),
              child: Icon(Icons.close, size: 14, color: Color(0x66000000)),
            ),
          ),
        ],
      ),
    );
  }
}


String _mmss(double s) {
  final t = s.ceil();
  return '${t ~/ 60}:${(t % 60).toString().padLeft(2, '0')}';
}

/// One thin line under the header: the current goal and the commendation
/// bonus. Tap → the full GOALS board. This is the ONLY layout band
/// between the header and the map.
class _StatusStrip extends StatelessWidget {
  const _StatusStrip({required this.game, required this.onTap});
  final GameState game;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final goal = game.currentGoal;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        color: Colors.white,
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 5),
        child: Row(
          children: [
            Text('GOAL',
                style: TransitStyle.signage(
                    size: 9,
                    color: const Color(0xFFEE352E),
                    weight: FontWeight.w900,
                    spacing: 1.5)),
            const SizedBox(width: 8),
            Expanded(
              child: goal == null
                  ? Text(
                      game.canMoveOn
                          ? '${game.city.name.toUpperCase()} COMPLETE — tap to move on'
                          : '${game.city.name.toUpperCase()} COMPLETE',
                      style: TransitStyle.signage(
                          size: 11,
                          color: TransitStyle.ink,
                          weight: FontWeight.w900))
                  : Row(
                      children: [
                        Text(goal.name,
                            style: TransitStyle.signage(
                                size: 11,
                                color: TransitStyle.ink,
                                weight: FontWeight.w900,
                                spacing: 0.5)),
                        const SizedBox(width: 10),
                        Expanded(
                          child: LinearProgressIndicator(
                            value: game.goalProgress,
                            minHeight: 3,
                            color: TransitStyle.ink,
                            backgroundColor: const Color(0x1A000000),
                          ),
                        ),
                      ],
                    ),
            ),
            if (game.goalMult > 1) ...[
              const SizedBox(width: 10),
              Text('×${game.goalMult.toStringAsFixed(1)}',
                  style: TransitStyle.signage(
                      size: 10,
                      color: const Color(0x99000000),
                      weight: FontWeight.w800)),
            ],
          ],
        ),
      ),
    );
  }
}

/// Floating live-state chips over the map's corner: rush now/next, and
/// the running commission. Tap → the OPS board.
class _LiveChips extends StatelessWidget {
  const _LiveChips({required this.game, required this.onTap});
  final GameState game;
  final VoidCallback onTap;

  Widget _chip(
      {required Color bg,
      Color? border,
      required List<Widget> children}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        border: border == null ? null : Border.all(color: border),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: children),
    );
  }

  @override
  Widget build(BuildContext context) {
    final rushId = game.rushLineId;
    final chips = <Widget>[];
    if (rushId != null) {
      final line = game.city.lineById(rushId);
      chips.add(game.rushActive
          ? _chip(bg: const Color(0xFFC62828), children: [
              RouteBullet(label: line.bullet, color: line.color, size: 14),
              const SizedBox(width: 6),
              Text('RUSH ${_mmss(game.rushSecondsLeft)}',
                  style: TransitStyle.signage(
                      size: 10, weight: FontWeight.w900, spacing: 0.5)),
            ])
          : _chip(
              bg: Colors.white,
              border: TransitStyle.hairline,
              children: [
                RouteBullet(label: line.bullet, color: line.color, size: 14),
                const SizedBox(width: 6),
                Text('rush in ${_mmss(game.rushSecondsLeft)}',
                    style: TransitStyle.signage(
                        size: 10,
                        color: const Color(0x99000000),
                        weight: FontWeight.w700)),
              ]));
    }
    final commId = game.commissionLineId;
    if (game.commissionActive && commId != null) {
      final line = game.city.lineById(commId);
      chips.add(_chip(bg: TransitStyle.ink, children: [
        RouteBullet(label: line.bullet, color: line.color, size: 14),
        const SizedBox(width: 6),
        Text(
            '${game.commissionProgress.floor()}/'
            '${game.commissionQuota.floor()} · '
            '${_mmss(game.commissionTimeLeft)}',
            style: TransitStyle.signage(
                size: 10, weight: FontWeight.w900)),
      ]));
    }
    if (chips.isEmpty) return const SizedBox.shrink();
    return GestureDetector(
      onTap: onTap,
      child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: chips),
    );
  }
}

/// The OPS board: the rush timetable and the commission desk, expanded.
class _OpsSheet extends StatelessWidget {
  const _OpsSheet({required this.game});
  final GameState game;

  static String typeName(CommissionType t) => switch (t) {
        CommissionType.haul => 'HAUL',
        CommissionType.express => 'TURNBACK RUN',
        CommissionType.station => 'HUB SERVICE',
        CommissionType.sweep => 'CLEAN SWEEP',
        CommissionType.rushCash => 'RUSH CONTRACT',
      };

  String _offerText(GameState g) {
    final q = g.commissionQuota;
    switch (g.commissionType) {
      case CommissionType.haul:
        return 'Carry ${q.floor()} riders on this line within '
            '${_mmss(g.commissionTimeLimit)}.';
      case CommissionType.express:
        return 'Complete ${q.floor()} terminal turnbacks on this line '
            'within ${_mmss(g.commissionTimeLimit)} — speed pays.';
      case CommissionType.station:
        final sid = g.commissionStationId;
        final name = sid == null ? 'the hub' : g.city.stationById(sid).name;
        return 'Board ${q.floor()} riders at $name within '
            '${_mmss(g.commissionTimeLimit)} — the hub matters, not '
            'the rest of the line.';
      case CommissionType.sweep:
        return 'Get EVERY platform on this line under '
            '${GameState.sweepThreshold.floor()} waiting at the same '
            'moment, within ${_mmss(g.commissionTimeLimit)}.';
      case CommissionType.rushCash:
        return 'Earn \$${q.floor()} during rush-hour windows within '
            '${_mmss(g.commissionTimeLimit)} — check the timetable '
            'above before accepting.';
    }
  }

  String _progressText(GameState g) {
    final p = g.commissionProgress;
    final q = g.commissionQuota;
    final t = _mmss(g.commissionTimeLeft);
    switch (g.commissionType) {
      case CommissionType.haul:
        return '${p.floor()} / ${q.floor()} riders · $t left';
      case CommissionType.express:
        return '${p.floor()} / ${q.floor()} turnbacks · $t left';
      case CommissionType.station:
        return '${p.floor()} / ${q.floor()} boarded at the hub · $t left';
      case CommissionType.sweep:
        return '${p.floor()} / ${q.floor()} platforms clear · $t left';
      case CommissionType.rushCash:
        return '\$${p.floor()} / \$${q.floor()} in rush · $t left';
    }
  }

  @override
  Widget build(BuildContext context) {
    final commId = game.commissionLineId;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _SheetSign(
              game: game,
              title: Text('OPERATIONS',
                  style: TransitStyle.signage(size: 16, spacing: 1)),
            ),
            const SizedBox(height: 12),
            Flexible(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'RUSH HOUR — ×${GameState.rushMult.toStringAsFixed(1)} riders for '
                      '${GameState.rushWindow.toStringAsFixed(0)}s. Pays in proportion '
                      'to the spare capacity you have built on the line.',
                      style: TransitStyle.signage(
                          size: 10,
                          color: const Color(0x99000000),
                          weight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                    DataPanel(
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: [
                          for (var k = 0; k < 4; k++) ...[
                            if (k > 0)
                              Container(
                                  height: 1, color: TransitStyle.hairline),
                            Builder(builder: (context) {
                              final id = game.rushLineIdForCycle(k);
                              if (id == null) return const SizedBox.shrink();
                              final line = game.city.lineById(id);
                              final active = k == 0 && game.rushActive;
                              final when = game.secondsUntilRushStart(k);
                              return Padding(
                                padding: const EdgeInsets.fromLTRB(
                                    12, 8, 12, 8),
                                child: Row(
                                  children: [
                                    RouteBullet(
                                        label: line.bullet,
                                        color: line.color,
                                        size: 20),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Text(line.name.toUpperCase(),
                                          style: TransitStyle.signage(
                                              size: 12,
                                              color: TransitStyle.ink,
                                              weight: FontWeight.w900,
                                              spacing: 0.5)),
                                    ),
                                    Text(
                                        active
                                            ? 'RUNNING · ${_mmss(game.rushSecondsLeft)}'
                                            : 'in ${_mmss(when)}',
                                        style: TransitStyle.signage(
                                            size: 11,
                                            color: active
                                                ? const Color(0xFFC62828)
                                                : const Color(0x99000000),
                                            weight: FontWeight.w800)),
                                  ],
                                ),
                              );
                            }),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'COMMISSIONS — city hall pays about double the fares for '
                      'directed work. No penalty for passing or failing. '
                      'Completed: ${game.commissionsDone}.',
                      style: TransitStyle.signage(
                          size: 10,
                          color: const Color(0x99000000),
                          weight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                    if (commId != null)
                      DataPanel(
                        child: Builder(builder: (context) {
                          final line = game.city.lineById(commId);
                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Row(
                                children: [
                                  RouteBullet(
                                      label: line.bullet,
                                      color: line.color,
                                      size: 22),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                            typeName(game.commissionType),
                                            style: TransitStyle.signage(
                                                size: 13,
                                                color: TransitStyle.ink,
                                                weight: FontWeight.w900,
                                                spacing: 1)),
                                        Text(line.name.toUpperCase(),
                                            style: TransitStyle.signage(
                                                size: 10,
                                                color:
                                                    const Color(0x99000000),
                                                weight: FontWeight.w700,
                                                spacing: 0.5)),
                                      ],
                                    ),
                                  ),
                                  Text(
                                      '\$${game.commissionReward.toStringAsFixed(0)}',
                                      style: TransitStyle.signage(
                                          size: 13,
                                          color: TransitStyle.ink,
                                          weight: FontWeight.w900)),
                                ],
                              ),
                              const SizedBox(height: 8),
                              if (game.commissionActive) ...[
                                LinearProgressIndicator(
                                  value: (game.commissionProgress /
                                          game.commissionQuota)
                                      .clamp(0.0, 1.0),
                                  minHeight: 5,
                                  color: TransitStyle.ink,
                                  backgroundColor: const Color(0x1A000000),
                                ),
                                const SizedBox(height: 6),
                                Text(_progressText(game),
                                    style: TransitStyle.signage(
                                        size: 11,
                                        color: const Color(0x99000000),
                                        weight: FontWeight.w700)),
                              ] else ...[
                                Text(_offerText(game),
                                    style: TransitStyle.signage(
                                        size: 11,
                                        color: const Color(0x99000000),
                                        weight: FontWeight.w700)),
                                const SizedBox(height: 10),
                                Row(
                                  children: [
                                    Expanded(
                                      child: FilledButton(
                                        onPressed: game.acceptCommission,
                                        child: const Text('ACCEPT'),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    OutlinedButton(
                                      onPressed: game.skipCommission,
                                      child: const Text('SKIP'),
                                    ),
                                  ],
                                ),
                              ],
                            ],
                          );
                        }),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The GOALS board: the whole ladder, done → current → ahead, the
/// commendation bank, and the move-on button when a city completes.
class _GoalsSheet extends StatelessWidget {
  const _GoalsSheet({required this.game, required this.onMoveOn});
  final GameState game;
  final VoidCallback onMoveOn;

  @override
  Widget build(BuildContext context) {
    final goals = game.goals;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _SheetSign(
              game: game,
              title: Row(
                children: [
                  Expanded(
                    child: Text('CITY GOALS · ${game.city.name.toUpperCase()}',
                        style: TransitStyle.signage(size: 15, spacing: 1)),
                  ),
                  Text('×${game.goalMult.toStringAsFixed(1)}',
                      style: TransitStyle.signage(
                          size: 13,
                          color: Colors.white70,
                          weight: FontWeight.w800)),
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (game.canMoveOn) ...[
              FilledButton(
                onPressed: onMoveOn,
                child: Text('OPEN ${game.nextCity!.name.toUpperCase()}'),
              ),
              const SizedBox(height: 8),
            ],
            Flexible(
              child: SingleChildScrollView(
                child: DataPanel(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (var i = 0; i < goals.length; i++) ...[
                        if (i > 0)
                          Container(height: 1, color: TransitStyle.hairline),
                        Builder(builder: (context) {
                          final goal = goals[i];
                          final done = i < game.goalsDone;
                          final current = i == game.goalsDone;
                          return Padding(
                            padding:
                                const EdgeInsets.fromLTRB(12, 8, 12, 8),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Icon(
                                        done
                                            ? Icons.check_box
                                            : (current
                                                ? Icons.indeterminate_check_box
                                                : Icons
                                                    .check_box_outline_blank),
                                        size: 14,
                                        color: done || current
                                            ? TransitStyle.ink
                                            : const Color(0x44000000)),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(goal.name,
                                          style: TransitStyle.signage(
                                              size: 12,
                                              color: done || current
                                                  ? TransitStyle.ink
                                                  : const Color(0x66000000),
                                              weight: FontWeight.w900,
                                              spacing: 0.5)),
                                    ),
                                    Text('×${goal.reward.toStringAsFixed(2)}',
                                        style: TransitStyle.signage(
                                            size: 11,
                                            color: const Color(0x99000000),
                                            weight: FontWeight.w700)),
                                  ],
                                ),
                                if (current) ...[
                                  const SizedBox(height: 6),
                                  LinearProgressIndicator(
                                    value: game.goalProgress,
                                    minHeight: 4,
                                    color: TransitStyle.ink,
                                    backgroundColor: const Color(0x1A000000),
                                  ),
                                ],
                              ],
                            ),
                          );
                        }),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}


/// Square-cornered dashboard tab strip: 1px ink border, active tab inverts
/// to the sign-bar black — same visual language as the data panels.
class _TabBar extends StatelessWidget {
  const _TabBar(
      {required this.tabs,
      required this.selected,
      required this.onSelect,
      this.badges});

  final List<String> tabs;
  final int selected;
  final void Function(int) onSelect;

  /// One flag per tab: true draws an attention dot (an offer waiting, a
  /// city ready to open).
  final List<bool>? badges;

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
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        tabs[i],
                        style: TransitStyle.signage(
                            size: 11,
                            color:
                                i == selected ? Colors.white : TransitStyle.ink,
                            weight: FontWeight.w900,
                            spacing: 1.5),
                      ),
                      if (badges != null && i < badges!.length && badges![i])
                        Container(
                          margin: const EdgeInsets.only(left: 5),
                          width: 6,
                          height: 6,
                          decoration: const BoxDecoration(
                            color: Color(0xFFEE352E),
                            shape: BoxShape.circle,
                          ),
                        ),
                    ],
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

/// The header is a slim station sign: the bullets you run, cash, and the
/// live rates — compact so the map below keeps the screen.
class _Header extends StatelessWidget {
  const _Header(
      {required this.game,
      required this.muted,
      required this.onToggleMute,
      required this.timeScale,
      required this.onToggleSpeed});
  final GameState game;
  final bool muted;
  final VoidCallback onToggleMute;
  final double timeScale;
  final VoidCallback onToggleSpeed;

  @override
  Widget build(BuildContext context) {
    return StationSign(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // 24 lines can outgrow the bar — the bullet strip scrolls.
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final line in game.city.lines)
                        if (game.isUnlocked(line.id))
                          Padding(
                            padding: const EdgeInsets.only(right: 5),
                            child: RouteBullet(
                                label: line.bullet,
                                color: line.color,
                                size: 16),
                          ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text('METRO MAGNATE',
                  style: TransitStyle.signage(size: 11, spacing: 2.5)),
              const SizedBox(width: 6),
              Text('b$kBuildNumber',
                  style: TransitStyle.signage(
                      size: 9,
                      color: Colors.white38,
                      weight: FontWeight.w700)),
              const SizedBox(width: 6),
              GestureDetector(
                onTap: onToggleMute,
                child: Icon(muted ? Icons.volume_off : Icons.volume_up,
                    size: 16, color: Colors.white70),
              ),
              const SizedBox(width: 8),
              // Playtest fast-forward — amber while engaged.
              GestureDetector(
                onTap: onToggleSpeed,
                child: Row(
                  children: [
                    Icon(Icons.fast_forward,
                        size: 16,
                        color: timeScale > 1
                            ? const Color(0xFFFCCC0A)
                            : Colors.white70),
                    if (timeScale > 1)
                      Text('10×',
                          style: TransitStyle.signage(
                              size: 10,
                              color: const Color(0xFFFCCC0A),
                              weight: FontWeight.w900)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('\$${game.cash.toStringAsFixed(0)}',
                  style: TransitStyle.signage(
                      size: 26, weight: FontWeight.w900)),
              const Spacer(),
              Text(
                '≈ \$${game.avgRate.toStringAsFixed(1)}/sec\n'
                'fare \$${game.currentFare.toStringAsFixed(2)} · '
                '${game.totalRiders.toStringAsFixed(0)} riders',
                textAlign: TextAlign.right,
                style: TransitStyle.signage(
                    size: 10, color: Colors.white70, weight: FontWeight.w600),
              ),
            ],
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
                    ? () {
                        // Close the sheet so the opening cinema is visible.
                        if (game.buyLine(line.id)) {
                          Navigator.of(context).maybePop();
                        }
                      }
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
            _SheetSign(
              game: game,
              title: Row(
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
            Flexible(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
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
                          Container(height: 1, color: TransitStyle.hairline),
                          _UpgradeRow(
                            name: 'NEW SUBWAY CARS',
                            level: game.trainsetLevelOf(id),
                            blurb: "+8% ridership on this line's stations",
                            cost: game.nextTrainsetCost(id),
                            canAfford: game.cash >= game.nextTrainsetCost(id),
                            onBuy: () => game.buyTrainset(id),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'STATION WORKS · ALL ${line.stationIds.length} STOPS — '
                      'levels the LOWEST stations first; ▲ sets your priority.',
                      style: TransitStyle.signage(
                          size: 10,
                          color: const Color(0x99000000),
                          weight: FontWeight.w800,
                          spacing: 1),
                    ),
                    const SizedBox(height: 6),
                    DataPanel(
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: [
                          for (var i = 0;
                              i < game.stationPriority.length;
                              i++) ...[
                            if (i > 0)
                              Container(
                                  height: 1, color: TransitStyle.hairline),
                            _BulkRow(
                                game: game,
                                lineId: id,
                                type: game.stationPriority[i],
                                isFirst: i == 0),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One bulk STATION WORKS row: brings the line's lowest-tier stations of
/// this work up one level (never past the pack — the tier rule), shows
/// what that costs, and carries the priority ▲.
class _BulkRow extends StatelessWidget {
  const _BulkRow(
      {required this.game,
      required this.lineId,
      required this.type,
      required this.isFirst});

  final GameState game;
  final String lineId;
  final String type;
  final bool isFirst;

  @override
  Widget build(BuildContext context) {
    final def = GameState.stationUpgradeById(type);
    final minL = game.minStationLevel(lineId, type);
    final maxed = minL >= GameState.foodMax;
    final count = maxed ? 0 : game.stationsAtMin(lineId, type);
    final cost = game.stationTierCost(lineId, type);
    final isNext = game.nextPlannedType(lineId) == type;
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 6, 10, 6),
      child: Row(
        children: [
          IconButton(
            onPressed: isFirst ? null : () => game.raisePriority(type),
            icon: const Icon(Icons.arrow_upward, size: 16),
            color: TransitStyle.ink,
            disabledColor: const Color(0x33000000),
            visualDensity: VisualDensity.compact,
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(isNext ? '${def.name} · NEXT' : def.name,
                    style: TransitStyle.signage(
                        size: 12,
                        color: TransitStyle.ink,
                        weight: FontWeight.w900,
                        spacing: 0.5)),
                Text(
                  maxed
                      ? 'every stop maxed'
                      : 'tier $minL → ${minL + 1} · $count stop'
                          '${count == 1 ? '' : 's'} to raise',
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
              : OutlinedButton(
                  onPressed: game.cash >= game.stationWorkCost(type, minL)
                      ? () => game.buyStationTier(lineId, type)
                      : null,
                  child: Text('\$${cost.toStringAsFixed(0)}'),
                ),
        ],
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

/// The per-station sheet: platform data + this station's own works —
/// food court (concessions + ridership), fare gates (income per rider),
/// platform works (faster boarding here).
class _StationSheet extends StatelessWidget {
  const _StationSheet({required this.game, required this.station});

  final GameState game;
  final StationDef station;

  @override
  Widget build(BuildContext context) {
    final id = station.id;
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
            _SheetSign(
              game: game,
              title: Row(
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
                          '${(station.demand * GameState.demandScale * game.demandMultAt(id) * 60).toStringAsFixed(0)}/min'),
                  _Stat(
                      label: 'WAITING',
                      value: game.upServed(id) && game.downServed(id)
                          ? '${game.waitingUp[id]!.floor()}/'
                              '${game.waitingDown[id]!.floor()}'
                          : game.waitingAt(id).floor().toString()),
                  _Stat(
                      label: '\$/RIDER',
                      value:
                          '\$${game.incomePerRiderAt(id).toStringAsFixed(2)}'),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Flexible(
              child: SingleChildScrollView(
                child: DataPanel(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (var i = 0;
                          i < GameState.stationUpgrades.length;
                          i++) ...[
                        if (i > 0)
                          Container(height: 1, color: TransitStyle.hairline),
                        Builder(builder: (context) {
                          final def = GameState.stationUpgrades[i];
                          final level = game.stationWorkLevel(def.id, id);
                          final cost = game.stationWorkCost(def.id, level);
                          return _UpgradeRow(
                            name: def.name,
                            level: level,
                            maxLevel: GameState.foodMax,
                            blurb: def.blurb,
                            cost: cost,
                            canAfford: game.cash >= cost,
                            onBuy: () => game.buyStationWork(def.id, id),
                          );
                        }),
                      ],
                    ],
                  ),
                ),
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
