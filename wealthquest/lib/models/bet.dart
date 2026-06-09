/// One matchup on the betting slate, with odds offered on each side.
class SportsEvent {
  final int id;
  final String sportName; // "Football"
  final String sport; // emoji
  final String home;
  final String away;

  /// "True" probability the home side wins.
  final double homeProb;

  /// Decimal payout multipliers offered (already shaved by the house vig).
  final double homeDecimal;
  final double awayDecimal;

  SportsEvent({
    required this.id,
    required this.sportName,
    required this.sport,
    required this.home,
    required this.away,
    required this.homeProb,
    required this.homeDecimal,
    required this.awayDecimal,
  });
}

/// One pick in a bet (a single bet is just a 1-leg parlay).
class ParlayLeg {
  final int eventId;
  final String label;
  final double decimalOdds;
  final double winProb;
  const ParlayLeg({
    required this.eventId,
    required this.label,
    required this.decimalOdds,
    required this.winProb,
  });
}

/// A wager the player has placed, waiting to resolve next month. For a parlay,
/// ALL legs must hit — the odds multiply and so does the long shot.
class PendingBet {
  final int id;
  final List<String> legs;

  /// The event id each leg covers — used to enforce one open bet per game.
  final List<int> eventIds;
  final double stake;
  final double decimalOdds;
  final double winProb;

  PendingBet({
    required this.id,
    required this.legs,
    required this.eventIds,
    required this.stake,
    required this.decimalOdds,
    required this.winProb,
  });

  bool get isParlay => legs.length > 1;
  String get title => isParlay ? '${legs.length}-leg parlay' : legs.first;
  double get potentialPayout => stake * decimalOdds;
}

/// A pre-built "house" parlay shown as a one-tap card at the top of the book —
/// the DraftKings-style featured/boosted parlay. The book juices the payout by
/// [boost] (a boost on the profit, stake still returns 1:1) to bait the bet;
/// it's still a long shot, just a shinier one.
class FeaturedParlay {
  final int id;
  final String name; // e.g. "🐶 Underdog Lotto"
  final String blurb; // one-line pitch
  final List<ParlayLeg> legs;
  final double boost; // profit boost fraction (0.25 = +25% on winnings)

  const FeaturedParlay({
    required this.id,
    required this.name,
    required this.blurb,
    required this.legs,
    required this.boost,
  });

  /// Raw multiplied odds before the boost.
  double get baseDecimal {
    var d = 1.0;
    for (final l in legs) {
      d *= l.decimalOdds;
    }
    return d;
  }

  /// Payout multiplier after boosting the profit portion (stake returns 1:1).
  double get boostedDecimal => 1 + (baseDecimal - 1) * (1 + boost);

  /// Combined chance every leg hits.
  double get winProb {
    var p = 1.0;
    for (final l in legs) {
      p *= l.winProb;
    }
    return p;
  }
}
