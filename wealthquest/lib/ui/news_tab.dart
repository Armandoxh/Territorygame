import 'package:flutter/material.dart';

import '../data/catalog.dart';
import '../models/asset.dart';
import '../models/climate.dart';
import '../models/rumor.dart';
import '../state/game_controller.dart';
import '../util/format.dart';
import 'asset_detail_screen.dart';
import 'widgets/ui_helpers.dart';

/// "The Daily Ledger" — a newspaper of rumors, now split into scannable
/// sections (stocks, ETFs, crypto, bonds) plus quick real-estate and sports
/// reads. Tips hint at where prices are headed, but they're a coin flip.
class NewsTab extends StatelessWidget {
  const NewsTab({super.key, required this.game});

  final GameController game;

  /// Order + heading (with emoji) for each market-rumor category.
  static const List<AssetKind> _order = [
    AssetKind.stock,
    AssetKind.etf,
    AssetKind.crypto,
    AssetKind.bond,
  ];

  static String _heading(AssetKind k) {
    switch (k) {
      case AssetKind.stock:
        return '📈  Stocks';
      case AssetKind.etf:
        return '🧺  ETFs';
      case AssetKind.crypto:
        return '🪙  Crypto';
      case AssetKind.bond:
        return '📜  Bonds';
      default:
        return k.label;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Group this month's rumors by asset kind.
    final byKind = <AssetKind, List<Rumor>>{};
    for (final r in game.currentRumors) {
      final k = Catalog.assetById(r.assetId).kind;
      byKind.putIfAbsent(k, () => []).add(r);
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
      children: [
        Center(
          child: Column(
            children: [
              Text(
                'THE DAILY LEDGER',
                textAlign: TextAlign.center,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.5,
                ),
              ),
              Text(
                'Month ${game.day}  •  Age ${game.ageYears}',
                style: theme.textTheme.labelMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
        const Divider(thickness: 2, height: 24),

        _climateBanner(theme),

        // Market tips, grouped by category.
        if (game.currentRumors.isEmpty)
          Text('Quiet month on the markets — no rumors circulating.',
              style: theme.textTheme.bodyMedium)
        else
          for (final k in _order)
            if (byKind[k] != null)
              _Section(
                title: _heading(k),
                children: [
                  for (final r in byKind[k]!) _RumorRow(game: game, rumor: r),
                ],
              ),

        // Real estate + sports quick reads (always present).
        _Section(title: '🏠  Real Estate', children: [_realEstateLine(theme)]),
        _Section(title: '🏈  Sports', children: [_sportsLine(theme)]),

        if (game.lastResolved.isNotEmpty)
          _Section(
            title: '🗞️  Last Month, Settled',
            children: [
              for (final r in game.lastResolved) _ResolvedRow(rumor: r),
            ],
          ),
      ],
    );
  }

  Widget _realEstateLine(ThemeData theme) {
    final reg = game.regime;
    final String text;
    if (reg == MarketRegime.boom || reg == MarketRegime.recovery) {
      text = 'Buyers are out in force — homes move fast and prices are firming.';
    } else if (reg == MarketRegime.downturn || reg == MarketRegime.crash) {
      text = 'The market is cooling; sellers are trimming prices to close deals.';
    } else {
      text = 'Housing is steady this month — slow, dependable appreciation.';
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Text(text, style: theme.textTheme.bodyMedium),
    );
  }

  Widget _sportsLine(ThemeData theme) {
    final n = game.sportsSlate.length;
    final open = game.bets.length;
    final text = n == 0
        ? 'No games on the board right now.'
        : '$n games on the board this month'
            '${open > 0 ? ' · you have $open open bet${open == 1 ? '' : 's'}' : ''}'
            '. Place a wager in DraftDay.';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Text(text, style: theme.textTheme.bodyMedium),
    );
  }

  Widget _climateBanner(ThemeData theme) {
    final reg = game.regime;
    final bad = reg == MarketRegime.downturn || reg == MarketRegime.crash;
    final good = reg == MarketRegime.boom || reg == MarketRegime.recovery;
    final c = bad ? kLoss : (good ? kGain : theme.colorScheme.onSurfaceVariant);
    final ev = game.sectorEvent;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: c.withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.withOpacity(0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(reg.emoji, style: const TextStyle(fontSize: 18)),
              const SizedBox(width: 8),
              Text(
                'Market climate: ${reg.label}',
                style: theme.textTheme.titleSmall
                    ?.copyWith(color: c, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(reg.blurb, style: theme.textTheme.bodySmall),
          if (ev != null) ...[
            const SizedBox(height: 6),
            Text(
              '${ev.isRally ? '▲' : '▼'} ${ev.headline}',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: ev.isRally ? kGain : kLoss),
            ),
          ],
        ],
      ),
    );
  }
}

/// A titled group of news rows with a thin divider header.
class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 14, bottom: 2),
          child: Text(
            title,
            style: theme.textTheme.titleSmall
                ?.copyWith(fontWeight: FontWeight.bold),
          ),
        ),
        const Divider(height: 8),
        ...children,
      ],
    );
  }
}

/// A compact, one-glance market tip: direction icon, short headline, ticker.
class _RumorRow extends StatelessWidget {
  const _RumorRow({required this.game, required this.rumor});

  final GameController game;
  final Rumor rumor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final def = Catalog.assetById(rumor.assetId);
    final color = rumor.isBullish ? kGain : kLoss;

    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => AssetDetailScreen(game: game, def: def),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(rumor.isBullish ? Icons.trending_up : Icons.trending_down,
                color: color, size: 18),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                '"${rumor.headline}"',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodyMedium
                    ?.copyWith(fontStyle: FontStyle.italic, height: 1.2),
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: color.withOpacity(0.15),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(def.ticker,
                  style: theme.textTheme.labelSmall
                      ?.copyWith(color: color, fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      ),
    );
  }
}

class _ResolvedRow extends StatelessWidget {
  const _ResolvedRow({required this.rumor});

  final Rumor rumor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final def = Catalog.assetById(rumor.assetId);
    final stampColor = rumor.cameTrue ? kGain : kLoss;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              border: Border.all(color: stampColor, width: 1.5),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              rumor.cameTrue ? 'TRUE' : 'FALSE',
              style: theme.textTheme.labelSmall?.copyWith(
                color: stampColor,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(rumor.headline,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall),
                Text(
                  '${def.ticker} moved ${signedPct(rumor.actualMove)} that month',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: gainColor(rumor.actualMove),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
