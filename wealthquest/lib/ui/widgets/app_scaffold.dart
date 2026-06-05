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
        floatingActionButton: FloatingActionButton.extended(
          heroTag: null,
          onPressed: () => nextMonth(context, game),
          icon: const Icon(Icons.skip_next),
          label: const Text('Next Month'),
        ),
        floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
      ),
    );
  }
}
