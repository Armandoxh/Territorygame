import 'package:flutter/material.dart';

import '../data/rivals.dart';
import '../state/game_controller.dart';
import '../util/format.dart';

/// "Rivals" — the Joneses. A live leaderboard ranking you against six NPCs
/// whose fortunes grow (and swing) over the years. Climbing it is the point.
class RivalsBody extends StatelessWidget {
  const RivalsBody({super.key, required this.game});

  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Build the board: you + every rival, sorted by current net worth.
    final entries = <_Entry>[
      _Entry('You', '🧑', game.netWorth, true, 'This is your run.'),
      for (final r in Rivals.all)
        _Entry(r.name, r.emoji, r.netWorthAt(game.day), false, r.blurb),
    ]..sort((a, b) => b.netWorth.compareTo(a.netWorth));
    final yourRank = entries.indexWhere((e) => e.you) + 1;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: theme.colorScheme.primary.withOpacity(0.10),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('You\'re #$yourRank of ${entries.length}',
                  style: theme.textTheme.titleLarge
                      ?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              Text(
                yourRank == 1
                    ? 'Top of the heap. Keep them behind you.'
                    : 'Outgrow the Joneses. The leaders aren\'t slowing down.',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
        for (var i = 0; i < entries.length; i++)
          _RankTile(rank: i + 1, entry: entries[i]),
      ],
    );
  }
}

class _Entry {
  _Entry(this.name, this.emoji, this.netWorth, this.you, this.blurb);
  final String name;
  final String emoji;
  final double netWorth;
  final bool you;
  final String blurb;
}

class _RankTile extends StatelessWidget {
  const _RankTile({required this.rank, required this.entry});
  final int rank;
  final _Entry entry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final medal = rank == 1
        ? '🥇'
        : rank == 2
            ? '🥈'
            : rank == 3
                ? '🥉'
                : '#$rank';
    return Card(
      color: entry.you ? theme.colorScheme.primary.withOpacity(0.14) : null,
      shape: entry.you
          ? RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(color: theme.colorScheme.primary, width: 1.5))
          : null,
      child: ListTile(
        leading: SizedBox(
          width: 34,
          child: Center(
              child: Text(medal, style: theme.textTheme.titleMedium)),
        ),
        title: Text('${entry.emoji}  ${entry.name}',
            style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: entry.you ? FontWeight.bold : FontWeight.w600)),
        subtitle: Text(entry.blurb,
            maxLines: 1, overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall),
        trailing: Text(moneyWhole(entry.netWorth),
            style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: entry.you ? theme.colorScheme.primary : null)),
      ),
    );
  }
}
