import 'dart:math';

import '../models/asset.dart';
import '../models/climate.dart';
import '../models/crisis.dart';
import '../state/game_controller.dart';
import 'catalog.dart';

/// The library of crisis / decision events, plus the picker. Stakes scale with
/// net worth so they still bite when you're wealthy. Pure given a [Random].
class Crises {
  Crises._();

  /// Cost as a fraction of net worth, floored at a dollar minimum.
  static double _scaled(GameController g, double frac, double floor) {
    final v = (g.netWorth.abs()) * frac;
    return v < floor ? floor : v;
  }

  static String _usd(double v) => '\$${v.toStringAsFixed(0)}';

  /// Try to buy [amount] of an asset, clamped to available cash. Returns the
  /// dollars actually deployed.
  static double _buy(GameController g, String id, double amount) {
    final def = Catalog.assetById(id);
    final amt = amount > g.cash ? g.cash : amount;
    if (amt < def.minInvestment) return 0;
    g.buy(def, amt);
    return amt;
  }

  static final List<CrisisEvent> all = [
    CrisisEvent(
      id: 'lawsuit',
      emoji: '⚖️',
      title: 'You\'re being sued',
      body: 'A former business associate has filed a lawsuit over an old deal. '
          'Your lawyer says you can settle quietly or fight it in court.',
      choices: [
        CrisisChoice('Settle quietly', (g, rng) {
          final amt = _scaled(g, 0.04, 1000);
          g.cash -= amt;
          return 'Settled for ${_usd(amt)}. It goes away.';
        }),
        CrisisChoice('Fight it in court', (g, rng) {
          if (rng.nextBool()) {
            final amt = _scaled(g, 0.01, 400);
            g.cash -= amt;
            return 'You won — just ${_usd(amt)} in legal fees.';
          }
          final amt = _scaled(g, 0.09, 2500);
          g.cash -= amt;
          return 'You lost. Damages + fees cost ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'medical',
      emoji: '🏥',
      title: 'Medical emergency',
      body: 'A sudden health scare lands you in the hospital. The bills are '
          'piling up.',
      choices: [
        CrisisChoice('Pay out of pocket', (g, rng) {
          final amt = _scaled(g, 0.05, 1500);
          g.cash -= amt;
          return 'Paid ${_usd(amt)} in full.';
        }),
        CrisisChoice('Lean on insurance', (g, rng) {
          final amt = _scaled(g, 0.015, 600);
          g.cash -= amt;
          return 'Insurance covered most — you paid ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'startup',
      emoji: '🚀',
      title: 'A friend\'s startup',
      body: 'An old friend is raising money for their startup and wants you in. '
          'It could 5x… or go to zero.',
      choices: [
        CrisisChoice('Write a check', (g, rng) {
          final amt = _scaled(g, 0.08, 2000);
          g.cash -= amt;
          if (rng.nextDouble() < 0.35) {
            g.cash += amt * 5;
            return 'It hit! Your ${_usd(amt)} came back as ${_usd(amt * 5)}.';
          }
          return 'It folded. You lost ${_usd(amt)}.';
        }),
        CrisisChoice('Politely pass', (g, rng) => 'You keep your powder dry.'),
      ],
    ),
    CrisisEvent(
      id: 'inheritance',
      emoji: '💰',
      title: 'An unexpected inheritance',
      body: 'A distant relative has passed and left you a bequest.',
      choices: [
        CrisisChoice('Accept the windfall', (g, rng) {
          final amt = _scaled(g, 0.08, 10000);
          g.cash += amt;
          return 'You inherit ${_usd(amt)}.';
        }),
        CrisisChoice('Take half, donate half', (g, rng) {
          final amt = _scaled(g, 0.08, 10000) / 2;
          g.cash += amt;
          return 'You keep ${_usd(amt)} and donate the rest. Feels good.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'repair',
      emoji: '🛠️',
      title: 'Everything breaks at once',
      body: 'The car, the roof, the water heater — all in the same week.',
      choices: [
        CrisisChoice('Pay the pros', (g, rng) {
          final amt = _scaled(g, 0.03, 800);
          g.cash -= amt;
          return 'Fixed properly for ${_usd(amt)}.';
        }),
        CrisisChoice('DIY to save money', (g, rng) {
          if (rng.nextBool()) {
            final amt = _scaled(g, 0.01, 300);
            g.cash -= amt;
            return 'Nailed it — only ${_usd(amt)}.';
          }
          final amt = _scaled(g, 0.06, 1600);
          g.cash -= amt;
          return 'You made it worse. ${_usd(amt)} to undo the damage.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'audit',
      emoji: '🧾',
      title: 'Tax audit',
      body: 'The tax office wants a word about last year\'s return.',
      choices: [
        CrisisChoice('Just pay it', (g, rng) {
          final amt = _scaled(g, 0.06, 1000);
          g.cash -= amt;
          return 'Paid ${_usd(amt)} in back taxes + penalties.';
        }),
        CrisisChoice('Hire a sharp accountant', (g, rng) {
          final amt = _scaled(g, 0.025, 1200);
          g.cash -= amt;
          return 'They whittled it down — ${_usd(amt)} all in.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'bonus',
      emoji: '🎁',
      title: 'Year-end bonus',
      body: 'Your boss offers a bonus — take it as cash, or as company stock '
          'that could swing either way.',
      choices: [
        CrisisChoice('Take the cash', (g, rng) {
          final amt = g.effectivePay * 1.5;
          g.cash += amt;
          return 'Banked a ${_usd(amt)} bonus.';
        }),
        CrisisChoice('Take company stock', (g, rng) {
          final base = g.effectivePay * 1.5;
          final mult = 0.3 + rng.nextDouble() * 2.4; // 0.3x – 2.7x
          final amt = base * mult;
          g.cash += amt;
          return mult >= 1
              ? 'The stock ran — your bonus is worth ${_usd(amt)}.'
              : 'The stock slipped — it\'s worth ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'tip',
      emoji: '🤫',
      title: 'A too-good-to-be-true tip',
      body: 'Someone slips you "guaranteed" inside information. Acting on it '
          'would be… not entirely legal.',
      choices: [
        CrisisChoice('Act on it', (g, rng) {
          if (rng.nextDouble() < 0.5) {
            final amt = _scaled(g, 0.10, 3000);
            g.cash += amt;
            return 'It paid off — ${_usd(amt)} richer. No one noticed.';
          }
          final amt = _scaled(g, 0.12, 4000);
          g.cash -= amt;
          return 'You got caught. Fines cost you ${_usd(amt)}.';
        }),
        CrisisChoice('Walk away', (g, rng) => 'You keep your hands clean.'),
      ],
    ),
    CrisisEvent(
      id: 'recession_warning',
      emoji: '📉',
      title: 'Storm clouds gathering',
      body: 'Analysts are whispering that a downturn is coming. Do you hedge?',
      eligible: (g) =>
          g.regime == MarketRegime.boom || g.regime == MarketRegime.normal,
      choices: [
        CrisisChoice('Hedge with gold', (g, rng) {
          final amt = _buy(g, 'gold', _scaled(g, 0.10, 2000));
          return amt > 0
              ? 'Moved ${_usd(amt)} into gold as a hedge.'
              : 'Not enough cash to hedge — you ride bare.';
        }),
        CrisisChoice('Ignore the noise', (g, rng) => 'You stay the course.'),
      ],
    ),
    CrisisEvent(
      id: 'buy_the_dip',
      emoji: '🌪️',
      title: 'Blood in the streets',
      body: 'The market is in free-fall and everyone is panicking. The brave '
          'call this an opportunity.',
      eligible: (g) =>
          g.regime == MarketRegime.crash || g.regime == MarketRegime.downturn,
      choices: [
        CrisisChoice('Back up the truck', (g, rng) {
          final amt = _buy(g, 'spx', _scaled(g, 0.20, 3000));
          return amt > 0
              ? 'Bought the dip — ${_usd(amt)} into the S&P.'
              : 'Not enough cash to pounce.';
        }),
        CrisisChoice('Sit tight', (g, rng) => 'You wait for the dust to settle.'),
      ],
    ),
  ];

  /// Pick a random event that can fire right now, or null if none.
  static CrisisEvent? pick(GameController g, Random rng) {
    final eligible = all.where((e) => e.eligible(g)).toList();
    if (eligible.isEmpty) return null;
    return eligible[rng.nextInt(eligible.length)];
  }
}
