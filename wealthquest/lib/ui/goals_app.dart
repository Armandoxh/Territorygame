import 'package:flutter/material.dart';

import '../data/goals.dart';
import '../state/game_controller.dart';
import 'widgets/lucide.dart';

/// "Goals" — the achievement checklist and your score. Goals auto-complete as
/// you play; the score (and chasing 100%) is the reason to keep going.
class GoalsBody extends StatelessWidget {
  const GoalsBody({super.key, required this.game});

  final GameController game;

  static const Color _gold = Color(0xFFE6B800);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final done = game.completedGoals;
    final total = Goals.all.length;
    final progress = total == 0 ? 0.0 : done.length / total;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [_gold.withOpacity(0.30), Colors.transparent],
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
                  Lucide('trophy', size: 22, color: _gold),
                  const SizedBox(width: 8),
                  Text('Score', style: theme.textTheme.titleMedium),
                  const Spacer(),
                  Text('${game.score}',
                      style: theme.textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.bold, color: _gold)),
                  Text(' / ${Goals.totalPoints}',
                      style: theme.textTheme.titleMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant)),
                ],
              ),
              const SizedBox(height: 10),
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 10,
                  backgroundColor: theme.colorScheme.surfaceContainerHighest,
                  valueColor: const AlwaysStoppedAnimation(_gold),
                ),
              ),
              const SizedBox(height: 6),
              Text('${done.length} of $total goals complete',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            ],
          ),
        ),
        const SizedBox(height: 16),
        for (final group in Goals.groups) ...[
          Padding(
            padding: const EdgeInsets.only(bottom: 6, top: 4),
            child: Text(group.toUpperCase(),
                style: theme.textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.0,
                  color: theme.colorScheme.onSurfaceVariant,
                )),
          ),
          for (final goal in Goals.all.where((x) => x.group == group))
            _GoalTile(goal: goal, done: done.contains(goal.id)),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}

class _GoalTile extends StatelessWidget {
  const _GoalTile({required this.goal, required this.done});

  final Goal goal;
  final bool done;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const gold = GoalsBody._gold;
    return Card(
      color: done ? gold.withOpacity(0.10) : null,
      child: ListTile(
        leading: Lucide(done ? 'circle-check' : 'target',
            color: done ? gold : theme.colorScheme.outline),
        title: Text(goal.title,
            style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: done ? null : theme.colorScheme.onSurfaceVariant)),
        subtitle: Text(goal.detail, style: theme.textTheme.bodySmall),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: (done ? gold : theme.colorScheme.outline).withOpacity(0.16),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text('+${goal.points}',
              style: theme.textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: done ? gold : theme.colorScheme.onSurfaceVariant)),
        ),
      ),
    );
  }
}
