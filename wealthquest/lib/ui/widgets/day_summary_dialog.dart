import 'package:flutter/material.dart';

import '../../state/game_controller.dart';
import '../../util/format.dart';
import 'ui_helpers.dart';

/// The end-of-month recap, laid out like a clean profit-and-loss statement:
/// money in and money out grouped into labeled sections with subtotals, a bold
/// net line, then the running net-worth and cash balances.
Future<void> showDaySummary(
  BuildContext context,
  GameController game,
  DayResult r,
) {
  return showDialog<void>(
    context: context,
    builder: (context) {
      final theme = Theme.of(context);

      // Inflows (earnings) and outflows (costs) as line items.
      final income = <_Line>[
        _Line('Salary', r.income),
        if (r.interest > 0.005) _Line('Interest', r.interest),
        if (r.dividends > 0.005) _Line('Dividends & coupons', r.dividends),
        if (r.rent > 0.005) _Line('Rental income', r.rent),
      ];
      final expenses = <_Line>[
        _Line('Living expenses', r.expenses),
        if (r.mortgage > 0.005) _Line('Mortgage', r.mortgage),
        if (r.overdraftFee > 0.005) _Line('Overdraft fee', r.overdraftFee),
      ];
      final totalIn = income.fold(0.0, (s, l) => s + l.amount);
      final totalOut = expenses.fold(0.0, (s, l) => s + l.amount);
      final net = totalIn - totalOut;

      final highlights = [...r.portfolioNotes, ...r.events];
      final shown = highlights.take(4).toList();
      final extra = highlights.length - shown.length;

      return AlertDialog(
        contentPadding: const EdgeInsets.fromLTRB(22, 18, 22, 8),
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
              const SizedBox(height: 16),

              _sectionHeader(theme, 'Money in', kGain),
              for (final l in income)
                _lineRow(theme, l.label, l.amount, kGain, positive: true),
              _subtotal(theme, 'Total in', totalIn, kGain, positive: true),

              const SizedBox(height: 14),

              _sectionHeader(theme, 'Money out', kLoss),
              for (final l in expenses)
                _lineRow(theme, l.label, l.amount, kLoss, positive: false),
              _subtotal(theme, 'Total out', totalOut, kLoss, positive: false),

              const SizedBox(height: 10),
              Container(height: 2, color: theme.colorScheme.outlineVariant),
              const SizedBox(height: 8),
              _netRow(theme, net),

              const SizedBox(height: 16),
              _balanceRow(theme, 'Net worth', r.netWorthAfter, r.netWorthDelta),
              const SizedBox(height: 6),
              _balanceRow(theme, 'Cash', r.cashAfter, r.cashDelta,
                  negative: r.cashAfter < 0),

              if (r.cashAfter < 0) ...[
                const SizedBox(height: 12),
                _banner(
                  theme,
                  r.marginCall
                      ? 'Margin call — liquidate to get back above \$0.'
                      : 'Cash is negative — top it up before it costs you.',
                ),
              ],

              if (shown.isNotEmpty) ...[
                const SizedBox(height: 14),
                Divider(height: 1, color: theme.colorScheme.outlineVariant),
                const SizedBox(height: 10),
                for (final h in shown)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child:
                        Text(h, style: theme.textTheme.bodySmall, maxLines: 2),
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

class _Line {
  final String label;
  final double amount;
  _Line(this.label, this.amount);
}

/// A small colored section heading, e.g. "MONEY IN".
Widget _sectionHeader(ThemeData theme, String title, Color color) {
  return Padding(
    padding: const EdgeInsets.only(bottom: 4),
    child: Text(
      title.toUpperCase(),
      style: theme.textTheme.labelSmall?.copyWith(
        color: color,
        fontWeight: FontWeight.w800,
        letterSpacing: 1.1,
      ),
    ),
  );
}

/// An indented line item: label on the left, signed amount on the right.
Widget _lineRow(ThemeData theme, String label, double amount, Color color,
    {required bool positive}) {
  return Padding(
    padding: const EdgeInsets.only(left: 4, top: 3, bottom: 3),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(child: Text(label, style: theme.textTheme.bodyMedium)),
        Text('${positive ? '+' : '−'}${moneyWhole(amount)}',
            style: theme.textTheme.bodyMedium?.copyWith(color: color)),
      ],
    ),
  );
}

/// A bold subtotal with a thin rule above it.
Widget _subtotal(ThemeData theme, String label, double amount, Color color,
    {required bool positive}) {
  return Column(
    children: [
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Divider(height: 1, color: theme.colorScheme.outlineVariant),
      ),
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w700)),
          Text('${positive ? '+' : '−'}${moneyWhole(amount)}',
              style: theme.textTheme.bodyMedium
                  ?.copyWith(color: color, fontWeight: FontWeight.w700)),
        ],
      ),
    ],
  );
}

/// The headline result for the month.
Widget _netRow(ThemeData theme, double net) {
  final color = gainColor(net);
  return Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text('Net this month',
          style:
              theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
      Text('${net >= 0 ? '+' : '−'}${moneyWhole(net.abs())}',
          style: theme.textTheme.titleMedium
              ?.copyWith(color: color, fontWeight: FontWeight.bold)),
    ],
  );
}

/// A running balance (net worth / cash) with its month-over-month move.
Widget _balanceRow(ThemeData theme, String label, double value, double delta,
    {bool negative = false}) {
  return Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(label,
          style: theme.textTheme.bodyMedium
              ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
      Row(
        children: [
          Text(moneyWhole(value),
              style: theme.textTheme.bodyLarge?.copyWith(
                  fontWeight: FontWeight.bold, color: negative ? kLoss : null)),
          const SizedBox(width: 8),
          Icon(delta >= 0 ? Icons.arrow_drop_up : Icons.arrow_drop_down,
              size: 18, color: gainColor(delta)),
          Text(money(delta.abs()),
              style: theme.textTheme.labelMedium?.copyWith(
                  color: gainColor(delta), fontWeight: FontWeight.w600)),
        ],
      ),
    ],
  );
}

Widget _banner(ThemeData theme, String text) {
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
