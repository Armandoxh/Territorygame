import 'package:flutter/material.dart';

import '../data/properties.dart';
import '../state/game_controller.dart';
import '../util/format.dart';
import 'widgets/ui_helpers.dart';

/// "Credit" — your credit score and what it's worth. The score is derived from
/// how you actually play (history, wealth, on-time bills, debt, bankruptcies)
/// and prices your mortgage, so good behavior pays off and a bankruptcy stings
/// for years.
class CreditBody extends StatelessWidget {
  const CreditBody({super.key, required this.game});

  final GameController game;

  Color _scoreColor(int s) {
    if (s >= 740) return kGain;
    if (s >= 670) return const Color(0xFFB8860B);
    if (s >= 580) return const Color(0xFFEF6C00);
    return kLoss;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final s = game.creditScore;
    final color = _scoreColor(s);
    final frac = ((s - 300) / 550).clamp(0.0, 1.0);
    // A representative 30-year rate at this score.
    final rate = game.effectiveMortgageRate(Properties.mortgages.first);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              children: [
                Text('Credit score', style: theme.textTheme.titleMedium),
                const SizedBox(height: 4),
                Text('$s',
                    style: theme.textTheme.displayMedium
                        ?.copyWith(fontWeight: FontWeight.bold, color: color)),
                Text(game.creditBand,
                    style: theme.textTheme.titleMedium?.copyWith(color: color)),
                const SizedBox(height: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: LinearProgressIndicator(
                    value: frac,
                    minHeight: 10,
                    backgroundColor: theme.colorScheme.surfaceContainerHighest,
                    valueColor: AlwaysStoppedAnimation(color),
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('300',
                        style: theme.textTheme.labelSmall
                            ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                    Text('850',
                        style: theme.textTheme.labelSmall
                            ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('What it buys you', style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                _row(theme, 'Your 30-yr mortgage rate',
                    '${(rate * 100).toStringAsFixed(1)}%'),
                _row(
                    theme,
                    'Credit adjustment',
                    '${game.creditRateAdjustment >= 0 ? '+' : ''}'
                        '${(game.creditRateAdjustment * 100).toStringAsFixed(1)}%'),
                if (game.hasBankruptcyMark)
                  _row(theme, 'Bankruptcy on record',
                      '${(game.bankruptcyMonthsLeft / 12).ceil()} yrs left',
                      color: kLoss),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        _Factors(game: game),
      ],
    );
  }

  Widget _row(ThemeData theme, String k, String v, {Color? color}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
                child: Text(k,
                    style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant))),
            Text(v,
                style: theme.textTheme.bodyMedium
                    ?.copyWith(fontWeight: FontWeight.w700, color: color)),
          ],
        ),
      );
}

class _Factors extends StatelessWidget {
  const _Factors({required this.game});
  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final good = <String>[];
    final bad = <String>[];
    (game.ageYears - 18 >= 5 ? good : bad)
        .add('Length of credit history');
    (game.netWorth > 50000 ? good : bad).add('Assets & net worth');
    (game.monthsCashNegative == 0 ? good : bad).add('On-time bills (no overdrafts)');
    (game.debt <= 0 ? good : bad).add('Low revolving debt');
    if (game.hasBankruptcyMark) bad.add('Recent bankruptcy');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Score factors', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            for (final g in good)
              _line(theme, g, true),
            for (final b in bad)
              _line(theme, b, false),
          ],
        ),
      ),
    );
  }

  Widget _line(ThemeData theme, String text, bool positive) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          children: [
            Text(positive ? '▲' : '▼',
                style: TextStyle(color: positive ? kGain : kLoss)),
            const SizedBox(width: 8),
            Expanded(child: Text(text, style: theme.textTheme.bodyMedium)),
          ],
        ),
      );
}
