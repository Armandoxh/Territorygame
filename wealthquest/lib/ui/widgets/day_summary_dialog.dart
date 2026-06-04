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
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _row(theme, 'Salary', money(r.income), kGain),
            _row(theme, 'Living expenses', '-${money(r.expenses)}', kLoss),
            if (r.interest > 0.005)
              _row(theme, 'Interest earned', money(r.interest), kGain),
            if (r.dividends > 0.005)
              _row(theme, 'Dividends & coupons', money(r.dividends), kGain),
            if (r.mortgage > 0.005)
              _row(theme, 'Mortgage paid', '-${money(r.mortgage)}', kLoss),
            const Divider(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Net worth', style: theme.textTheme.titleMedium),
                Text(
                  moneyWhole(r.netWorthAfter),
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Align(
              alignment: Alignment.centerRight,
              child: Text(
                '${r.netWorthDelta >= 0 ? '▲' : '▼'} ${money(r.netWorthDelta.abs())} this month',
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: gainColor(r.netWorthDelta)),
              ),
            ),
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
