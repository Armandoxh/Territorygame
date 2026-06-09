import 'package:flutter/material.dart';

import '../data/businesses.dart';
import '../models/business.dart';
import '../state/game_controller.dart';
import '../util/format.dart';
import 'widgets/amount_sheet.dart';
import 'widgets/ui_helpers.dart';

/// "Main Street" — buy and run operating businesses. Each pays monthly profit
/// (swinging with the economy), is worth a multiple of its earnings, and can be
/// grown or sold. Run a couple yourself for full profit, or hire managers to
/// scale (for a cut). Higher returns than stocks/real estate — but illiquid,
/// hands-on, and some can fail.
class BusinessBody extends StatelessWidget {
  const BusinessBody({super.key, required this.game});

  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: theme.colorScheme.primary.withOpacity(0.10),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            'Own a business and it pays you profit every month — and is worth '
            'about ${_yieldHint}× its annual earnings if you sell. Profit swings '
            'with the economy. You can run ${GameController.activeBusinessLimit} '
            'yourself at full tilt; hire a manager to go passive (they take a '
            'cut). Reinvest to grow it, then exit at a multiple.',
            style: theme.textTheme.bodySmall,
          ),
        ),
        if (game.businesses.isNotEmpty) ..._owned(theme),
        Text('Start a business', style: theme.textTheme.titleMedium),
        const SizedBox(height: 4),
        for (final cat in Businesses.categoriesInOrder) ...[
          _CategoryHeader(category: cat),
          ...Businesses.inCategory(cat)
              .map((d) => _BizListing(game: game, def: d)),
          const SizedBox(height: 12),
        ],
      ],
    );
  }

  static const _yieldHint = '3–6';

  List<Widget> _owned(ThemeData theme) {
    final totalValue = game.businessesValue;
    return [
      Row(
        children: [
          Expanded(
              child: Text('Your businesses',
                  style: theme.textTheme.titleMedium)),
          Text('${money(totalValue)} value',
              style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: theme.colorScheme.primary)),
        ],
      ),
      if (game.businessesOverextended)
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            '⚠ You\'re running ${game.businesses.where((b) => !b.managed).length} '
            'businesses yourself — spread too thin, each unmanaged one runs at '
            '${(game.businessAttention * 100).toStringAsFixed(0)}%. Hire managers.',
            style: theme.textTheme.bodySmall?.copyWith(color: kLoss),
          ),
        ),
      const SizedBox(height: 6),
      ...game.businesses.map((b) => _OwnedBizCard(game: game, holding: b)),
      const SizedBox(height: 16),
    ];
  }
}

String _cycleTag(double c) => c < 0.25
    ? 'recession-proof'
    : c < 0.55
        ? 'moderate cycle'
        : 'very cyclical';

class _CategoryHeader extends StatelessWidget {
  const _CategoryHeader({required this.category});
  final BusinessCategory category;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final info = Businesses.categoryInfo[category]!;
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

class _BizListing extends StatelessWidget {
  const _BizListing({required this.game, required this.def});
  final GameController game;
  final BusinessDef def;

  Future<void> _buy(BuildContext context) async {
    final yieldPct = def.baseMonthlyProfit * 12 / def.price;
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('Start ${def.name}?'),
        content: Text(
          'Pay ${money(def.price)} in cash. It throws off about '
          '${money(def.baseMonthlyProfit)}/mo to start (~${pct(yieldPct)}/yr), '
          'swinging with the economy. ${_cycleTag(def.cyclicality)}'
          '${def.failureRisk > 0 ? ', and it can fail in a downturn' : ''}. '
          'Sells for ~${def.saleMultiple.toStringAsFixed(1)}× annual profit.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Start it')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final err = game.buyBusiness(def);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
          SnackBar(content: Text(err ?? 'Opened ${def.name}. Good luck!')));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final yieldPct = def.baseMonthlyProfit * 12 / def.price;
    final affordable = def.price <= game.cash + 0.01;
    return Card(
      child: Opacity(
        opacity: affordable ? 1 : 0.55,
        child: ListTile(
          isThreeLine: true,
          leading: Text(def.emoji, style: const TextStyle(fontSize: 24)),
          title: Text(def.name),
          subtitle: Text(
            '${money(def.baseMonthlyProfit)}/mo · ${pct(yieldPct)}/yr · '
            '${_cycleTag(def.cyclicality)}'
            '${def.failureRisk > 0 ? ' · can fail' : ''}\n${def.blurb}',
            style: theme.textTheme.bodySmall,
          ),
          trailing: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(moneyCompact(def.price),
                  style: theme.textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              FilledButton.tonal(
                onPressed: affordable ? () => _buy(context) : null,
                style: FilledButton.styleFrom(
                    visualDensity: VisualDensity.compact),
                child: const Text('Start'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OwnedBizCard extends StatelessWidget {
  const _OwnedBizCard({required this.game, required this.holding});
  final GameController game;
  final BusinessHolding holding;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final def = Businesses.byId(holding.defId);
    return Card(
      child: InkWell(
        onTap: () => showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          showDragHandle: true,
          builder: (_) => _BizDetailSheet(game: game, holding: holding),
        ),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Text(def.emoji, style: const TextStyle(fontSize: 22)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(holding.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall
                            ?.copyWith(fontWeight: FontWeight.bold)),
                    Text(
                      holding.managed ? 'Manager-run' : 'You run it',
                      style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('${money(holding.monthlyProfit)}/mo',
                      style: theme.textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.bold, color: kGain)),
                  Text('${money(game.businessValue(holding))} value',
                      style: theme.textTheme.bodySmall),
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
}

class _BizDetailSheet extends StatelessWidget {
  const _BizDetailSheet({required this.game, required this.holding});
  final GameController game;
  final BusinessHolding holding;

  Future<void> _expand(BuildContext context) async {
    final amount = await showAmountSheet(
      context,
      title: 'Expand ${holding.name}',
      actionLabel: 'Invest',
      max: game.cash,
      helper: 'Spend cash to permanently raise monthly profit (diminishing '
          'returns, some execution luck). Current profit '
          '${money(holding.monthlyProfit)}/mo.',
    );
    if (amount == null || !context.mounted) return;
    final err = game.expandBusiness(holding, amount);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
          SnackBar(content: Text(err ?? 'Reinvested ${money(amount)}.')));
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: game,
      builder: (context, _) {
        if (!game.businesses.contains(holding)) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            final nav = Navigator.of(context);
            if (nav.canPop()) nav.pop();
          });
          return const SizedBox.shrink();
        }
        final theme = Theme.of(context);
        final def = Businesses.byId(holding.defId);
        final cut = holding.managed
            ? holding.monthlyProfit * def.managerCut
            : 0.0;
        return Padding(
          padding: EdgeInsets.fromLTRB(
              20, 0, 20, MediaQuery.of(context).viewInsets.bottom + 20),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(holding.name, style: theme.textTheme.titleLarge),
                Text('${def.emoji} ${def.name} · ${_cycleTag(def.cyclicality)}',
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                const SizedBox(height: 12),
                _kv(theme, 'Run-rate profit', '${money(holding.monthlyProfit)}/mo'),
                _kv(theme, 'Enterprise value', money(game.businessValue(holding))),
                _kv(theme, 'Invested so far',
                    money(holding.purchasePrice + holding.investedCapital)),
                if (holding.managed)
                  _kv(theme, 'Manager\'s cut',
                      '−${money(cut)}/mo (${pct(def.managerCut)})',
                      color: kLoss),
                if (!holding.managed && game.businessesOverextended)
                  _kv(theme, 'Spread thin',
                      '${(game.businessAttention * 100).toStringAsFixed(0)}% efficiency',
                      color: kLoss),
                const Divider(height: 24),
                Wrap(
                  alignment: WrapAlignment.end,
                  spacing: 8,
                  children: [
                    TextButton(
                      onPressed: () => _expand(context),
                      child: const Text('Expand'),
                    ),
                    TextButton(
                      onPressed: () => game.toggleManager(holding),
                      child: Text(holding.managed
                          ? 'Self-manage'
                          : 'Hire manager (−${pct(def.managerCut)})'),
                    ),
                    OutlinedButton(
                      onPressed: () {
                        final messenger = ScaffoldMessenger.of(context);
                        final value = game.businessValue(holding);
                        final err = game.sellBusiness(holding);
                        messenger
                          ..hideCurrentSnackBar()
                          ..showSnackBar(SnackBar(
                              content: Text(err ??
                                  'Sold ${holding.name} (~${money(value)}).')));
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
}

Widget _kv(ThemeData theme, String k, String v, {Color? color}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
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
