/// The betting markets a game offers — moneyline (who wins), spread (margin),
/// total (combined score over/under), and player props.
enum BetMarket { moneyline, spread, total, prop }

/// A single player-prop line on a game, e.g. "J. Carter Over 268.5 pass yds".
class PropLine {
  final String player;
  final String stat; // "passing yards"
  final double line; // 268.5
  final double overProb;
  final double overDecimal;
  final double underDecimal;
  const PropLine({
    required this.player,
    required this.stat,
    required this.line,
    required this.overProb,
    required this.overDecimal,
    required this.underDecimal,
  });
}

/// One tappable selection on a game — the atom the bet slip is built from.
class BetOption {
  final int eventId;
  final BetMarket market;

  /// Unique within a single event, e.g. 'ml_h', 'sp_a', 'tot_o', 'p0_u'.
  final String selectionKey;
  final String groupLabel; // "Moneyline", "Spread", "Total", "J. Carter · pass yds"
  final String pickLabel; // "Lions", "Lions -3.5", "Over 47.5"
  final double decimalOdds;
  final double winProb;
  const BetOption({
    required this.eventId,
    required this.market,
    required this.selectionKey,
    required this.groupLabel,
    required this.pickLabel,
    required this.decimalOdds,
    required this.winProb,
  });
}

String _pts(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);

/// One matchup on the betting slate, carrying every market it offers.
class SportsEvent {
  final int id;
  final String sportName; // "Football"
  final String sport; // emoji
  final String home;
  final String away;

  /// "True" probability the home side wins (moneyline).
  final double homeProb;

  /// Decimal payout multipliers offered (already shaved by the house vig).
  final double homeDecimal;
  final double awayDecimal;

  /// Point spread: home favored by [spreadPoints] when positive (away when
  /// negative). Each side priced near a coin flip.
  final double spreadPoints;
  final double spreadHomeProb;
  final double spreadHomeDecimal;
  final double spreadAwayDecimal;

  /// Over/under on the combined score.
  final double totalPoints;
  final String totalUnit; // "pts", "goals", "runs"
  final double overProb;
  final double overDecimal;
  final double underDecimal;

  /// Player props.
  final List<PropLine> props;

  SportsEvent({
    required this.id,
    required this.sportName,
    required this.sport,
    required this.home,
    required this.away,
    required this.homeProb,
    required this.homeDecimal,
    required this.awayDecimal,
    required this.spreadPoints,
    required this.spreadHomeProb,
    required this.spreadHomeDecimal,
    required this.spreadAwayDecimal,
    required this.totalPoints,
    required this.totalUnit,
    required this.overProb,
    required this.overDecimal,
    required this.underDecimal,
    required this.props,
  });

  /// Every bettable option across all markets, in display order.
  List<BetOption> options() {
    final favHome = spreadPoints >= 0;
    final spLine = _pts(spreadPoints.abs());
    final tot = _pts(totalPoints);
    final out = <BetOption>[
      BetOption(
          eventId: id,
          market: BetMarket.moneyline,
          selectionKey: 'ml_h',
          groupLabel: 'Moneyline',
          pickLabel: home,
          decimalOdds: homeDecimal,
          winProb: homeProb),
      BetOption(
          eventId: id,
          market: BetMarket.moneyline,
          selectionKey: 'ml_a',
          groupLabel: 'Moneyline',
          pickLabel: away,
          decimalOdds: awayDecimal,
          winProb: 1 - homeProb),
      BetOption(
          eventId: id,
          market: BetMarket.spread,
          selectionKey: 'sp_h',
          groupLabel: 'Spread',
          pickLabel: '$home ${favHome ? '-' : '+'}$spLine',
          decimalOdds: spreadHomeDecimal,
          winProb: spreadHomeProb),
      BetOption(
          eventId: id,
          market: BetMarket.spread,
          selectionKey: 'sp_a',
          groupLabel: 'Spread',
          pickLabel: '$away ${favHome ? '+' : '-'}$spLine',
          decimalOdds: spreadAwayDecimal,
          winProb: 1 - spreadHomeProb),
      BetOption(
          eventId: id,
          market: BetMarket.total,
          selectionKey: 'tot_o',
          groupLabel: 'Total',
          pickLabel: 'Over $tot $totalUnit',
          decimalOdds: overDecimal,
          winProb: overProb),
      BetOption(
          eventId: id,
          market: BetMarket.total,
          selectionKey: 'tot_u',
          groupLabel: 'Total',
          pickLabel: 'Under $tot $totalUnit',
          decimalOdds: underDecimal,
          winProb: 1 - overProb),
    ];
    for (var i = 0; i < props.length; i++) {
      final p = props[i];
      final g = '${p.player} · ${p.stat}';
      out.add(BetOption(
          eventId: id,
          market: BetMarket.prop,
          selectionKey: 'p${i}_o',
          groupLabel: g,
          pickLabel: 'Over ${_pts(p.line)}',
          decimalOdds: p.overDecimal,
          winProb: p.overProb));
      out.add(BetOption(
          eventId: id,
          market: BetMarket.prop,
          selectionKey: 'p${i}_u',
          groupLabel: g,
          pickLabel: 'Under ${_pts(p.line)}',
          decimalOdds: p.underDecimal,
          winProb: 1 - p.overProb));
    }
    return out;
  }
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

  Map<String, dynamic> toJson() => {
        'id': id,
        'legs': legs,
        'eventIds': eventIds,
        'stake': stake,
        'decimalOdds': decimalOdds,
        'winProb': winProb,
      };

  factory PendingBet.fromJson(Map<String, dynamic> j) => PendingBet(
        id: j['id'] as int,
        legs: [for (final l in (j['legs'] as List)) l as String],
        eventIds: [for (final e in (j['eventIds'] as List)) e as int],
        stake: (j['stake'] as num).toDouble(),
        decimalOdds: (j['decimalOdds'] as num).toDouble(),
        winProb: (j['winProb'] as num).toDouble(),
      );
}

/// A settled wager, kept for the betting record / hit-rate feed.
class BetResult {
  final String title;
  final double stake;
  final double payout; // total returned (0 if lost)
  final bool won;
  final bool isParlay;
  const BetResult({
    required this.title,
    required this.stake,
    required this.payout,
    required this.won,
    required this.isParlay,
  });

  double get profit => payout - stake;

  Map<String, dynamic> toJson() => {
        'title': title,
        'stake': stake,
        'payout': payout,
        'won': won,
        'isParlay': isParlay,
      };

  factory BetResult.fromJson(Map<String, dynamic> j) => BetResult(
        title: j['title'] as String,
        stake: (j['stake'] as num).toDouble(),
        payout: (j['payout'] as num).toDouble(),
        won: j['won'] as bool,
        isParlay: j['isParlay'] as bool,
      );
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
