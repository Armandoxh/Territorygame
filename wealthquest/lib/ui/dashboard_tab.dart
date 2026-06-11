import 'package:flutter/material.dart';

import '../state/game_controller.dart';
import '../util/format.dart';
import 'widgets/amount_sheet.dart';
import 'widgets/candle_chart.dart';
import 'widgets/ui_helpers.dart';

class DashboardTab extends StatelessWidget {
  const DashboardTab({super.key, required this.game});

  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Net worth over time',
                    style: theme.textTheme.titleMedium),
                const SizedBox(height: 12),
                CandleChart(series: game.netWorthHistory, height: 140),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        _BalanceSheet(game: game),
        const SizedBox(height: 12),
        _IncomeStreams(game: game),
        if (game.portfolioUnrealizedPnl.abs() > 1 || game.betsSettled > 0) ...[
          const SizedBox(height: 12),
          _ProfitLoss(game: game),
        ],
        const SizedBox(height: 16),
        Text('Recent activity', style: theme.textTheme.titleMedium),
        const SizedBox(height: 8),
        if (game.eventLog.isEmpty)
          Text('Press Next Month to begin.',
              style: theme.textTheme.bodyMedium)
        else
          ...game.eventLog.take(12).map(
                (e) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Padding(
                        padding: EdgeInsets.only(top: 6, right: 8),
                        child: Icon(Icons.circle, size: 6),
                      ),
                      Expanded(
                        child: Text(e, style: theme.textTheme.bodyMedium),
                      ),
                    ],
                  ),
                ),
              ),
      ],
    );
  }
}

class _BalanceSheet extends StatelessWidget {
  const _BalanceSheet({required this.game});
  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final assets = game.cash +
        game.holdingsValue +
        game.propertyValue +
        game.retirementBalance;
    final liabilities = game.totalLoanBalance;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Balance sheet', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            _line(theme, 'Cash', game.cash),
            _line(theme, 'Investments', game.holdingsValue),
            if (game.propertyValue > 0) _line(theme, 'Property', game.propertyValue),
            if (game.retirementBalance > 0)
              _line(theme, 'Retirement (401k)', game.retirementBalance),
            const Divider(height: 16),
            _line(theme, 'Total assets', assets, bold: true),
            if (liabilities > 0) ...[
              const SizedBox(height: 4),
              _line(theme, 'Mortgages owed', -liabilities, color: kLoss),
            ],
            if (game.studentLoan > 0) ...[
              const SizedBox(height: 4),
              _line(theme, 'Student loan', -game.studentLoan, color: kLoss),
            ],
            if (game.debt > 0) ...[
              const SizedBox(height: 4),
              _line(theme,
                  'Debt (${pct(GameController.debtRate)}/yr)', -game.debt,
                  color: kLoss),
            ],
            const Divider(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Net worth',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.bold)),
                Text(moneyWhole(game.netWorth),
                    style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: theme.colorScheme.primary)),
              ],
            ),
            if (game.debt > 0) ...[
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.tonal(
                  onPressed: () => _payDebt(context),
                  child: const Text('Pay down debt'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _payDebt(BuildContext context) async {
    final maxPay = game.debt < game.cash ? game.debt : game.cash;
    final amount = await showAmountSheet(
      context,
      title: 'Pay down debt',
      actionLabel: 'Pay',
      max: maxPay,
      helper: 'Debt ${money(game.debt)} · cash ${money(game.cash)}. '
          'It compounds at ${pct(GameController.debtRate)}/yr — clear it fast.',
    );
    if (amount == null || !context.mounted) return;
    final err = game.payDebt(amount, max: amount >= game.debt - 0.01);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
          SnackBar(content: Text(err ?? 'Paid ${money(amount)} toward your debt.')));
  }

  Widget _line(ThemeData theme, String k, double v,
      {bool bold = false, Color? color}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(k,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                fontWeight: bold ? FontWeight.bold : null,
              )),
          Text(moneyWhole(v),
              style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: bold ? FontWeight.bold : FontWeight.w600,
                  color: color)),
        ],
      ),
    );
  }
}

/// Every recurring income source — salary, investments, rent, business — in one
/// after-tax monthly cash-flow statement, netted against living costs.
class _IncomeStreams extends StatelessWidget {
  const _IncomeStreams({required this.game});
  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final salaryNet = game.effectivePay - game.monthlyIncomeTax;
    final inv = game.dailyPassiveIncome;
    final rent = game.expectedMonthlyRent;
    final biz = game.expectedMonthlyBusinessIncome *
        (1 - GameController.businessTaxRate);
    final expenses = game.dailyExpenses;
    final net = salaryNet + inv + rent + biz - expenses;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.payments_outlined, size: 18),
                const SizedBox(width: 8),
                Text('Income streams', style: theme.textTheme.titleMedium),
                const Spacer(),
                Text('per month, after tax',
                    style: theme.textTheme.labelSmall
                        ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
              ],
            ),
            const SizedBox(height: 8),
            _flowRow(theme, '💼  Salary (take-home)', salaryNet),
            if (inv > 0.5) _flowRow(theme, '📈  Investments', inv),
            if (rent > 0.5) _flowRow(theme, '🏠  Rental income', rent),
            if (biz > 0.5) _flowRow(theme, '🏪  Business profit', biz),
            _rule(theme),
            _flowRow(theme, '🧾  Living expenses', -expenses),
            _rule(theme, heavy: true),
            _flowRow(theme, 'Net into cash', net,
                bold: true, color: gainColor(net)),
          ],
        ),
      ),
    );
  }
}

/// Speculative profit pools: unrealized investing gains and lifetime betting.
class _ProfitLoss extends StatelessWidget {
  const _ProfitLoss({required this.game});
  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.insights_outlined, size: 18),
                const SizedBox(width: 8),
                Text('Profit & loss', style: theme.textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: 8),
            if (game.holdings.isNotEmpty)
              _pnlRow(theme, '📊  Investments', game.portfolioUnrealizedPnl,
                  'unrealized gain/loss on holdings'),
            if (game.betsSettled > 0)
              _pnlRow(theme, '🎲  Betting', game.betNetProfit,
                  '${game.betsSettled} settled · ${(game.betWinRate * 100).toStringAsFixed(0)}% hit rate'),
          ],
        ),
      ),
    );
  }
}

Widget _flowRow(ThemeData theme, String label, double amount,
    {bool bold = false, Color? color}) {
  final c = color ?? (amount >= 0 ? kGain : kLoss);
  return Padding(
    padding: const EdgeInsets.symmetric(vertical: 3.5),
    child: Row(
      children: [
        Expanded(
          child: Text(label,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(fontWeight: bold ? FontWeight.w700 : null)),
        ),
        Text('${amount >= 0 ? '+' : '−'}${moneyWhole(amount.abs())}',
            style: theme.textTheme.bodyMedium?.copyWith(
                color: c,
                fontWeight: bold ? FontWeight.w700 : FontWeight.w600,
                fontFeatures: const [FontFeature.tabularFigures()])),
      ],
    ),
  );
}

Widget _pnlRow(ThemeData theme, String label, double amount, String sub) {
  return Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: theme.textTheme.bodyMedium),
              Text(sub,
                  style: theme.textTheme.labelSmall
                      ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            ],
          ),
        ),
        Text('${amount >= 0 ? '+' : '−'}${moneyWhole(amount.abs())}',
            style: theme.textTheme.titleSmall?.copyWith(
                color: gainColor(amount),
                fontWeight: FontWeight.bold,
                fontFeatures: const [FontFeature.tabularFigures()])),
      ],
    ),
  );
}

Widget _rule(ThemeData theme, {bool heavy = false}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Container(
          height: heavy ? 1.5 : 1,
          color: heavy
              ? theme.colorScheme.outline
              : theme.colorScheme.outlineVariant),
    );
