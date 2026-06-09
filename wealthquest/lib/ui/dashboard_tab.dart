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
    final netCashFlow =
        game.effectivePay + game.dailyPassiveIncome - game.dailyExpenses;

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
        _RetirementCard(game: game),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _StatCard(
                label: 'Monthly salary',
                value: money(game.effectivePay),
                sub: game.isStudying
                    ? '${game.job.title} (part-time)'
                    : game.job.title,
                color: kGain,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _StatCard(
                label: 'Living expenses',
                value: '-${money(game.dailyExpenses)}',
                sub: 'per month',
                color: kLoss,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _StatCard(
                label: 'Passive income',
                value: money(game.dailyPassiveIncome),
                sub: 'interest + dividends',
                color: kGain,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _StatCard(
                label: 'Net monthly flow',
                value: '${netCashFlow >= 0 ? '+' : ''}${money(netCashFlow)}',
                sub: 'into cash',
                color: gainColor(netCashFlow),
              ),
            ),
          ],
        ),
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

class _RetirementCard extends StatelessWidget {
  const _RetirementCard({required this.game});
  final GameController game;

  static const _pcts = [0.0, 0.03, 0.05, 0.10, 0.15, 0.20];

  Future<void> _withdraw(BuildContext context) async {
    final early = game.ageYears < GameController.retirementAge;
    final penaltyPct =
        (GameController.earlyWithdrawalPenalty * 100).toStringAsFixed(0);
    final amount = await showAmountSheet(
      context,
      title: 'Withdraw from 401(k)',
      actionLabel: 'Withdraw',
      max: game.retirementBalance,
      helper: early
          ? 'Balance ${money(game.retirementBalance)}. You\'re ${game.ageYears} — '
              'an early withdrawal forfeits $penaltyPct%, so \$100 out puts only '
              '\$${(100 * (1 - GameController.earlyWithdrawalPenalty)).toStringAsFixed(0)} in your cash.'
          : 'Balance ${money(game.retirementBalance)}. Penalty-free at your age.',
    );
    if (amount == null || !context.mounted) return;
    final err = game.withdrawRetirement(amount,
        max: amount >= game.retirementBalance - 0.01);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
          content: Text(err ?? 'Withdrew ${money(amount)} from retirement.')));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final pct = game.retirementContribPct;
    final yourMo = game.effectivePay * pct;
    final matchMo = game.effectivePay *
        (pct < GameController.employerMatchPct
            ? pct
            : GameController.employerMatchPct);
    final locked = game.ageYears < GameController.retirementAge;
    final matchPct =
        (GameController.employerMatchPct * 100).toStringAsFixed(0);
    final penaltyPct =
        (GameController.earlyWithdrawalPenalty * 100).toStringAsFixed(0);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.savings_outlined, size: 18),
                const SizedBox(width: 8),
                Expanded(
                    child: Text('Retirement 401(k)',
                        style: theme.textTheme.titleMedium)),
                Text(moneyWhole(game.retirementBalance),
                    style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: theme.colorScheme.primary)),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'Employer matches you 100% up to $matchPct% of pay — free money. '
              '${locked ? 'Locked until age ${GameController.retirementAge}; pulling early costs $penaltyPct%.' : 'Penalty-free at your age.'}',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 10),
            Text('Contribute from each paycheck',
                style: theme.textTheme.labelMedium),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              children: [
                for (final p in _pcts)
                  ChoiceChip(
                    label: Text('${(p * 100).toStringAsFixed(0)}%'),
                    selected: (pct - p).abs() < 1e-6,
                    onSelected: (_) => game.setRetirementContribPct(p),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              pct > 0
                  ? 'You ${money(yourMo)}/mo + employer ${money(matchMo)}/mo → ${money(yourMo + matchMo)}/mo invested.'
                  : 'Not contributing — you\'re leaving the employer match on the table.',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: pct > 0 ? kGain : kLoss),
            ),
            if (game.retirementBalance > 0) ...[
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerRight,
                child: OutlinedButton(
                  onPressed: () => _withdraw(context),
                  child: Text(locked ? 'Withdraw (−$penaltyPct%)' : 'Withdraw'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.sub,
    required this.color,
  });

  final String label;
  final String value;
  final String sub;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: theme.textTheme.labelMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                )),
            const SizedBox(height: 6),
            Text(value,
                style: theme.textTheme.titleLarge
                    ?.copyWith(color: color, fontWeight: FontWeight.bold)),
            const SizedBox(height: 2),
            Text(sub,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                )),
          ],
        ),
      ),
    );
  }
}
