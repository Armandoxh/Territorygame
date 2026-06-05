import 'dart:math';

import '../models/bet.dart';

/// Generates the weekly betting slate. The house takes a [vig] so every bet is
/// negative expected value — it's a thrill, not a strategy.
class SportsEngine {
  SportsEngine._();

  /// House edge baked into the offered odds (~6%).
  static const double vig = 0.06;

  static const int eventsPerSlate = 5;

  static const List<String> _teams = [
    'Lions', 'Bears', 'Sharks', 'Eagles', 'Titans', 'Cobras', 'Wolves',
    'Hawks', 'Bulls', 'Rams', 'Kings', 'Jets', 'Storm', 'Flames', 'Pythons',
    'Raptors', 'Comets', 'Bandits',
  ];

  /// [name, emoji] per sport — the slate has a section for each.
  static const List<List<String>> sports = [
    ['Football', '🏈'],
    ['Basketball', '🏀'],
    ['Baseball', '⚾'],
    ['Soccer', '⚽'],
    ['Hockey', '🏒'],
    ['Tennis', '🎾'],
  ];

  static const int gamesPerSport = 2;

  static List<SportsEvent> generateSlate(Random rng, int startId) {
    final events = <SportsEvent>[];
    var id = startId;
    for (final s in sports) {
      final pool = List<String>.of(_teams)..shuffle(rng);
      for (var g = 0; g < gamesPerSport; g++) {
        final p = 0.30 + rng.nextDouble() * 0.40; // home win prob 0.30–0.70
        events.add(SportsEvent(
          id: id++,
          sportName: s[0],
          sport: s[1],
          home: pool[g * 2],
          away: pool[g * 2 + 1],
          homeProb: p,
          // Fair payout shaved by the vig -> EV per $1 is exactly -vig per leg.
          homeDecimal: (1 / p) * (1 - vig),
          awayDecimal: (1 / (1 - p)) * (1 - vig),
        ));
      }
    }
    return events;
  }

  /// Decimal odds -> American odds string, the way a sportsbook shows them.
  static String american(double decimal) {
    if (decimal >= 2) return '+${((decimal - 1) * 100).round()}';
    return '-${(100 / (decimal - 1)).round()}';
  }
}
