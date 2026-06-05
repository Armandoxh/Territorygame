import 'package:flutter/material.dart';

import '../../state/game_controller.dart';
import '../../util/format.dart';
import 'ui_helpers.dart';

/// The end-of-month recap — a quick, visual snapshot rather than a wall of
/// text: two hero stats (net worth + cash, each with its move), the month's
/// cash flow as +/- chips, and a few highlights.
Future<void> showDaySummary(
  BuildContext context,
  GameController game,
  DayResult r,
) {
  return showDialog<void>(
    context: context,
    builder: (context) {
      final theme = Theme.of(context);

      // Cash-flow items become compact chips — only the ones that happened.
      final flow = <_Flow>[
        _Flow('Pay', r.income, true),
        _Flow('Living', r.expenses, false),
        if (r.interest > 0.005) _Flow('Interest', r.interest, true),
        if (r.dividends > 0.005) _Flow('Dividends', r.dividends, true),
        if (r.rent > 0.005) _Flow('Rent', r.rent, true),
        if (r.mortgage > 0.005) _Flow('Mortgage', r.mortgage, false),
        if (r.overdraftFee > 0.005) _Flow('Fee', r.overdraftFee, false),
      ];

      // Portfolio call-outs + events, already emoji-led; cap so it stays short.
      final highlights = [...r.portfolioNotes, ...r.events];
      const maxHighlights = 5;
      final shown = highlights.take(maxHighlights).toList();
      final extra = highlights.length - shown.length;

      return AlertDialog(
        contentPadding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Text('Month ${game.day}  ·  Age ${game.ageYears}',
                    style: theme.textTheme.labelMedium
                        ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: _HeroStat(
                      label: 'Net worth',
                      value: moneyWhole(r.netWorthAfter),
                      delta: r.netWorthDelta,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _HeroStat(
                      label: 'Cash',
                      value: moneyWhole(r.cashAfter),
                      delta: r.cashDelta,
                      negative: r.cashAfter < 0,
                    ),
                  ),
                ],
              ),
              if (r.cashAfter < 0) ...[
                const SizedBox(height: 12),
                _Banner(
                  text: r.marginCall
                      ? 'Margin call — liquidate to get back above \$0.'
                      : 'Cash is negative — top it up before it costs you.',
                ),
              ],
              const SizedBox(height: 16),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [for (final f in flow) _FlowChip(flow: f)],
              ),
              if (shown.isNotEmpty) ...[
                const SizedBox(height: 16),
                const Divider(height: 1),
                const SizedBox(height: 10),
                for (final h in shown)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Text(h,
                        style: theme.textTheme.bodySmall, maxLines: 2),
                  ),
                if (extra > 0)
                  Text('+$extra more',
                      style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant)),
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

class _Flow {
  final String label;
  final double amount;
  final bool positive;
  _Flow(this.label, this.amount, this.positive);
}

/// One big stat: label, value, and a colored ▲/▼ move for the month.
class _HeroStat extends StatelessWidget {
  const _HeroStat({
    required this.label,
    required this.value,
    required this.delta,
    this.negative = false,
  });

  final String label;
  final String value;
  final double delta;
  final bool negative;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: theme.textTheme.labelSmall
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        const SizedBox(height: 2),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            value,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.bold,
              color: negative ? kLoss : null,
            ),
          ),
        ),
        const SizedBox(height: 2),
        Row(
          children: [
            Icon(delta >= 0 ? Icons.arrow_drop_up : Icons.arrow_drop_down,
                size: 18, color: gainColor(delta)),
            Text(money(delta.abs()),
                style: theme.textTheme.bodySmall?.copyWith(
                    color: gainColor(delta), fontWeight: FontWeight.w600)),
          ],
        ),
      ],
    );
  }
}

/// A compact signed pill, e.g. green "+$1,300 Pay" or red "−$1,181 Living".
class _FlowChip extends StatelessWidget {
  const _FlowChip({required this.flow});
  final _Flow flow;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = flow.positive ? kGain : kLoss;
    final sign = flow.positive ? '+' : '−';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        '$sign${moneyWhole(flow.amount)}  ${flow.label}',
        style: theme.textTheme.labelMedium
            ?.copyWith(color: color, fontWeight: FontWeight.w600),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: kLoss.withOpacity(0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: kLoss.withOpacity(0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded, size: 16, color: kLoss),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text,
                style: theme.textTheme.bodySmall?.copyWith(color: kLoss)),
          ),
        ],
      ),
    );
  }
}
