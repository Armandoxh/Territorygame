import 'package:flutter/material.dart';

import '../../state/game_controller.dart';
import 'lucide.dart';

/// A dismissible bar pinned to the top of an app, recapping the notifications
/// that arrived for it since you last looked. It snapshots the unread items
/// when the app opens, then clears that app's red badge — so walking into an
/// app both shows you what's new and marks it seen.
class AppNotificationBar extends StatefulWidget {
  const AppNotificationBar({
    super.key,
    required this.game,
    required this.appId,
  });

  final GameController game;
  final String appId;

  @override
  State<AppNotificationBar> createState() => _AppNotificationBarState();
}

class _AppNotificationBarState extends State<AppNotificationBar> {
  late final List<String> _items;
  bool _dismissed = false;

  @override
  void initState() {
    super.initState();
    final unread = widget.game.appUnread[widget.appId] ?? 0;
    final feed = widget.game.appFeed[widget.appId] ?? const <String>[];
    // The feed is newest-first, so the unread ones are the first [unread].
    _items = unread > 0 ? feed.take(unread).toList() : <String>[];
    // Clear the badge now that we've captured what to show.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.game.markAppRead(widget.appId);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_dismissed || _items.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.primary.withOpacity(0.10),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 8, 4, 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 2, right: 8),
              child:
                  Lucide('info', size: 16, color: theme.colorScheme.primary),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _items.length == 1 ? '1 new alert' : '${_items.length} new alerts',
                    style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.primary,
                        fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 2),
                  for (final n in _items)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(n, style: theme.textTheme.bodySmall),
                    ),
                ],
              ),
            ),
            IconButton(
              icon: Lucide('x',
                  size: 16, color: theme.colorScheme.onSurfaceVariant),
              visualDensity: VisualDensity.compact,
              tooltip: 'Dismiss',
              onPressed: () => setState(() => _dismissed = true),
            ),
          ],
        ),
      ),
    );
  }
}

/// The small red count badge that sits on an app icon on the home screen.
class NotificationBadge extends StatelessWidget {
  const NotificationBadge({super.key, required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return const SizedBox.shrink();
    return Container(
      constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
      padding: const EdgeInsets.symmetric(horizontal: 5),
      decoration: BoxDecoration(
        color: const Color(0xFFE53935),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white, width: 1.5),
      ),
      child: Center(
        child: Text(
          count > 9 ? '9+' : '$count',
          style: const TextStyle(
            color: Colors.white,
            fontSize: 11,
            fontWeight: FontWeight.bold,
            height: 1.1,
          ),
        ),
      ),
    );
  }
}
