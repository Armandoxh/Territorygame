import 'dart:math';
import 'dart:ui';

/// One prize rung on a ticket: how often it hits (weight per 10,000 draws),
/// what it pays, and the symbol that marks it on the grid.
class PrizeTier {
  final double payout;
  final int weight;
  final String symbol;
  const PrizeTier(this.payout, this.weight, this.symbol);
}

/// A scratch-off ticket design. The core twist of the whole game: every ticket
/// is slightly EV-POSITIVE (you are the luckiest person alive) — variance
/// delivers the dopamine, positive EV guarantees the incremental climb never
/// stalls. Tuning is enforced by test/economy_test.dart.
class TicketDef {
  final String id;
  final String name;
  final String tagline;
  final double cost;
  final Color colorA;
  final Color colorB;

  /// Losing draw weight (per 10,000). Everything else in [prizes].
  final int blankWeight;
  final List<PrizeTier> prizes;

  /// Decoy symbols mixed into the grid so losses still look tantalizing.
  final List<String> decoys;

  const TicketDef({
    required this.id,
    required this.name,
    required this.tagline,
    required this.cost,
    required this.colorA,
    required this.colorB,
    required this.blankWeight,
    required this.prizes,
    required this.decoys,
  });

  /// Expected value per ticket at level 0 (no upgrades), in dollars.
  double get baseEv {
    var ev = 0.0;
    for (final p in prizes) {
      ev += p.payout * p.weight;
    }
    return ev / 10000;
  }
}

/// v0.1 ships one ticket. The ladder (new themes + new scratch STYLES per
/// tier) arrives in v0.2 — add defs here, never hardcode in UI.
class Tickets {
  Tickets._();

  static const lucky7s = TicketDef(
    id: 'lucky7s',
    name: 'Lucky 7s',
    tagline: 'Match 3 symbols to win!',
    cost: 1.0,
    colorA: Color(0xFFD32F2F),
    colorB: Color(0xFFFFB300),
    // EV ≈ $1.16 on a $1 ticket · ~38% hit rate. Verified in CI.
    blankWeight: 6200,
    prizes: [
      PrizeTier(1, 2000, '🍒'),
      PrizeTier(2, 800, '🍋'),
      PrizeTier(3, 500, '🔔'),
      PrizeTier(5, 300, '⭐'),
      PrizeTier(10, 150, '💰'),
      PrizeTier(50, 45, '🍀'),
      PrizeTier(250, 5, '7️⃣'),
    ],
    decoys: ['🎲', '💎'],
  );

  static const List<TicketDef> all = [lucky7s];

  static TicketDef byId(String id) => all.firstWhere((t) => t.id == id);
}

/// A concrete, already-decided ticket in the player's hand. Real scratchers
/// work this way too: the outcome is drawn first, the 3×3 grid is decoration
/// laid out to match it. Deciding at purchase (and saving it) means a page
/// refresh can never reroll a ticket.
class TicketInstance {
  final String defId;

  /// The winning symbol (appears exactly 3 times), or null on a loss.
  final String? winSymbol;

  /// Final payout, upgrades already applied. 0 on a loss.
  final double payout;

  /// The 9 symbols on the grid, row-major.
  final List<String> cells;

  TicketInstance({
    required this.defId,
    required this.winSymbol,
    required this.payout,
    required this.cells,
  });

  TicketDef get def => Tickets.byId(defId);
  bool get isWinner => winSymbol != null;

  Map<String, dynamic> toJson() => {
        'defId': defId,
        'winSymbol': winSymbol,
        'payout': payout,
        'cells': cells,
      };

  factory TicketInstance.fromJson(Map<String, dynamic> j) => TicketInstance(
        defId: j['defId'] as String,
        winSymbol: j['winSymbol'] as String?,
        payout: (j['payout'] as num).toDouble(),
        cells: [for (final c in (j['cells'] as List)) c as String],
      );
}

/// Rolls tickets. [luckLevel] shifts weight out of the blank bucket into the
/// two lowest prizes (+100 and +50 per level); [payoutMult] scales every
/// payout. Both come from upgrades in GameState.
class TicketFactory {
  TicketFactory._();

  /// Effective blank weight after luck upgrades, floored so a hit is never
  /// guaranteed (the tease must survive).
  static int blankWeightFor(TicketDef def, int luckLevel) {
    final w = def.blankWeight - 150 * luckLevel;
    return w < 2000 ? 2000 : w;
  }

  static TicketInstance roll(
    TicketDef def,
    Random rng, {
    int luckLevel = 0,
    double payoutMult = 1.0,
  }) {
    final blank = blankWeightFor(def, luckLevel);
    // Luck shifts weight into the two cheapest prizes.
    final shifted = def.blankWeight - blank;
    final bonusLow = (shifted * 2) ~/ 3;
    final bonusMid = shifted - bonusLow;

    var total = blank;
    final weights = <int>[];
    for (var i = 0; i < def.prizes.length; i++) {
      var w = def.prizes[i].weight;
      if (i == 0) w += bonusLow;
      if (i == 1) w += bonusMid;
      weights.add(w);
      total += w;
    }

    var pick = rng.nextInt(total);
    PrizeTier? won;
    if (pick >= blank) {
      pick -= blank;
      for (var i = 0; i < weights.length; i++) {
        if (pick < weights[i]) {
          won = def.prizes[i];
          break;
        }
        pick -= weights[i];
      }
    }

    return TicketInstance(
      defId: def.id,
      winSymbol: won?.symbol,
      payout: won == null ? 0 : won.payout * payoutMult,
      cells: _layoutCells(def, rng, won?.symbol),
    );
  }

  /// Lay out the 9-cell grid: a winner shows its symbol exactly 3 times; every
  /// other symbol appears at most twice, so a loss can never accidentally
  /// contain a match. Validity is enforced by the economy tests.
  static List<String> _layoutCells(TicketDef def, Random rng, String? winner) {
    final pool = <String>[
      for (final p in def.prizes) p.symbol,
      ...def.decoys,
    ];
    final counts = <String, int>{};
    final cells = <String>[];

    if (winner != null) {
      for (var i = 0; i < 3; i++) {
        cells.add(winner);
      }
      counts[winner] = 3;
    }

    while (cells.length < 9) {
      final s = pool[rng.nextInt(pool.length)];
      final c = counts[s] ?? 0;
      final cap = s == winner ? 3 : 2;
      if (c >= cap) continue;
      counts[s] = c + 1;
      cells.add(s);
    }

    cells.shuffle(rng);
    return cells;
  }
}
