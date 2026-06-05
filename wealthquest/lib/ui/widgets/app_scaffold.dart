import 'package:flutter/material.dart';

import '../../state/game_controller.dart';
import 'day_summary_dialog.dart';
import 'margin_call_sheet.dart';
import 'swipe_back.dart';

/// Advance the simulation one month and show the recap. Available from the
/// phone home and inside every app. A sustained cash shortfall follows the
/// recap with a blocking margin-call liquidation.
Future<void> nextMonth(BuildContext context, GameController game) async {
  final r = game.advanceDay();
  if (!context.mounted) return;
  await showDaySummary(context, game, r);
  if (r.marginCall && context.mounted) {
    await showMarginCall(context, game);
  }
}

/// Fast-forward [n] months (each one really simulated) and show one combined
/// recap. Stops early — and surfaces the margin call — if you run out of cash.
Future<void> fastForward(BuildContext context, GameController game, int n) async {
  final out = game.advanceMonths(n);
  if (!context.mounted) return;
  await showDaySummary(context, game, out.result, monthsCovered: out.months);
  if (out.result.marginCall && context.mounted) {
    await showMarginCall(context, game);
  }
}

/// The bottom controls shared by the home screen and every app: advance one
/// month, or fast-forward 6 / 12 months at once.
Widget advanceControls(BuildContext context, GameController game) {
  return FittedBox(
    fit: BoxFit.scaleDown,
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        FloatingActionButton.extended(
          heroTag: null,
          onPressed: () => nextMonth(context, game),
          icon: const Icon(Icons.skip_next),
          label: const Text('Next Month'),
        ),
        const SizedBox(width: 8),
        _FfButton(label: '6 mo', onPressed: () => fastForward(context, game, 6)),
        const SizedBox(width: 8),
        _FfButton(label: '12 mo', onPressed: () => fastForward(context, game, 12)),
      ],
    ),
  );
}

class _FfButton extends StatelessWidget {
  const _FfButton({required this.label, required this.onPressed});

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return FilledButton.tonal(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      child: Text(label),
    );
  }
}

/// A full-screen "app" launched from the phone home: an app bar (with optional
/// [bottom] like a TabBar), a body that rebuilds on game changes, a persistent
/// "Next Month" button, and swipe-to-go-home.
class AppScaffold extends StatelessWidget {
  const AppScaffold({
    super.key,
    required this.game,
    required this.title,
    required this.body,
    this.bottom,
  });

  final GameController game;
  final String title;
  final WidgetBuilder body;
  final PreferredSizeWidget? bottom;

  @override
  Widget build(BuildContext context) {
    return SwipeBack(
      child: Scaffold(
        appBar: AppBar(title: Text(title), bottom: bottom),
        body: ListenableBuilder(
          listenable: game,
          builder: (context, _) => body(context),
        ),
        floatingActionButton: advanceControls(context, game),
        floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
      ),
    );
  }
}
