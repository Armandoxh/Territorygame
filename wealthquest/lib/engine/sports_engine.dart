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

  /// Player names for prop bets.
  static const List<String> _players = [
    'J. Carter', 'M. Reyes', 'D. Okafor', 'T. Volkov', 'A. Nakamura',
    'R. Mbeki', 'L. Fontaine', 'S. Park', 'K. Andersson', 'C. Rossi',
    'B. Hassan', 'N. Castillo',
  ];

  /// Baseline combined-score total per sport (jittered per game).
  static const Map<String, double> _totalBase = {
    'Football': 44.5,
    'Basketball': 221.5,
    'Baseball': 8.5,
    'Soccer': 2.5,
    'Hockey': 5.5,
    'Tennis': 22.5,
  };

  static const Map<String, String> _totalUnit = {
    'Football': 'pts',
    'Basketball': 'pts',
    'Baseball': 'runs',
    'Soccer': 'goals',
    'Hockey': 'goals',
    'Tennis': 'games',
  };

  /// Two prop stats per sport: [stat label, baseline line].
  static const Map<String, List<List<String>>> _propMenu = {
    'Football': [
      ['passing yds', '268.5'],
      ['rushing yds', '74.5']
    ],
    'Basketball': [
      ['points', '24.5'],
      ['rebounds', '9.5']
    ],
    'Baseball': [
      ['total bases', '1.5'],
      ['strikeouts', '6.5']
    ],
    'Soccer': [
      ['shots', '3.5'],
      ['passes', '58.5']
    ],
    'Hockey': [
      ['shots', '3.5'],
      ['points', '1.5']
    ],
    'Tennis': [
      ['aces', '8.5'],
      ['games won', '12.5']
    ],
  };

  static double _half(double v) => (v * 2).round() / 2;

  static List<SportsEvent> generateSlate(Random rng, int startId) {
    final events = <SportsEvent>[];
    var id = startId;
    for (final s in sports) {
      final pool = List<String>.of(_teams)..shuffle(rng);
      for (var g = 0; g < gamesPerSport; g++) {
        final p = 0.30 + rng.nextDouble() * 0.40; // home win prob 0.30–0.70
        // The extra markets (spread/total/props) come from a SIDE rng seeded on
        // the event id, so adding them never perturbs the main rng stream —
        // markets, crises and bet resolution stay deterministic per seed.
        events.add(_buildEvent(
          id: id,
          sport: s,
          home: pool[g * 2],
          away: pool[g * 2 + 1],
          homeProb: p,
          side: Random(id),
        ));
        id++;
      }
    }
    return events;
  }

  static SportsEvent _buildEvent({
    required int id,
    required List<String> sport,
    required String home,
    required String away,
    required double homeProb,
    required Random side,
  }) {
    final name = sport[0];
    // Spread magnitude grows with how lopsided the moneyline is; each side is
    // priced near a coin flip (that's the point of a spread).
    var spreadMag = _half((homeProb - 0.5).abs() * 24);
    if (spreadMag < 0.5) spreadMag = 0.5;
    final spreadPoints = homeProb >= 0.5 ? spreadMag : -spreadMag;
    final spHomeProb = 0.5 + (side.nextDouble() - 0.5) * 0.06;
    // Total: per-sport baseline with jitter.
    final total = _half((_totalBase[name] ?? 45.5) * (0.92 + side.nextDouble() * 0.16));
    final overProb = 0.46 + side.nextDouble() * 0.08;
    // Props: one or two lines from the sport's menu, distinct players.
    final players = List<String>.of(_players)..shuffle(side);
    final menu = _propMenu[name] ??
        const [
          ['points', '18.5']
        ];
    final props = <PropLine>[];
    for (var k = 0; k < menu.length && k < 2; k++) {
      final base = double.parse(menu[k][1]);
      final line = _half(base * (0.86 + side.nextDouble() * 0.28));
      final op = 0.42 + side.nextDouble() * 0.14;
      props.add(PropLine(
        player: players[k],
        stat: menu[k][0],
        line: line,
        overProb: op,
        overDecimal: (1 / op) * (1 - vig),
        underDecimal: (1 / (1 - op)) * (1 - vig),
      ));
    }
    // Every line: fair payout shaved by the vig -> EV per $1 is exactly -vig.
    return SportsEvent(
      id: id,
      sportName: name,
      sport: sport[1],
      home: home,
      away: away,
      homeProb: homeProb,
      homeDecimal: (1 / homeProb) * (1 - vig),
      awayDecimal: (1 / (1 - homeProb)) * (1 - vig),
      spreadPoints: spreadPoints,
      spreadHomeProb: spHomeProb,
      spreadHomeDecimal: (1 / spHomeProb) * (1 - vig),
      spreadAwayDecimal: (1 / (1 - spHomeProb)) * (1 - vig),
      totalPoints: total,
      totalUnit: _totalUnit[name] ?? 'pts',
      overProb: overProb,
      overDecimal: (1 / overProb) * (1 - vig),
      underDecimal: (1 / (1 - overProb)) * (1 - vig),
      props: props,
    );
  }

  /// Decimal odds -> American odds string, the way a sportsbook shows them.
  static String american(double decimal) {
    if (decimal >= 2) return '+${((decimal - 1) * 100).round()}';
    return '-${(100 / (decimal - 1)).round()}';
  }

  /// One matchup + a side, packaged as a parlay leg.
  static ParlayLeg legFor(SportsEvent e, bool home) => ParlayLeg(
        eventId: e.id,
        label: '${home ? e.home : e.away} (vs ${home ? e.away : e.home})',
        decimalOdds: home ? e.homeDecimal : e.awayDecimal,
        winProb: home ? e.homeProb : 1 - e.homeProb,
      );

  /// Pre-built "featured" parlays for the top of the book, each drawn from a
  /// DISJOINT set of games (so a player can fire several without tripping the
  /// one-bet-per-game rule) and juiced with a profit boost to bait the bet.
  static List<FeaturedParlay> featuredParlays(
      List<SportsEvent> slate, Random rng) {
    if (slate.length < 2) return const [];
    final pool = List<SportsEvent>.of(slate)..shuffle(rng);
    var cursor = 0;
    List<SportsEvent> take(int n) {
      final out = pool.skip(cursor).take(n).toList();
      cursor += out.length;
      return out;
    }

    // The "dog" side of a game is whichever price is longer (bigger payout,
    // less likely); the favorite is the shorter price.
    bool dogIsHome(SportsEvent e) => e.homeDecimal >= e.awayDecimal;

    final featured = <FeaturedParlay>[];
    var id = 0;

    final dogs = take(4);
    if (dogs.length >= 3) {
      featured.add(FeaturedParlay(
        id: id++,
        name: '🐶 Underdog Lotto',
        blurb: '${dogs.length} live dogs. Lands almost never — pays absurd.',
        legs: [for (final e in dogs) legFor(e, dogIsHome(e))],
        boost: 0.30,
      ));
    }

    final degen = take(3);
    if (degen.length >= 2) {
      featured.add(FeaturedParlay(
        id: id++,
        name: '🎲 Degen Special',
        blurb: 'A coin-flip grab bag. Pure chaos, fully juiced.',
        legs: [for (final e in degen) legFor(e, rng.nextBool())],
        boost: 0.25,
      ));
    }

    final chalk = take(3);
    if (chalk.length >= 2) {
      featured.add(FeaturedParlay(
        id: id++,
        name: '🧊 Chalk Stack',
        blurb: 'Stacked favorites. Safer-ish, still boosted.',
        legs: [for (final e in chalk) legFor(e, !dogIsHome(e))],
        boost: 0.15,
      ));
    }

    final duo = take(2);
    if (duo.length >= 2) {
      featured.add(FeaturedParlay(
        id: id++,
        name: '⚡ Boosted Duo',
        blurb: 'Two favorites with extra juice on top.',
        legs: [for (final e in duo) legFor(e, !dogIsHome(e))],
        boost: 0.20,
      ));
    }

    return featured;
  }
}
