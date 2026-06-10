import 'package:flutter/material.dart';

import '../data/catalog.dart';
import '../models/asset.dart';
import '../state/game_controller.dart';
import '../util/format.dart';

/// "Prestige" — a live view of the permanent perks you've earned by retiring and
/// starting over, your progress toward the next retirement, and a preview of
/// what the next prestige level unlocks. Prestige never hands out cash; it
/// permanently widens the world (new careers + investments) that every fresh
/// life begins with.
class PrestigeBody extends StatelessWidget {
  const PrestigeBody({super.key, required this.game});

  final GameController game;

  static const Color _gold = Color(0xFFB8860B);
  static const Color _goldBright = Color(0xFFE6B800);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final level = game.prestige;

    // Every prestige-gated perk (career tracks + investments), tagged with the
    // level that unlocks it.
    final perks = <_Perk>[
      for (final t in Catalog.careerTracks)
        if (t.unlockLevel >= 1)
          _Perk(t.unlockLevel, '${t.emoji} ${t.name}', 'Career path', t.blurb,
              Icons.work_outline),
      for (final a in Catalog.assets)
        if (a.unlockLevel >= 1)
          _Perk(
              a.unlockLevel,
              a.name,
              a.kind.label,
              a.blurb,
              a.kind == AssetKind.commodity
                  ? Icons.diamond_outlined
                  : Icons.trending_up),
    ]..sort((x, y) => x.level.compareTo(y.level));

    final active = perks.where((p) => p.level <= level).toList();
    final nextLevel = level + 1;
    final next = perks.where((p) => p.level == nextLevel).toList();

    final progress =
        (game.netWorth / GameController.retireThreshold).clamp(0.0, 1.0);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
      children: [
        // Hero: current prestige.
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [_gold.withOpacity(0.35), Colors.transparent],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: _gold.withOpacity(0.5)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.auto_awesome, color: _goldBright),
                  const SizedBox(width: 8),
                  Text(level > 0 ? '★ Prestige $level' : 'Prestige 0',
                      style: theme.textTheme.headlineSmall
                          ?.copyWith(fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                level > 0
                    ? 'You\'ve retired $level time${level == 1 ? '' : 's'}. '
                        'These perks are permanent — every new life starts with them.'
                    : 'No retirements yet. Reach \$1M net worth and retire to '
                        'earn your first permanent perks.',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // Progress toward the next retirement.
        _sectionTitle(theme, 'Progress to Prestige $nextLevel'),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(
            value: progress,
            minHeight: 10,
            backgroundColor: theme.colorScheme.surfaceContainerHighest,
            valueColor: const AlwaysStoppedAnimation(_goldBright),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          game.canRetire
              ? 'Eligible to retire now — head to the home screen to begin '
                  'Prestige $nextLevel.'
              : '${moneyWhole(game.netWorth)} of '
                  '${moneyWhole(GameController.retireThreshold)} net worth needed '
                  'to retire.',
          style: theme.textTheme.bodySmall
              ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 22),

        // Active perks.
        _sectionTitle(theme, level > 0 ? 'Active perks' : 'Active perks (none yet)'),
        const SizedBox(height: 8),
        if (active.isEmpty)
          _note(theme,
              'Nothing unlocked yet. Your first retirement unlocks the perks below.')
        else
          for (final p in active) _PerkTile(perk: p, locked: false),

        const SizedBox(height: 22),

        // Next-life preview.
        if (next.isNotEmpty) ...[
          _sectionTitle(theme, 'Unlocks at Prestige $nextLevel'),
          const SizedBox(height: 8),
          for (final p in next) _PerkTile(perk: p, locked: true),
        ] else ...[
          _sectionTitle(theme, 'What\'s next'),
          const SizedBox(height: 8),
          _note(theme,
              'You\'ve unlocked everything available so far — more prestige tiers are coming.'),
        ],
      ],
    );
  }

  Widget _sectionTitle(ThemeData theme, String text) => Text(
        text.toUpperCase(),
        style: theme.textTheme.labelMedium?.copyWith(
          fontWeight: FontWeight.w800,
          letterSpacing: 1.0,
          color: theme.colorScheme.onSurfaceVariant,
        ),
      );

  Widget _note(ThemeData theme, String text) => Text(
        text,
        style: theme.textTheme.bodyMedium
            ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
      );
}

class _Perk {
  const _Perk(this.level, this.name, this.kind, this.blurb, this.icon);
  final int level;
  final String name;
  final String kind;
  final String blurb;
  final IconData icon;
}

class _PerkTile extends StatelessWidget {
  const _PerkTile({required this.perk, required this.locked});

  final _Perk perk;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Opacity(
      opacity: locked ? 0.6 : 1,
      child: Card(
        child: ListTile(
          isThreeLine: true,
          leading: Icon(
            locked ? Icons.lock_outline : perk.icon,
            color: locked
                ? theme.colorScheme.outline
                : const Color(0xFFE6B800),
          ),
          title: Row(
            children: [
              Flexible(child: Text(perk.name)),
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withOpacity(0.14),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(perk.kind,
                    style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.primary,
                        fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(perk.blurb,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall),
          ),
        ),
      ),
    );
  }
}
