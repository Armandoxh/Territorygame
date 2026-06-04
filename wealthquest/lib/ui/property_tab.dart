import 'package:flutter/material.dart';

import '../data/properties.dart';
import '../models/property.dart';
import '../state/game_controller.dart';
import '../util/format.dart';
import 'widgets/ui_helpers.dart';

/// Real estate: browse the property ladder, buy with a chosen down payment and
/// mortgage, and manage what you own.
class PropertyTab extends StatelessWidget {
  const PropertyTab({super.key, required this.game});

  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
      children: [
        if (game.properties.isNotEmpty) ...[
          Text('Your properties', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          ...game.properties.map((h) => _OwnedCard(game: game, holding: h)),
          const SizedBox(height: 16),
        ],
        Text('On the market', style: theme.textTheme.titleMedium),
        Text(
          'Put as little as ${(GameController.minDownFraction * 100).toStringAsFixed(0)}% down and let leverage + appreciation work — but you owe the mortgage every month.',
          style: theme.textTheme.bodySmall
              ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 8),
        ...Properties.ladder.map((d) => _ListingCard(game: game, def: d)),
      ],
    );
  }
}

class _OwnedCard extends StatelessWidget {
  const _OwnedCard({required this.game, required this.holding});

  final GameController game;
  final PropertyHolding holding;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final def = Properties.byId(holding.defId);
    final monthsLeft = (holding.termMonths - holding.monthsPaid).clamp(0, 100000);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(def.name, style: theme.textTheme.titleSmall),
                Text(money(holding.currentValue),
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 8),
            _kv(theme, 'Equity', money(holding.equity),
                color: gainColor(holding.equity)),
            if (!holding.isPaidOff) ...[
              _kv(theme, 'Loan balance', money(holding.loanBalance)),
              _kv(theme, 'Monthly payment', money(holding.monthlyPayment)),
              _kv(theme, 'Rate / term',
                  '${pct(holding.annualRate)} · $monthsLeft mo left'),
            ] else
              _kv(theme, 'Status', 'Paid off 🎉'),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: OutlinedButton(
                onPressed: () {
                  final err = game.sellProperty(holding);
                  _toast(context,
                      err ?? 'Sold ${def.name} for ${money(holding.equity)}.');
                },
                child: const Text('Sell'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ListingCard extends StatelessWidget {
  const _ListingCard({required this.game, required this.def});

  final GameController game;
  final PropertyDef def;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final price = game.propertyPriceOf(def.id);
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        leading: const Icon(Icons.home_outlined),
        title: Text(def.name),
        subtitle: Text(
          '${def.tierLabel} • ${pct(def.monthlyAppreciation * 12)}/yr appreciation',
          style: theme.textTheme.bodySmall,
        ),
        trailing: Text(moneyCompact(price),
            style: theme.textTheme.titleSmall
                ?.copyWith(fontWeight: FontWeight.bold)),
        onTap: () => _showBuySheet(context, game, def),
      ),
    );
  }
}

void _showBuySheet(BuildContext context, GameController game, PropertyDef def) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _BuySheet(game: game, def: def),
  );
}

class _BuySheet extends StatefulWidget {
  const _BuySheet({required this.game, required this.def});
  final GameController game;
  final PropertyDef def;

  @override
  State<_BuySheet> createState() => _BuySheetState();
}

class _BuySheetState extends State<_BuySheet> {
  double _downPct = 0.20;
  MortgageType _mortgage = Properties.mortgages.first;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final g = widget.game;
    final price = g.propertyPriceOf(widget.def.id);
    final down = price * _downPct;
    final loan = price - down;
    final payment =
        mortgageMonthlyPayment(loan, _mortgage.annualRate, _mortgage.termMonths);
    final dti = g.job.pay <= 0 ? 1.0 : payment / g.job.pay;
    final tooExpensive = loan > 0 && dti > 0.45;
    final notEnoughCash = down > g.cash + 0.01;

    return Padding(
      padding: EdgeInsets.fromLTRB(
          20, 4, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Buy ${widget.def.name}', style: theme.textTheme.titleLarge),
            Text('List price ${money(price)} · cash ${money(g.cash)}',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            const SizedBox(height: 16),

            // Down payment
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Down payment', style: theme.textTheme.titleSmall),
                Text('${(_downPct * 100).toStringAsFixed(0)}%  ·  ${money(down)}',
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.bold)),
              ],
            ),
            Slider(
              value: _downPct,
              min: GameController.minDownFraction,
              max: 1.0,
              divisions: 19,
              label: '${(_downPct * 100).toStringAsFixed(0)}%',
              onChanged: (v) => setState(() => _downPct = v),
            ),

            // Mortgage type
            const SizedBox(height: 4),
            Text('Mortgage', style: theme.textTheme.titleSmall),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              children: [
                for (final m in Properties.mortgages)
                  ChoiceChip(
                    label: Text('${m.name} · ${pct(m.annualRate)}'),
                    selected: _mortgage.id == m.id,
                    onSelected: (_) => setState(() => _mortgage = m),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(_mortgage.blurb,
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),

            const Divider(height: 24),
            _row(theme, 'Loan amount', money(loan)),
            _row(theme, 'Monthly payment', money(payment),
                color: tooExpensive ? kLoss : null),
            _row(theme, '% of monthly pay', pct(dti),
                color: tooExpensive ? kLoss : null),
            if (tooExpensive)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  'Payment exceeds 45% of your income — earn more or put more down.',
                  style: theme.textTheme.bodySmall?.copyWith(color: kLoss),
                ),
              ),
            if (notEnoughCash)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('Not enough cash for this down payment.',
                    style: theme.textTheme.bodySmall?.copyWith(color: kLoss)),
              ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: (tooExpensive || notEnoughCash)
                  ? null
                  : () {
                      final err =
                          g.buyProperty(widget.def, _mortgage, _downPct);
                      Navigator.pop(context);
                      _toast(context, err ?? 'Bought ${widget.def.name}!');
                    },
              child: Text('Buy for ${money(down)} down'),
            ),
          ],
        ),
      ),
    );
  }
}

Widget _kv(ThemeData theme, String k, String v, {Color? color}) {
  return Padding(
    padding: const EdgeInsets.symmetric(vertical: 2),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(k,
            style: theme.textTheme.bodyMedium
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        Text(v,
            style: theme.textTheme.bodyMedium
                ?.copyWith(fontWeight: FontWeight.w600, color: color)),
      ],
    ),
  );
}

Widget _row(ThemeData theme, String k, String v, {Color? color}) =>
    _kv(theme, k, v, color: color);

void _toast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}
