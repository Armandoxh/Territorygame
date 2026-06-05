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

  static const List<String> _sports = ['🏈', '🏀', '⚾', '⚽', '🏒', '🎾'];

  static List<SportsEvent> generateSlate(Random rng, int startId) {
    final pool = List<String>.of(_teams)..shuffle(rng);
    final events = <SportsEvent>[];
    var id = startId;
    for (var i = 0;
        i + 1 < pool.length && events.length < eventsPerSlate;
        i += 2) {
      final p = 0.30 + rng.nextDouble() * 0.40; // home win prob 0.30–0.70
      events.add(SportsEvent(
        id: id++,
        sport: _sports[rng.nextInt(_sports.length)],
        home: pool[i],
        away: pool[i + 1],
        homeProb: p,
        // Fair payout shaved by the vig -> EV per $1 is exactly -vig on each side.
        homeDecimal: (1 / p) * (1 - vig),
        awayDecimal: (1 / (1 - p)) * (1 - vig),
      ));
    }
    return events;
  }

  /// Decimal odds -> American odds string, the way a sportsbook shows them.
  static String american(double decimal) {
    if (decimal >= 2) return '+${((decimal - 1) * 100).round()}';
    return '-${(100 / (decimal - 1)).round()}';
  }
}
