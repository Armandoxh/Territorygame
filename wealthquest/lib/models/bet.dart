/// One matchup on the betting slate, with odds offered on each side.
class SportsEvent {
  final int id;
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
    required this.sport,
    required this.home,
    required this.away,
    required this.homeProb,
    required this.homeDecimal,
    required this.awayDecimal,
  });
}

/// A wager the player has placed, waiting to resolve next month.
class PendingBet {
  final int id;
  final String label; // e.g. "Lions  (vs Bears)"
  final double stake;
  final double decimalOdds;
  final double winProb;

  PendingBet({
    required this.id,
    required this.label,
    required this.stake,
    required this.decimalOdds,
    required this.winProb,
  });

  double get potentialPayout => stake * decimalOdds;
}
