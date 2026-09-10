import 'package:flutter/material.dart';

import '../../models/crisis.dart';
import '../../state/game_controller.dart';

/// A blocking decision dialog for a life crisis/event: read the situation,
/// pick an option, see what happened, continue. Can't be dismissed without
/// choosing.
Future<void> showCrisis(BuildContext context, GameController game) {
  final event = game.pendingCrisis;
  if (event == null) return Future<void>.value();
  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (context) => PopScope(
      canPop: false,
      child: _CrisisDialog(game: game, event: event),
    ),
  );
}

class _CrisisDialog extends StatefulWidget {
  const _CrisisDialog({required this.game, required this.event});

  final GameController game;
  final CrisisEvent event;

  @override
  State<_CrisisDialog> createState() => _CrisisDialogState();
}

class _CrisisDialogState extends State<_CrisisDialog> {
  String? _result;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final e = widget.event;
    final decided = _result != null;
    return AlertDialog(
      title: Row(
        children: [
          Text(e.emoji, style: const TextStyle(fontSize: 22)),
          const SizedBox(width: 10),
          Expanded(child: Text(e.title, style: theme.textTheme.titleLarge)),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(e.body,
              style: decided
                  ? theme.textTheme.bodySmall
                      ?.copyWith(color: theme.colorScheme.onSurfaceVariant)
                  : theme.textTheme.bodyMedium),
          if (decided) ...[
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withOpacity(0.10),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(_result!,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w600)),
            ),
          ],
        ],
      ),
      actions: decided
          ? [
              FilledButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Continue'),
              ),
            ]
          : [
              for (final c in e.choices)
                TextButton(
                  onPressed: () =>
                      setState(() => _result = widget.game.resolveCrisis(c)),
                  child: Text(c.label),
                ),
            ],
    );
  }
}
