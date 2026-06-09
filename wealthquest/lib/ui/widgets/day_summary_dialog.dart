import 'package:flutter/material.dart';

import '../../state/game_controller.dart';
import '../../util/format.dart';
import 'ui_helpers.dart';

/// The end-of-month recap, laid out like a real income statement: an INCOME
/// section and an EXPENSES section of right-aligned, column-aligned figures with
/// ruled subtotals and a double-ruled net, then the running balances.
Future<void> showDaySummary(
  BuildContext context,
  GameController game,
  DayResult r, {
  int monthsCovered = 1,
}) {
  return showDialog<void>(
    context: context,
    builder: (context) {
      final theme = Theme.of(context);
      final header = monthsCovered <= 1
          ? 'Month ${game.day}  ·  Age ${game.ageYears}'
          : '$monthsCovered months  ·  now Age ${game.ageYears}';

      final income = <_Line>[
        _Line('Salary', r.income),
        if (r.interest > 0.005) _Line('Interest', r.interest),
        if (r.dividends > 0.005) _Line('Dividends & coupons', r.dividends),
        if (r.rent > 0.005) _Line('Rental income', r.rent),
        if (r.businessIncome > 0.005) _Line('Business profit', r.businessIncome),
      ];
      final expenses = <_Line>[
        _Line('Living expenses', r.expenses),
        if (r.tax > 0.005) _Line('Income tax', r.tax),
        if (r.businessIncome < -0.005) _Line('Business loss', -r.businessIncome),
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
                child: Text('MONTHLY STATEMENT',
                    style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800, letterSpacing: 1.4)),
              ),
              const SizedBox(height: 2),
              Center(
                child: Text(header,
                    style: theme.textTheme.labelSmall
                        ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
              ),
              const SizedBox(height: 12),
              Container(height: 1.4, color: theme.colorScheme.outline),
              const SizedBox(height: 8),

              _sectionHeader(theme, 'Income'),
              for (final l in income) _stmtRow(theme, l.label, l.amount),
              _amtRule(theme),
              _stmtRow(theme, 'Total income', totalIn, bold: true, indent: 0),

              const SizedBox(height: 14),
              _sectionHeader(theme, 'Expenses'),
              for (final l in expenses) _stmtRow(theme, l.label, l.amount),
              _amtRule(theme),
              _stmtRow(theme, 'Total expenses', totalOut, bold: true, indent: 0),

              const SizedBox(height: 8),
              _amtRule(theme, doubled: true),
              _stmtRow(theme, monthsCovered > 1 ? 'NET CHANGE' : 'NET INCOME',
                  net.abs(),
                  bold: true,
                  indent: 0,
                  color: gainColor(net),
                  parenIfNeg: net < 0),

              const SizedBox(height: 18),
              Container(height: 1, color: theme.colorScheme.outlineVariant),
              const SizedBox(height: 10),
              _balanceRow(theme, 'Net worth', r.netWorthAfter, r.netWorthDelta),
              const SizedBox(height: 8),
              _balanceRow(theme, 'Cash on hand', r.cashAfter, r.cashDelta,
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

/// Fixed width for the right-hand figures column, so every amount lines up.
const double _amtW = 116;

/// A statement section heading (small caps, bold), e.g. "INCOME".
Widget _sectionHeader(ThemeData theme, String title) {
  return Padding(
    padding: const EdgeInsets.only(bottom: 2),
    child: Text(
      title.toUpperCase(),
      style: theme.textTheme.labelMedium?.copyWith(
        fontWeight: FontWeight.w800,
        letterSpacing: 0.8,
      ),
    ),
  );
}

/// One statement line: label on the left, a right-aligned figure (tabular so
/// digits stack) in the fixed amount column. Negatives can show in parentheses.
Widget _stmtRow(ThemeData theme, String label, double amount,
    {double indent = 14,
    bool bold = false,
    Color? color,
    bool parenIfNeg = false}) {
  final text =
      parenIfNeg ? '(${moneyWhole(amount)})' : moneyWhole(amount);
  final style = theme.textTheme.bodyMedium?.copyWith(
    fontWeight: bold ? FontWeight.w700 : null,
    color: color,
    fontFeatures: const [FontFeature.tabularFigures()],
  );
  return Padding(
    padding: EdgeInsets.only(left: indent, top: 3, bottom: 3),
    child: Row(
      children: [
        Expanded(
          child: Text(label,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(fontWeight: bold ? FontWeight.w700 : null)),
        ),
        SizedBox(
          width: _amtW,
          child: Text(text, textAlign: TextAlign.right, style: style),
        ),
      ],
    ),
  );
}

/// A rule under just the figures column (single, or a double underline for the
/// grand total — the classic accounting look).
Widget _amtRule(ThemeData theme, {bool doubled = false}) {
  final line = Container(height: 1, color: theme.colorScheme.outline);
  return Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      children: [
        const Spacer(),
        SizedBox(
          width: _amtW,
          child: doubled
              ? Column(children: [
                  Container(height: 1.4, color: theme.colorScheme.onSurface),
                  const SizedBox(height: 2.5),
                  Container(height: 1.4, color: theme.colorScheme.onSurface),
                ])
              : line,
        ),
      ],
    ),
  );
}

/// A running balance (net worth / cash) with its month-over-month move,
/// right-aligned to the same figures column.
Widget _balanceRow(ThemeData theme, String label, double value, double delta,
    {bool negative = false}) {
  return Row(
    children: [
      Expanded(
        child: Text(label,
            style: theme.textTheme.bodyMedium
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
      ),
      Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(moneyWhole(value),
              style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: negative ? kLoss : null,
                  fontFeatures: const [FontFeature.tabularFigures()])),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(delta >= 0 ? Icons.arrow_drop_up : Icons.arrow_drop_down,
                  size: 16, color: gainColor(delta)),
              Text(money(delta.abs()),
                  style: theme.textTheme.labelSmall?.copyWith(
                      color: gainColor(delta),
                      fontWeight: FontWeight.w600,
                      fontFeatures: const [FontFeature.tabularFigures()])),
            ],
          ),
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
