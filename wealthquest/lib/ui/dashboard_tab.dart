import 'package:flutter/material.dart';

import '../state/game_controller.dart';
import '../util/format.dart';
import 'widgets/candle_chart.dart';
import 'widgets/ui_helpers.dart';

class DashboardTab extends StatelessWidget {
  const DashboardTab({super.key, required this.game});

  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final netCashFlow = game.job.pay + game.dailyPassiveIncome - game.dailyExpenses;

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
        Row(
          children: [
            Expanded(
              child: _StatCard(
                label: 'Monthly salary',
                value: money(game.job.pay),
                sub: game.job.title,
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
    final assets = game.cash + game.holdingsValue + game.propertyValue;
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
            const Divider(height: 16),
            _line(theme, 'Total assets', assets, bold: true),
            if (liabilities > 0) ...[
              const SizedBox(height: 4),
              _line(theme, 'Mortgages owed', -liabilities, color: kLoss),
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
          ],
        ),
      ),
    );
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
