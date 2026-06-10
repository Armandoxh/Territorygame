import 'package:flutter/material.dart';

import '../../state/game_controller.dart';
import '../../util/format.dart';

// A printed-statement palette: dark ink on light paper, so the recap stays
// crisp and high-contrast even over the app's dark theme (the old white-on-dark
// version washed out against the home screen).
const Color _paper = Color(0xFFF6F3EC);
const Color _ink = Color(0xFF1B1A17);
const Color _inkMuted = Color(0xFF6A675F);
const Color _rule = Color(0xFF2B2924);
const Color _pos = Color(0xFF1B7F3B);
const Color _neg = Color(0xFFB3261E);

/// The end-of-month recap, laid out like a printed income statement: INCOME and
/// EXPENSES sections of right-aligned, column-aligned figures with ruled
/// subtotals and a double-ruled net, then the running balances.
Future<void> showDaySummary(
  BuildContext context,
  GameController game,
  DayResult r, {
  int monthsCovered = 1,
}) {
  return showDialog<void>(
    context: context,
    builder: (context) {
      final header = monthsCovered <= 1
          ? 'Month ${game.day}  ·  Age ${game.ageYears}'
          : '$monthsCovered months  ·  now Age ${game.ageYears}';

      final income = <_Line>[
        _Line('Income', r.income),
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
        backgroundColor: _paper,
        surfaceTintColor: Colors.transparent,
        contentPadding: const EdgeInsets.fromLTRB(22, 20, 22, 8),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Center(
                child: Text('MONTHLY STATEMENT',
                    style: TextStyle(
                        color: _ink,
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.6)),
              ),
              const SizedBox(height: 2),
              Center(
                child: Text(header,
                    style: const TextStyle(color: _inkMuted, fontSize: 11.5)),
              ),
              const SizedBox(height: 12),
              Container(height: 1.6, color: _rule),
              const SizedBox(height: 8),

              _sectionHeader('Income'),
              for (final l in income) _stmtRow(l.label, l.amount),
              _amtRule(),
              _stmtRow('Total income', totalIn, bold: true, indent: 0),

              const SizedBox(height: 14),
              _sectionHeader('Expenses'),
              for (final l in expenses) _stmtRow(l.label, l.amount),
              _amtRule(),
              _stmtRow('Total expenses', totalOut, bold: true, indent: 0),

              const SizedBox(height: 8),
              _amtRule(doubled: true),
              _stmtRow(monthsCovered > 1 ? 'NET CHANGE' : 'NET INCOME', net.abs(),
                  bold: true,
                  indent: 0,
                  color: net >= 0 ? _pos : _neg,
                  parenIfNeg: net < 0),

              const SizedBox(height: 16),
              Container(height: 1, color: _rule.withOpacity(0.30)),
              const SizedBox(height: 10),
              _balanceRow('Net worth', r.netWorthAfter, r.netWorthDelta),
              const SizedBox(height: 8),
              _balanceRow('Cash on hand', r.cashAfter, r.cashDelta,
                  negative: r.cashAfter < 0),
              // Liabilities pull net worth below cash — show why.
              if (game.studentLoan > 0)
                _liabRow('Student loan owed', game.studentLoan),
              if (game.debt > 0) _liabRow('High-interest debt', game.debt),

              if (r.cashAfter < 0) ...[
                const SizedBox(height: 12),
                _banner(
                  r.marginCall
                      ? 'Margin call — liquidate to get back above \$0.'
                      : 'Cash is negative — top it up before it costs you.',
                ),
              ],

              if (shown.isNotEmpty) ...[
                const SizedBox(height: 14),
                Container(height: 1, color: _rule.withOpacity(0.30)),
                const SizedBox(height: 10),
                for (final h in shown)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Text(h,
                        style: const TextStyle(
                            color: _ink, fontSize: 12.5, height: 1.25),
                        maxLines: 2),
                  ),
                if (extra > 0)
                  const Text('+more',
                      style: TextStyle(color: _inkMuted, fontSize: 11)),
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
const double _amtW = 118;

/// A statement section heading (small caps, bold).
Widget _sectionHeader(String title) {
  return Padding(
    padding: const EdgeInsets.only(bottom: 2),
    child: Text(
      title.toUpperCase(),
      style: const TextStyle(
        color: _ink,
        fontSize: 12.5,
        fontWeight: FontWeight.w800,
        letterSpacing: 1.0,
      ),
    ),
  );
}

/// One statement line: label left, a right-aligned tabular figure in the fixed
/// amount column. Negatives can show in parentheses (accounting style).
Widget _stmtRow(String label, double amount,
    {double indent = 14,
    bool bold = false,
    Color? color,
    bool parenIfNeg = false}) {
  final text = parenIfNeg ? '(${moneyWhole(amount)})' : moneyWhole(amount);
  return Padding(
    padding: EdgeInsets.only(left: indent, top: 3.5, bottom: 3.5),
    child: Row(
      children: [
        Expanded(
          child: Text(label,
              style: TextStyle(
                  color: _ink,
                  fontSize: 14,
                  fontWeight: bold ? FontWeight.w700 : FontWeight.w400)),
        ),
        SizedBox(
          width: _amtW,
          child: Text(text,
              textAlign: TextAlign.right,
              style: TextStyle(
                color: color ?? _ink,
                fontSize: 14,
                fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
                fontFeatures: const [FontFeature.tabularFigures()],
              )),
        ),
      ],
    ),
  );
}

/// A rule under just the figures column — single, or a double underline for the
/// grand total (the classic accounting look).
Widget _amtRule({bool doubled = false}) {
  return Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      children: [
        const Spacer(),
        SizedBox(
          width: _amtW,
          child: doubled
              ? Column(children: [
                  Container(height: 1.5, color: _ink),
                  const SizedBox(height: 2.5),
                  Container(height: 1.5, color: _ink),
                ])
              : Container(height: 1, color: _rule),
        ),
      ],
    ),
  );
}

/// A running balance (net worth / cash) with its month-over-month move.
Widget _balanceRow(String label, double value, double delta,
    {bool negative = false}) {
  final dColor = delta >= 0 ? _pos : _neg;
  return Row(
    children: [
      Expanded(
        child: Text(label,
            style: const TextStyle(color: _inkMuted, fontSize: 13.5)),
      ),
      Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(moneyWhole(value),
              style: TextStyle(
                  color: negative ? _neg : _ink,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  fontFeatures: const [FontFeature.tabularFigures()])),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(delta >= 0 ? Icons.arrow_drop_up : Icons.arrow_drop_down,
                  size: 16, color: dColor),
              Text(money(delta.abs()),
                  style: TextStyle(
                      color: dColor,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      fontFeatures: const [FontFeature.tabularFigures()])),
            ],
          ),
        ],
      ),
    ],
  );
}

/// A liability line (student loan / debt) shown in accounting parentheses, so
/// it's clear why net worth can sit below cash on hand.
Widget _liabRow(String label, double amount) {
  return Padding(
    padding: const EdgeInsets.only(top: 6),
    child: Row(
      children: [
        Expanded(
          child: Text(label,
              style: const TextStyle(color: _inkMuted, fontSize: 13)),
        ),
        Text('(${moneyWhole(amount)})',
            style: const TextStyle(
                color: _neg,
                fontSize: 14,
                fontWeight: FontWeight.w600,
                fontFeatures: [FontFeature.tabularFigures()])),
      ],
    ),
  );
}

Widget _banner(String text) {
  return Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    decoration: BoxDecoration(
      color: _neg.withOpacity(0.10),
      borderRadius: BorderRadius.circular(10),
      border: Border.all(color: _neg.withOpacity(0.5)),
    ),
    child: Row(
      children: [
        const Icon(Icons.warning_amber_rounded, size: 16, color: _neg),
        const SizedBox(width: 8),
        Expanded(
          child: Text(text,
              style: const TextStyle(color: _neg, fontSize: 12.5)),
        ),
      ],
    ),
  );
}
