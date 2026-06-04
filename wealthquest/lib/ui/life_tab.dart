import 'package:flutter/material.dart';

import '../data/catalog.dart';
import '../models/job.dart';
import '../state/game_controller.dart';
import '../util/format.dart';

class LifeTab extends StatelessWidget {
  const LifeTab({super.key, required this.game});

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
                Text('You', style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                _kv(theme, 'Age', '${game.ageYears}'),
                _kv(theme, 'Years played', '${game.yearsPlayed}'),
                _kv(theme, 'Current job', game.job.title),
                _kv(theme, 'Monthly pay', money(game.job.pay)),
                _kv(theme, 'Monthly expenses', money(game.dailyExpenses)),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text('Career', style: theme.textTheme.titleMedium),
        const SizedBox(height: 4),
        Text(
          'Better jobs unlock as you age. Take one to raise your salary.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 8),
        ...Catalog.jobs.map((j) => _JobTile(game: game, job: j)),
      ],
    );
  }

  Widget _kv(ThemeData theme, String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(k,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              )),
          Text(v,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _JobTile extends StatelessWidget {
  const _JobTile({required this.game, required this.job});

  final GameController game;
  final JobDef job;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isCurrent = job.id == game.job.id;
    final unlocked = game.ageYears >= job.minAge;

    Widget trailing;
    if (isCurrent) {
      trailing = Chip(
        label: const Text('Current'),
        backgroundColor: theme.colorScheme.primary.withOpacity(0.25),
      );
    } else if (unlocked) {
      trailing = FilledButton.tonal(
        onPressed: () => game.takeJob(job),
        child: const Text('Take'),
      );
    } else {
      trailing = Text('Age ${job.minAge}',
          style: theme.textTheme.labelMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ));
    }

    return Card(
      child: Opacity(
        opacity: unlocked ? 1 : 0.5,
        child: ListTile(
          leading: Icon(unlocked ? Icons.work_outline : Icons.lock_outline),
          title: Text(job.title),
          subtitle: Text('${money(job.pay)} / month'),
          trailing: trailing,
        ),
      ),
    );
  }
}
