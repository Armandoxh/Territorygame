import 'package:flutter/material.dart';

import '../data/catalog.dart';
import '../models/climate.dart';
import '../models/rumor.dart';
import '../state/game_controller.dart';
import '../util/format.dart';
import 'asset_detail_screen.dart';
import 'widgets/ui_helpers.dart';

/// "The Daily Ledger" — a newspaper of rumors. Tips hint at where prices are
/// headed, but the rumor mill is only right some of the time (25% at base).
class NewsTab extends StatelessWidget {
  const NewsTab({super.key, required this.game});

  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
      children: [
        // Masthead
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

        _sectionTitle(theme, 'Word on the Street'),
        Text(
          game.reliabilityRevealed
              ? 'Tips are running about ${pct(0.50)} accurate. Trade carefully.'
              : 'Tips are a coin flip — about half pan out. (A reliability upgrade is coming.)',
          style: theme.textTheme.bodySmall?.copyWith(
            fontStyle: FontStyle.italic,
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 8),
        if (game.currentRumors.isEmpty)
          Text('Quiet month. No rumors circulating.',
              style: theme.textTheme.bodyMedium)
        else
          ...game.currentRumors.map((r) => _RumorCard(game: game, rumor: r)),

        if (game.lastResolved.isNotEmpty) ...[
          const SizedBox(height: 16),
          _sectionTitle(theme, 'Last Month, Settled'),
          const SizedBox(height: 4),
          ...game.lastResolved.map((r) => _ResolvedRow(rumor: r)),
        ],
      ],
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

  Widget _sectionTitle(ThemeData theme, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Text(
        text,
        style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
      ),
    );
  }
}

class _RumorCard extends StatelessWidget {
  const _RumorCard({required this.game, required this.rumor});

  final GameController game;
  final Rumor rumor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final def = Catalog.assetById(rumor.assetId);
    final color = rumor.isBullish ? kGain : kLoss;

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => AssetDetailScreen(game: game, def: def),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(rumor.isBullish ? Icons.trending_up : Icons.trending_down,
                  color: color),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '"${rumor.headline}"',
                      style: theme.textTheme.bodyLarge?.copyWith(
                        fontStyle: FontStyle.italic,
                        height: 1.25,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${rumor.isBullish ? 'Bullish' : 'Bearish'} tip • ${def.ticker} • ${def.name}',
                      style: theme.textTheme.labelMedium?.copyWith(color: color),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, size: 18),
            ],
          ),
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
                Text(rumor.headline, style: theme.textTheme.bodySmall),
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
