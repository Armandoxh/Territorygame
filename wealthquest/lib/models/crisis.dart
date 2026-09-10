import 'dart:math';

import '../state/game_controller.dart';
import 'crisis_category.dart';

export 'crisis_category.dart';

/// One option in a crisis/decision event. [apply] mutates the game and returns
/// a short line describing what happened (shown back to the player).
class CrisisChoice {
  final String label;
  final String Function(GameController g, Random rng) apply;
  const CrisisChoice(this.label, this.apply);
}

/// A life event that interrupts the month with a decision. Stakes generally
/// scale with net worth so they stay meaningful deep into a rich game.
class CrisisEvent {
  final String id;
  final String emoji;
  final String title;
  final String body;

  /// Whether this event can fire right now (e.g. only in a downturn).
  final bool Function(GameController g) eligible;

  /// Net-worth band in which this event appears. Cheap everyday events start at
  /// 0; bigger, pricier events only unlock once you're wealthy. A few petty
  /// ones set [maxNetWorth] so they stop bothering a tycoon.
  final double minNetWorth;
  final double maxNetWorth;

  /// Which shield (if any) softens this event's out-of-pocket cost. Most events
  /// are tagged at the aggregation point in `crises.dart`, not here.
  final CrisisCategory category;

  final List<CrisisChoice> choices;

  CrisisEvent({
    required this.id,
    required this.emoji,
    required this.title,
    required this.body,
    required this.choices,
    this.eligible = _always,
    this.minNetWorth = 0,
    this.maxNetWorth = double.infinity,
    this.category = CrisisCategory.none,
  });

  /// Same event, retagged with an insurance [category]. Used to stamp a whole
  /// themed pack (or a base event) with its coverage in one place.
  CrisisEvent copyWith({CrisisCategory? category}) => CrisisEvent(
        id: id,
        emoji: emoji,
        title: title,
        body: body,
        choices: choices,
        eligible: eligible,
        minNetWorth: minNetWorth,
        maxNetWorth: maxNetWorth,
        category: category ?? this.category,
      );
}

bool _always(GameController g) => true;
