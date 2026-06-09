import 'package:flutter/material.dart';

import '../data/properties.dart';
import '../models/property.dart';
import '../state/game_controller.dart';
import '../util/format.dart';
import 'widgets/amount_sheet.dart';
import 'widgets/ui_helpers.dart';

/// Real estate: browse the property ladder, buy with a chosen down payment and
/// mortgage, and manage what you own.
class PropertyTab extends StatefulWidget {
  const PropertyTab({super.key, required this.game});

  final GameController game;

  @override
  State<PropertyTab> createState() => _PropertyTabState();
}

class _PropertyTabState extends State<PropertyTab> {
  /// Which property type the "Your properties" tabs are showing.
  String? _typeFilter;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final game = widget.game;

    // Group owned homes by type, in ladder order, so a big portfolio reads as
    // a few tabs ("Suburban House · 5") instead of one endless list.
    final byType = <String, List<PropertyHolding>>{};
    for (final h in game.properties) {
      byType.putIfAbsent(h.defId, () => []).add(h);
    }
    final ownedTypes = [
      for (final d in Properties.ladder)
        if (byType.containsKey(d.id)) d.id,
    ];
    final filter = (_typeFilter != null && byType.containsKey(_typeFilter))
        ? _typeFilter!
        : (ownedTypes.isNotEmpty ? ownedTypes.first : null);
    final shown = filter == null ? const <PropertyHolding>[] : byType[filter]!;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Pinned: the housing-market + rate header stays visible while the list
        // below scrolls.
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: _MarketHeader(game: game),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
            children: [
              if (game.properties.isNotEmpty) ...[
          _PortfolioSummary(game: game),
          const SizedBox(height: 12),
          Text('Your properties', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          // Type "tabs": one chip per kind of home you own.
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final id in ownedTypes)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(
                          '${Properties.byId(id).name} · ${byType[id]!.length}'),
                      selected: filter == id,
                      onSelected: (_) => setState(() => _typeFilter = id),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          ...shown.map((h) => _OwnedCard(game: game, holding: h)),
          const SizedBox(height: 16),
        ],
        Text('On the market', style: theme.textTheme.titleMedium),
        Text(
          'Put as little as ${(GameController.minDownFraction * 100).toStringAsFixed(0)}% down and let leverage + appreciation work — but you owe the mortgage every month. Each category plays differently.',
          style: theme.textTheme.bodySmall
              ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 8),
        for (final cat in Properties.categoriesInOrder) ...[
          _CategoryHeader(category: cat),
          ...Properties.inCategory(cat)
              .map((d) => _ListingCard(game: game, def: d)),
          const SizedBox(height: 12),
        ],
            ],
          ),
        ),
      ],
    );
  }
}

/// A one-glance roll-up of the whole portfolio — essential once you own dozens
/// of homes.
class _PortfolioSummary extends StatelessWidget {
  const _PortfolioSummary({required this.game});

  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final homes = game.properties;
    var value = 0.0, equity = 0.0, rent = 0.0, mortgage = 0.0, pull = 0.0;
    for (final h in homes) {
      value += h.currentValue;
      equity += h.equity;
      if (h.rentedOut && h.occupied) rent += h.monthlyRent;
      if (!h.isPaidOff) mortgage += h.monthlyPayment;
      pull += game.refinanceCashOut(h);
    }
    final cashFlow = rent - mortgage;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
                'Portfolio · ${homes.length} '
                'propert${homes.length == 1 ? 'y' : 'ies'}',
                style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            _kv(theme, 'Total value', money(value)),
            _kv(theme, 'Total equity', money(equity),
                color: gainColor(equity)),
            _kv(theme, 'Net rent − mortgage', '${money(cashFlow)}/mo',
                color: cashFlow >= 0 ? kGain : kLoss),
            _kv(theme, 'Equity you could refi out', money(pull),
                color: pull > 0 ? kGain : null),
          ],
        ),
      ),
    );
  }
}

/// A glance at the housing cycle and today's mortgage rate — the weather that
/// makes refinancing and buying a timing decision.
class _MarketHeader extends StatelessWidget {
  const _MarketHeader({required this.game});

  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final trend = game.housingTrend;
    final color = trend > 0.0015
        ? kGain
        : (trend < -0.0015 ? kLoss : theme.colorScheme.onSurfaceVariant);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            const Text('🏘️', style: TextStyle(fontSize: 22)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Housing market: ${game.housingMarketLabel}',
                      style: theme.textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.bold, color: color)),
                  Text('30-year mortgage rate ${pct(game.mortgageRate)}',
                      style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant)),
                ],
              ),
            ),
          ],
        ),
      ),
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
    final title = holding.address.isEmpty ? def.name : holding.address;

    final String rentLabel;
    final Color rentColor;
    if (holding.rentedOut && holding.occupied) {
      rentLabel = 'Rented · +${money(holding.monthlyRent)}/mo';
      rentColor = kGain;
    } else if (holding.rentedOut) {
      rentLabel = 'Listed · no tenant yet';
      rentColor = theme.colorScheme.onSurfaceVariant;
    } else {
      rentLabel = 'Not rented';
      rentColor = theme.colorScheme.onSurfaceVariant;
    }

    return Card(
      child: InkWell(
        onTap: () => _openDetail(context),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall
                            ?.copyWith(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 2),
                    Text(
                      holding.isPaidOff
                          ? '${def.name} · paid off'
                          : '${def.name} · ${pct(holding.annualRate)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                    const SizedBox(height: 4),
                    Text(rentLabel,
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: rentColor)),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(money(holding.currentValue),
                      style: theme.textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 2),
                  Text('${money(holding.equity)} equity',
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: gainColor(holding.equity))),
                ],
              ),
              Icon(Icons.chevron_right,
                  color: theme.colorScheme.onSurfaceVariant),
            ],
          ),
        ),
      ),
    );
  }

  void _openDetail(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _PropertyDetailSheet(game: game, holding: holding),
    );
  }
}

/// Full P&L + actions for one owned home, opened by tapping its summary card —
/// so the list itself stays a clean scan of cards instead of a wall of numbers.
class _PropertyDetailSheet extends StatelessWidget {
  const _PropertyDetailSheet({required this.game, required this.holding});

  final GameController game;
  final PropertyHolding holding;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: game,
      builder: (context, _) {
        // If the home was sold from in here, close the sheet.
        if (!game.properties.contains(holding)) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            final nav = Navigator.of(context);
            if (nav.canPop()) nav.pop();
          });
          return const SizedBox.shrink();
        }
        final theme = Theme.of(context);
        final def = Properties.byId(holding.defId);
        final monthsLeft =
            (holding.termMonths - holding.monthsPaid).clamp(0, 100000);
        final title = holding.address.isEmpty ? def.name : holding.address;
        return Padding(
          padding: EdgeInsets.fromLTRB(
              20, 0, 20, MediaQuery.of(context).viewInsets.bottom + 20),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(title, style: theme.textTheme.titleLarge),
                Text(def.name,
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                const SizedBox(height: 12),
                _kv(theme, 'Value', money(holding.currentValue)),
                _kv(theme, 'Equity', money(holding.equity),
                    color: gainColor(holding.equity)),
                if (!holding.isPaidOff) ...[
                  _kv(theme, 'Loan balance', money(holding.loanBalance)),
                  _kv(theme, 'Monthly payment', money(holding.monthlyPayment)),
                  _kv(theme, 'Rate / term',
                      '${pct(holding.annualRate)} · $monthsLeft mo left'),
                ] else
                  _kv(theme, 'Status', 'Paid off 🎉'),
                Builder(builder: (_) {
                  final pull = game.refinanceCashOut(holding);
                  return _kv(theme, 'Cash you can refi out',
                      pull > 0 ? money(pull) : 'none yet',
                      color: pull > 0 ? kGain : null);
                }),
                const Divider(height: 24),
                if (holding.rentable)
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Rent it out',
                                style: theme.textTheme.titleSmall),
                            const SizedBox(height: 2),
                            Text(
                              holding.rentedOut
                                  ? (holding.occupied
                                      ? 'Occupied · +${money(holding.monthlyRent)}/mo coming in'
                                      : 'Listed · no tenant at the moment')
                                  : 'Earn ~${money(holding.monthlyRent)}/mo when occupied '
                                      '(tenants ~${(holding.occupancy * 100).toStringAsFixed(0)}% of months).',
                              style: theme.textTheme.bodySmall?.copyWith(
                                  color: holding.occupied
                                      ? kGain
                                      : theme.colorScheme.onSurfaceVariant),
                            ),
                          ],
                        ),
                      ),
                      Switch(
                        value: holding.rentedOut,
                        onChanged: (_) => game.toggleRental(holding),
                      ),
                    ],
                  )
                else
                  Text(
                    'Raw land earns no rent — you hold it purely for '
                    'appreciation, paying the mortgage until you sell.',
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                const SizedBox(height: 8),
                Wrap(
                  alignment: WrapAlignment.end,
                  spacing: 8,
                  children: [
                    if (def.renovatable)
                      TextButton(
                        onPressed: () => _renovate(context),
                        child: const Text('Renovate'),
                      ),
                    TextButton(
                      onPressed: () => _refinance(context),
                      child: const Text('Refinance'),
                    ),
                    if (!holding.isPaidOff)
                      TextButton(
                        onPressed: () => _payDown(context),
                        child: const Text('Pay down'),
                      ),
                    OutlinedButton(
                      onPressed: () {
                        final messenger = ScaffoldMessenger.of(context);
                        final value = holding.equity;
                        final err = game.sellProperty(holding);
                        messenger
                          ..hideCurrentSnackBar()
                          ..showSnackBar(SnackBar(
                              content: Text(err ??
                                  'Sold ${def.name} for ${money(value)}.')));
                        // On success game notifies → the guard above pops us.
                      },
                      child: const Text('Sell'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _payDown(BuildContext context) async {
    final def = Properties.byId(holding.defId);
    final maxPay =
        holding.loanBalance < game.cash ? holding.loanBalance : game.cash;
    final amount = await showAmountSheet(
      context,
      title: 'Pay down ${def.name}',
      actionLabel: 'Pay',
      max: maxPay,
      helper: 'Loan balance ${money(holding.loanBalance)} · cash '
          '${money(game.cash)}. Tap MAX to pay it off and own it free and clear.',
    );
    if (amount == null || !context.mounted) return;
    final payoff = amount >= holding.loanBalance - 0.01;
    final err = game.payDownMortgage(holding, amount, max: payoff);
    _toast(
        context,
        err ??
            (payoff
                ? 'Paid off ${def.name} — it\'s all yours. 🎉'
                : 'Paid ${money(amount)} toward your ${def.name} loan.'));
  }

  Future<void> _refinance(BuildContext context) async {
    final def = Properties.byId(holding.defId);
    final cashOut = game.refinanceCashOut(holding);
    if (cashOut <= 0) {
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Not enough equity yet'),
          content: Text(
            'A cash-out refinance (a HELOC, basically) lets you pull up to '
            '${(GameController.refiMaxLtv * 100).toStringAsFixed(0)}% of a '
            'home\'s value as cash — without selling it.\n\n'
            'This one is worth ${money(holding.currentValue)} but you still owe '
            '${money(holding.loanBalance)}, so there\'s nothing to pull yet. '
            'Pay the loan down, wait for it to appreciate, or Renovate to force '
            'its value up — then refinance.',
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Got it')),
          ],
        ),
      );
      return;
    }
    final rate = game.effectiveMortgageRate(Properties.mortgages.first);
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('Refinance ${def.name}?'),
        content: Text(
          'Pull about ${money(cashOut)} in cash now by writing a fresh 30-year '
          'loan at today\'s ${pct(rate)} rate — up to '
          '${(GameController.refiMaxLtv * 100).toStringAsFixed(0)}% of value, '
          'after ~2% closing costs. Your monthly payment resets higher. This is '
          'how you keep your money working without selling.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Refinance')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final err = game.refinance(holding);
    _toast(context,
        err ?? 'Refinanced ${def.name} — pulled ${money(cashOut)} in cash.');
  }

  Future<void> _renovate(BuildContext context) async {
    final def = Properties.byId(holding.defId);
    final amount = await showAmountSheet(
      context,
      title: 'Renovate ${def.name}',
      actionLabel: 'Renovate',
      max: game.cash,
      helper: 'Spend cash to force appreciation. A fresh home hands back ~2.2× '
          'the budget in value AND rents for noticeably more; returns fade the '
          'more you pour in. Current value ${money(holding.currentValue)}.',
    );
    if (amount == null || !context.mounted) return;
    final err = game.renovate(holding, amount);
    _toast(context, err ?? 'Renovated ${def.name} for ${money(amount)}.');
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
    final muted = theme.textTheme.labelSmall
        ?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final incomeLine = def.rentable
        ? 'rent ${(def.rentYield * 100).toStringAsFixed(2)}%/mo · '
            '${(def.occupancy * 100).toStringAsFixed(0)}% occupancy'
        : 'no rent — pure appreciation play';
    return Card(
      child: ListTile(
        isThreeLine: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        leading: Icon(_categoryIcon(def.category)),
        title: Text(def.name),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
                '${def.tierLabel} • ${pct(def.monthlyAppreciation * 12)}/yr growth',
                style: theme.textTheme.bodySmall),
            Text(incomeLine, style: muted),
            Text(def.blurb,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: muted?.copyWith(fontStyle: FontStyle.italic)),
          ],
        ),
        trailing: Text(moneyCompact(price),
            style: theme.textTheme.titleSmall
                ?.copyWith(fontWeight: FontWeight.bold)),
        onTap: () => _showBuySheet(context, game, def),
      ),
    );
  }
}

/// Per-category icon for listings and owned cards.
IconData _categoryIcon(PropertyCategory c) {
  switch (c) {
    case PropertyCategory.house:
      return Icons.home_outlined;
    case PropertyCategory.apartment:
      return Icons.apartment;
    case PropertyCategory.business:
      return Icons.storefront_outlined;
    case PropertyCategory.land:
      return Icons.terrain_outlined;
    case PropertyCategory.other:
      return Icons.category_outlined;
  }
}

/// A category section header in the market list: emoji, name, one-line pitch.
class _CategoryHeader extends StatelessWidget {
  const _CategoryHeader({required this.category});
  final PropertyCategory category;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final info = Properties.categoryInfo[category]!;
    return Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${info.emoji}  ${info.label}',
              style: theme.textTheme.titleSmall
                  ?.copyWith(fontWeight: FontWeight.bold)),
          Text(info.pitch,
              style: theme.textTheme.labelSmall
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        ],
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
    final rate = g.effectiveMortgageRate(_mortgage);
    final payment = mortgageMonthlyPayment(loan, rate, _mortgage.termMonths);
    // The payment is judged against salary + the rent your tenants pay (a 75%
    // haircut), not salary alone — so good rental income lets you keep scaling.
    final income = g.qualifyingIncome;
    final dti = income <= 0 ? 1.0 : payment / income;
    final tooExpensive =
        loan > 0 && payment > income * GameController.maxPaymentShare;
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
                    label: Text('${m.name} · ${pct(g.effectiveMortgageRate(m))}'),
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
            _row(theme, '% of pay + rents', pct(dti),
                color: tooExpensive ? kLoss : null),
            if (tooExpensive)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  'Payment exceeds 45% of your salary plus rental income. Earn '
                  'more, rent out a home, or put more down.',
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
