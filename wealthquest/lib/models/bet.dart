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
  final String label;
  final double decimalOdds;
  final double winProb;
  const ParlayLeg({
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
  final double stake;
  final double decimalOdds;
  final double winProb;

  PendingBet({
    required this.id,
    required this.legs,
    required this.stake,
    required this.decimalOdds,
    required this.winProb,
  });

  bool get isParlay => legs.length > 1;
  String get title => isParlay ? '${legs.length}-leg parlay' : legs.first;
  double get potentialPayout => stake * decimalOdds;
}
