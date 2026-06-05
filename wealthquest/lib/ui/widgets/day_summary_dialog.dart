import 'package:flutter/material.dart';

import '../../state/game_controller.dart';
import '../../util/format.dart';
import 'ui_helpers.dart';

Future<void> showDaySummary(
  BuildContext context,
  GameController game,
  DayResult r,
) {
  return showDialog<void>(
    context: context,
    builder: (context) {
      final theme = Theme.of(context);
      return AlertDialog(
        title: Text('Month ${game.day} • Age ${game.ageYears}'),
        content: SingleChildScrollView(
          child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _row(theme, 'Salary', money(r.income), kGain),
            _row(theme, 'Living expenses', '-${money(r.expenses)}', kLoss),
            if (r.interest > 0.005)
              _row(theme, 'Interest earned', money(r.interest), kGain),
            if (r.dividends > 0.005)
              _row(theme, 'Dividends & coupons', money(r.dividends), kGain),
            if (r.rent > 0.005)
              _row(theme, 'Rent collected', money(r.rent), kGain),
            if (r.mortgage > 0.005)
              _row(theme, 'Mortgage paid', '-${money(r.mortgage)}', kLoss),
            if (r.overdraftFee > 0.005)
              _row(theme, 'Overdraft fee', '-${money(r.overdraftFee)}', kLoss),
            const Divider(height: 24),
            _bigRow(theme, 'Net worth', moneyWhole(r.netWorthAfter),
                r.netWorthDelta),
            const SizedBox(height: 8),
            _bigRow(theme, 'Cash', moneyWhole(r.cashAfter), r.cashDelta,
                valueColor: r.cashAfter < 0 ? kLoss : null),
            if (r.cashAfter < 0)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  r.marginCall
                      ? 'You must liquidate to get back above \$0.'
                      : 'Cash is negative — top it up before it costs you.',
                  style: theme.textTheme.bodySmall?.copyWith(color: kLoss),
                ),
              ),
            if (r.portfolioNotes.isNotEmpty) ...[
              const SizedBox(height: 12),
              for (final n in r.portfolioNotes)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(n, style: theme.textTheme.bodySmall),
                ),
            ],
            if (r.events.isNotEmpty) ...[
              const SizedBox(height: 12),
              for (final e in r.events)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('• $e', style: theme.textTheme.bodySmall),
                ),
            ],
          ],
        ),
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Continue'),
          ),
        ],
      );
    },
  );
}

/// A headline figure (Net worth / Cash) with a small "this month" delta line.
Widget _bigRow(ThemeData theme, String label, String value, double delta,
    {Color? valueColor}) {
  return Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: theme.textTheme.titleMedium),
          Text(
            value,
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.bold, color: valueColor),
          ),
        ],
      ),
      const SizedBox(height: 2),
      Align(
        alignment: Alignment.centerRight,
        child: Text(
          '${delta >= 0 ? '▲' : '▼'} ${money(delta.abs())} this month',
          style: theme.textTheme.bodySmall?.copyWith(color: gainColor(delta)),
        ),
      ),
    ],
  );
}

Widget _row(ThemeData theme, String label, String value, Color color) {
  return Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: theme.textTheme.bodyMedium),
        Text(value, style: theme.textTheme.bodyMedium?.copyWith(color: color)),
      ],
    ),
  );
}
