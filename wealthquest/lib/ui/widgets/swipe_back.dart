import 'package:flutter/material.dart';

/// Wraps a screen so a horizontal swipe pops it instantly via the Flutter
/// navigator — instead of falling through to the browser's back gesture, which
/// reloads the whole web app and feels slow.
///
/// Accepts a fling in either direction (the drill-in has no other horizontal
/// action) so "swipe to go back" just works whichever way the thumb moves.
class SwipeBack extends StatelessWidget {
  const SwipeBack({super.key, required this.child, this.threshold = 280});

  final Widget child;
  final double threshold;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onHorizontalDragEnd: (details) {
        final v = details.primaryVelocity ?? 0;
        if (v.abs() > threshold && Navigator.of(context).canPop()) {
          Navigator.of(context).maybePop();
        }
      },
      child: child,
    );
  }
}
