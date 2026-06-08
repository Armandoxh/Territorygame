import 'package:flutter/material.dart';

import '../../state/game_controller.dart';
import 'crisis_sheet.dart';
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
  if (game.pendingCrisis != null && context.mounted) {
    await showCrisis(context, game);
  }
}

/// Fast-forward [n] months. Each month is really simulated; if a decision or
/// margin call interrupts, we pause to handle it inline and then carry on so
/// the full [n] months actually elapse (a "6 mo" click is six months of
/// salary, not "until the first event"). One combined recap at the end.
Future<void> fastForward(BuildContext context, GameController game, int n) async {
  var remaining = n;
  var income = 0.0,
      expenses = 0.0,
      interest = 0.0,
      dividends = 0.0,
      rent = 0.0,
      mortgage = 0.0,
      fee = 0.0;
  final events = <String>[];
  final netWorthBefore = game.netWorth;
  final cashBefore = game.cash;

  while (remaining > 0) {
    final out = game.advanceMonths(remaining);
    final r = out.result;
    income += r.income;
    expenses += r.expenses;
    interest += r.interest;
    dividends += r.dividends;
    rent += r.rent;
    mortgage += r.mortgage;
    fee += r.overdraftFee;
    events.addAll(r.events);
    remaining -= out.months;
    if (out.months == 0) break; // safety: never spin in place

    // Resolve whatever halted the run, then continue the remaining months.
    if (r.marginCall) {
      if (!context.mounted) return;
      await showMarginCall(context, game);
    }
    if (game.pendingCrisis != null) {
      if (!context.mounted) return;
      await showCrisis(context, game);
    }
  }

  final agg = DayResult(
    income: income,
    expenses: expenses,
    interest: interest,
    dividends: dividends,
    rent: rent,
    mortgage: mortgage,
    overdraftFee: fee,
    netWorthBefore: netWorthBefore,
    netWorthAfter: game.netWorth,
    cashBefore: cashBefore,
    cashAfter: game.cash,
    events: events,
  );
  if (!context.mounted) return;
  await showDaySummary(context, game, agg, monthsCovered: n - remaining);
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
