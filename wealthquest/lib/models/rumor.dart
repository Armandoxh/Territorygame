/// A single piece of "word on the street" — a tip that predicts a move for one
/// asset. The rumor mill is deliberately unreliable: only [reliability] of
/// rumors actually come true (base 25%). An upgrade tree will later raise that
/// and reveal the exact probability to the player.
class Rumor {
  final String assetId;

  /// +1 = bullish tip, -1 = bearish tip.
  final int dir;

  /// Predicted size of the weekly move if the rumor is true (fraction).
  final double magnitude;

  /// Probability this rumor is true.
  final double reliability;

  final String headline;
  final int createdDay;

  /// Set when the week resolves.
  bool resolved;
  bool cameTrue;

  /// The asset's realized move the week this rumor resolved (for display).
  double actualMove;

  Rumor({
    required this.assetId,
    required this.dir,
    required this.magnitude,
    required this.reliability,
    required this.headline,
    required this.createdDay,
    this.resolved = false,
    this.cameTrue = false,
    this.actualMove = 0,
  });

  bool get isBullish => dir > 0;
}
