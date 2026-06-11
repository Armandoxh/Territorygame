import 'dart:math';

/// An NPC competitor — "the Joneses." Each one's net worth is a deterministic
/// function of how many months have elapsed (compound growth + a gentle wobble),
/// so they need no stored state and never touch the RNG. They give your number
/// a point: a race to climb the leaderboard.
class Rival {
  const Rival(this.name, this.emoji, this.blurb, this.startNetWorth,
      this.monthlyGrowth, this.wobble, this.phase);

  final String name;
  final String emoji;
  final String blurb;
  final double startNetWorth; // at month 0 (age 18)
  final double monthlyGrowth; // compound, per month
  final double wobble; // ± fractional swing
  final double phase;

  double netWorthAt(int day) {
    final base = startNetWorth * pow(1 + monthlyGrowth, day);
    final swing = 1 + wobble * sin(day * 0.45 + phase);
    final nw = base * swing;
    return nw < 0 ? 0 : nw;
  }
}

class Rivals {
  Rivals._();

  static const List<Rival> all = [
    Rival('Couch Carl', '🛋️',
        'Never invested, never tried. The cautionary tale.', 2000, 0.0018,
        0.04, 0.0),
    Rival('Steady Sue', '📊',
        'Buys the index every month and ignores the noise.', 3000, 0.0062,
        0.06, 1.1),
    Rival('Hustle Hank', '💼', 'Grinds two jobs and a side gig.', 2000, 0.0090,
        0.10, 2.2),
    Rival('Trust-fund Tara', '💎', 'Started life with a head start.', 80000,
        0.0050, 0.08, 3.3),
    Rival('Crypto Chad', '🚀',
        'All-in on coins. Sometimes #1, sometimes wiped out.', 1500, 0.0125,
        0.45, 4.4),
    Rival('Founder Fiona', '🦄', 'Building the next unicorn.', 2000, 0.0110,
        0.30, 5.5),
  ];
}
