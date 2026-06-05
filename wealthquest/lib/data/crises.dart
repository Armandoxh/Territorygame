import 'dart:math';

import '../models/asset.dart';
import '../models/climate.dart';
import '../models/crisis.dart';
import '../models/holding.dart';
import '../models/property.dart';
import '../state/game_controller.dart';
import 'catalog.dart';
import 'properties.dart';

/// The library of crisis / decision events, plus the picker. Stakes scale with
/// net worth so they still bite when you're wealthy, and many are gated by
/// context (you own property, you hold crypto, you're in debt, the market is
/// crashing…). Pure given a [Random].
class Crises {
  Crises._();

  // ---- helpers ----------------------------------------------------------
  static double _scaled(GameController g, double frac, double floor) {
    final v = g.netWorth.abs() * frac;
    return v < floor ? floor : v;
  }

  static String _usd(double v) => '\$${v.toStringAsFixed(0)}';

  static double _buy(GameController g, String id, double amount) {
    final def = Catalog.assetById(id);
    final amt = amount > g.cash ? g.cash : amount;
    if (amt < def.minInvestment) return 0;
    g.buy(def, amt);
    return amt;
  }

  static PropertyHolding? _randProp(GameController g, Random rng) =>
      g.properties.isEmpty ? null : g.properties[rng.nextInt(g.properties.length)];

  static PropertyHolding? _randRental(GameController g, Random rng) {
    final r = g.properties.where((h) => h.rentedOut).toList();
    return r.isEmpty ? null : r[rng.nextInt(r.length)];
  }

  static Holding? _randOfKind(GameController g, Random rng, AssetKind kind) {
    final hs = g.holdings
        .where((h) => !h.isShort && Catalog.assetById(h.assetId).kind == kind)
        .toList();
    return hs.isEmpty ? null : hs[rng.nextInt(hs.length)];
  }

  static bool _holds(GameController g, AssetKind kind) => g.holdings
      .any((h) => !h.isShort && Catalog.assetById(h.assetId).kind == kind);

  static final List<CrisisEvent> all = [
    // ===================== Money troubles =============================
    CrisisEvent(
      id: 'lawsuit',
      emoji: '⚖️',
      title: 'You\'re being sued',
      body: 'A former associate is suing you over an old deal. Settle quietly, '
          'or fight it in court?',
      choices: [
        CrisisChoice('Settle quietly', (g, rng) {
          final amt = _scaled(g, 0.04, 1000);
          g.cash -= amt;
          return 'Settled for ${_usd(amt)}.';
        }),
        CrisisChoice('Fight it', (g, rng) {
          if (rng.nextBool()) {
            final amt = _scaled(g, 0.01, 400);
            g.cash -= amt;
            return 'You won — ${_usd(amt)} in fees.';
          }
          final amt = _scaled(g, 0.09, 2500);
          g.cash -= amt;
          return 'You lost. Damages + fees: ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'medical',
      emoji: '🏥',
      title: 'Medical emergency',
      body: 'A health scare lands you in the hospital and the bills pile up.',
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
      id: 'repair',
      emoji: '🛠️',
      title: 'Everything breaks at once',
      body: 'The car, the water heater, the laptop — all in one week.',
      choices: [
        CrisisChoice('Pay the pros', (g, rng) {
          final amt = _scaled(g, 0.03, 800);
          g.cash -= amt;
          return 'Fixed properly for ${_usd(amt)}.';
        }),
        CrisisChoice('DIY to save', (g, rng) {
          if (rng.nextBool()) {
            final amt = _scaled(g, 0.01, 300);
            g.cash -= amt;
            return 'Nailed it — only ${_usd(amt)}.';
          }
          final amt = _scaled(g, 0.06, 1600);
          g.cash -= amt;
          return 'Made it worse. ${_usd(amt)} to undo.';
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
          return 'Paid ${_usd(amt)} in back taxes.';
        }),
        CrisisChoice('Hire an accountant', (g, rng) {
          final amt = _scaled(g, 0.025, 1200);
          g.cash -= amt;
          return 'Whittled down to ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'identity_theft',
      emoji: '🕵️',
      title: 'Identity theft',
      body: 'Someone\'s been racking up charges in your name.',
      choices: [
        CrisisChoice('Pay for protection', (g, rng) {
          final amt = _scaled(g, 0.02, 700);
          g.cash -= amt;
          return 'Locked it down for ${_usd(amt)}.';
        }),
        CrisisChoice('Dispute every charge', (g, rng) {
          if (rng.nextDouble() < 0.6) {
            return 'You clawed it all back. No cost.';
          }
          final amt = _scaled(g, 0.05, 1500);
          g.cash -= amt;
          return 'The bank sided against you — ${_usd(amt)} gone.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'car_totaled',
      emoji: '🚗',
      title: 'Your car is totaled',
      body: 'A fender-bender wrote off your ride.',
      choices: [
        CrisisChoice('Replace it', (g, rng) {
          final amt = _scaled(g, 0.04, 1200);
          g.cash -= amt;
          return 'New wheels for ${_usd(amt)}.';
        }),
        CrisisChoice('Go car-free for a while',
            (g, rng) => 'You bus it for now. Annoying, but free.'),
      ],
    ),
    CrisisEvent(
      id: 'flood',
      emoji: '🌊',
      title: 'Your basement flooded',
      body: 'A storm left your place underwater — and you skipped the rider.',
      choices: [
        CrisisChoice('Pay for cleanup', (g, rng) {
          final amt = _scaled(g, 0.03, 900);
          g.cash -= amt;
          return 'Cleaned up for ${_usd(amt)}.';
        }),
        CrisisChoice('Patch it yourself', (g, rng) {
          final amt = _scaled(g, 0.012, 400);
          g.cash -= amt;
          return 'Good enough — ${_usd(amt)}.';
        }),
      ],
    ),

    // ===================== Windfalls ==================================
    CrisisEvent(
      id: 'inheritance',
      emoji: '💰',
      title: 'An unexpected inheritance',
      body: 'A distant relative has left you a bequest.',
      choices: [
        CrisisChoice('Accept the windfall', (g, rng) {
          final amt = _scaled(g, 0.08, 10000);
          g.cash += amt;
          return 'You inherit ${_usd(amt)}.';
        }),
        CrisisChoice('Take half, donate half', (g, rng) {
          final amt = _scaled(g, 0.08, 10000) / 2;
          g.cash += amt;
          return 'You keep ${_usd(amt)} and donate the rest.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'lottery',
      emoji: '🎰',
      title: 'A lucky scratch ticket',
      body: 'That gas-station ticket actually hit.',
      choices: [
        CrisisChoice('Cash it in', (g, rng) {
          final amt = _scaled(g, 0.03, 2500);
          g.cash += amt;
          return 'You win ${_usd(amt)}!';
        }),
      ],
    ),
    CrisisEvent(
      id: 'tax_refund',
      emoji: '📬',
      title: 'Surprise tax refund',
      body: 'You overpaid last year and the government noticed.',
      choices: [
        CrisisChoice('Nice', (g, rng) {
          final amt = _scaled(g, 0.02, 1500);
          g.cash += amt;
          return 'A ${_usd(amt)} refund lands in your account.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'found_wallet',
      emoji: '👛',
      title: 'You found a wallet',
      body: 'It\'s stuffed with cash and an ID. Return it, or keep it?',
      choices: [
        CrisisChoice('Return it', (g, rng) {
          final amt = _scaled(g, 0.01, 400);
          g.cash += amt;
          return 'The owner gives you a ${_usd(amt)} reward. Karma.';
        }),
        CrisisChoice('Keep the cash', (g, rng) {
          final amt = _scaled(g, 0.015, 600);
          g.cash += amt;
          return 'You pocket ${_usd(amt)}. Try not to think about it.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'class_action',
      emoji: '📑',
      title: 'Class-action payout',
      body: 'A company you once dealt with settled a big lawsuit.',
      choices: [
        CrisisChoice('Claim your share', (g, rng) {
          final amt = _scaled(g, 0.015, 800);
          g.cash += amt;
          return 'A check for ${_usd(amt)} arrives.';
        }),
      ],
    ),

    // ===================== Career =====================================
    CrisisEvent(
      id: 'bonus',
      emoji: '🎁',
      title: 'Year-end bonus',
      body: 'Take it as cash, or as company stock that could swing either way?',
      choices: [
        CrisisChoice('Take the cash', (g, rng) {
          final amt = g.effectivePay * 1.5;
          g.cash += amt;
          return 'Banked a ${_usd(amt)} bonus.';
        }),
        CrisisChoice('Take stock', (g, rng) {
          final mult = 0.3 + rng.nextDouble() * 2.4;
          final amt = g.effectivePay * 1.5 * mult;
          g.cash += amt;
          return mult >= 1
              ? 'The stock ran — worth ${_usd(amt)}.'
              : 'The stock slipped — worth ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'headhunter',
      emoji: '📞',
      title: 'A headhunter calls',
      body: 'A rival wants you. Take a signing bonus, or use the offer to '
          'negotiate a raise where you are?',
      choices: [
        CrisisChoice('Signing bonus', (g, rng) {
          final amt = g.effectivePay * 2;
          g.cash += amt;
          return 'You jump ship for a ${_usd(amt)} bonus.';
        }),
        CrisisChoice('Negotiate a raise', (g, rng) {
          if (rng.nextDouble() < 0.7) {
            final amt = g.effectivePay * 1.2;
            g.cash += amt;
            return 'They counter — a ${_usd(amt)} retention bump.';
          }
          return 'They call your bluff. You stay put, empty-handed.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'layoff',
      emoji: '📉',
      title: 'Layoffs are coming',
      body: 'HR offers a voluntary buyout package.',
      choices: [
        CrisisChoice('Take the severance', (g, rng) {
          final amt = g.effectivePay * 2.5;
          g.cash += amt;
          return 'You take ${_usd(amt)} and your chances.';
        }),
        CrisisChoice('Stay and hope',
            (g, rng) => 'You keep your head down and your job.'),
      ],
    ),
    CrisisEvent(
      id: 'certification',
      emoji: '🎓',
      title: 'A career-boosting course',
      body: 'A pricey certification could pay off at work.',
      choices: [
        CrisisChoice('Pay for it', (g, rng) {
          final cost = g.effectivePay * 0.8;
          g.cash -= cost;
          if (rng.nextDouble() < 0.7) {
            final bump = g.effectivePay * 2;
            g.cash += bump;
            return 'It landed you a ${_usd(bump)} project bonus.';
          }
          return 'Nice to have, but no payoff yet. (−${_usd(cost)})';
        }),
        CrisisChoice('Skip it', (g, rng) => 'Maybe next year.'),
      ],
    ),
    CrisisEvent(
      id: 'side_hustle',
      emoji: '💡',
      title: 'A side-hustle idea',
      body: 'You could spin up a little business on the side — for a price.',
      choices: [
        CrisisChoice('Go for it', (g, rng) {
          final cost = _scaled(g, 0.02, 1000);
          g.cash -= cost;
          if (rng.nextDouble() < 0.5) {
            final win = cost * 3;
            g.cash += win;
            return 'It took off — ${_usd(win)} in sales.';
          }
          return 'It fizzled. You\'re out ${_usd(cost)}.';
        }),
        CrisisChoice('Stay focused', (g, rng) => 'You keep your weekends.'),
      ],
    ),

    // ===================== Property / landlord =========================
    CrisisEvent(
      id: 'eminent_domain',
      emoji: '🏛️',
      title: 'The government wants your land',
      body: 'The state plans a highway through one of your properties and is '
          'invoking eminent domain.',
      eligible: (g) => g.properties.isNotEmpty,
      choices: [
        CrisisChoice('Take their offer', (g, rng) {
          final p = _randProp(g, rng)!;
          final pd = Properties.byId(p.defId);
          final premium = p.currentValue * 1.25;
          g.cash += premium - p.loanBalance;
          g.properties.remove(p);
          return 'The state buys your ${pd.name} for ${_usd(premium)} — a 25% '
              'premium.';
        }),
        CrisisChoice('Fight it in court', (g, rng) {
          final p = _randProp(g, rng)!;
          final pd = Properties.byId(p.defId);
          if (rng.nextBool()) {
            final fee = _scaled(g, 0.01, 1000);
            g.cash -= fee;
            return 'You held them off — kept your ${pd.name}. '
                '(−${_usd(fee)} in legal fees.)';
          }
          g.cash += p.equity;
          g.properties.remove(p);
          return 'You lost. They took your ${pd.name} at market — no premium.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'developer_offer',
      emoji: '🏗️',
      title: 'A developer comes knocking',
      body: 'A developer offers well above market for one of your properties.',
      eligible: (g) => g.properties.isNotEmpty,
      choices: [
        CrisisChoice('Sell high', (g, rng) {
          final p = _randProp(g, rng)!;
          final pd = Properties.byId(p.defId);
          final offer = p.currentValue * 1.30;
          g.cash += offer - p.loanBalance;
          g.properties.remove(p);
          return 'Sold your ${pd.name} for ${_usd(offer)} — a 30% premium.';
        }),
        CrisisChoice('Hold out',
            (g, rng) => 'You bet it\'ll be worth even more later.'),
      ],
    ),
    CrisisEvent(
      id: 'property_tax',
      emoji: '🏠',
      title: 'Property reassessed',
      body: 'The assessor jacked up the value of your real estate — and the '
          'tax bill with it.',
      eligible: (g) => g.properties.isNotEmpty,
      choices: [
        CrisisChoice('Pay the bill', (g, rng) {
          final p = _randProp(g, rng)!;
          final amt = p.currentValue * 0.015;
          g.cash -= amt;
          return 'A ${_usd(amt)} property-tax hit.';
        }),
        CrisisChoice('Appeal it', (g, rng) {
          final p = _randProp(g, rng)!;
          if (rng.nextDouble() < 0.5) {
            return 'Your appeal worked — bill waived.';
          }
          final amt = p.currentValue * 0.02;
          g.cash -= amt;
          return 'Appeal denied, plus fees: ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'roof_emergency',
      emoji: '🏚️',
      title: 'A roof caves in',
      body: 'One of your properties needs an urgent, expensive repair.',
      eligible: (g) => g.properties.isNotEmpty,
      choices: [
        CrisisChoice('Fix it now', (g, rng) {
          final p = _randProp(g, rng)!;
          final amt = p.currentValue * 0.02;
          g.cash -= amt;
          return 'Repaired for ${_usd(amt)}.';
        }),
        CrisisChoice('Patch and pray', (g, rng) {
          final p = _randProp(g, rng)!;
          if (rng.nextBool()) {
            final amt = p.currentValue * 0.006;
            g.cash -= amt;
            return 'The patch held — ${_usd(amt)}.';
          }
          final amt = p.currentValue * 0.05;
          g.cash -= amt;
          return 'It failed spectacularly. ${_usd(amt)} to rebuild.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'tenant_nonpay',
      emoji: '🔑',
      title: 'A tenant stopped paying',
      body: 'One of your renters is three months behind.',
      eligible: (g) => g.properties.any((h) => h.rentedOut),
      choices: [
        CrisisChoice('Evict them', (g, rng) {
          final amt = _scaled(g, 0.015, 800);
          g.cash -= amt;
          return 'Eviction cost ${_usd(amt)} in fees and lost rent.';
        }),
        CrisisChoice('Work out a plan', (g, rng) {
          final r = _randRental(g, rng)!;
          final amt = r.monthlyRent * 2;
          g.cash -= amt;
          return 'You eat ${_usd(amt)} of back rent and keep them on.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'tenant_trashed',
      emoji: '🧹',
      title: 'A tenant trashed the place',
      body: 'They moved out and left a disaster behind.',
      eligible: (g) => g.properties.any((h) => h.rentedOut),
      choices: [
        CrisisChoice('Full renovation', (g, rng) {
          final r = _randRental(g, rng)!;
          final amt = r.currentValue * 0.02;
          g.cash -= amt;
          return 'Restored it for ${_usd(amt)}.';
        }),
        CrisisChoice('Keep the deposit, do minimal', (g, rng) {
          final r = _randRental(g, rng)!;
          final amt = r.currentValue * 0.006;
          g.cash -= amt;
          return 'Quick patch-up — ${_usd(amt)} net.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'squatters',
      emoji: '🚪',
      title: 'Squatters moved in',
      body: 'A vacant rental has uninvited residents who won\'t leave.',
      eligible: (g) => g.properties.any((h) => h.rentedOut && !h.occupied),
      choices: [
        CrisisChoice('Lawyer them out', (g, rng) {
          final amt = _scaled(g, 0.02, 1500);
          g.cash -= amt;
          return 'Legally removed for ${_usd(amt)}.';
        }),
        CrisisChoice('Pay them to leave', (g, rng) {
          final amt = _scaled(g, 0.012, 800);
          g.cash -= amt;
          return 'Cash-for-keys: ${_usd(amt)} and they\'re gone.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'prepay_tenant',
      emoji: '🤝',
      title: 'A tenant offers to prepay',
      body: 'A great renter offers a full year of rent up front for a small '
          'discount.',
      eligible: (g) => g.properties.any((h) => h.rentedOut),
      choices: [
        CrisisChoice('Take the lump sum', (g, rng) {
          final r = _randRental(g, rng)!;
          final amt = r.monthlyRent * 11;
          g.cash += amt;
          return 'A year of rent up front: ${_usd(amt)}.';
        }),
        CrisisChoice('Keep it monthly',
            (g, rng) => 'You prefer the steady drip.'),
      ],
    ),
    CrisisEvent(
      id: 'gentrification',
      emoji: '📈',
      title: 'The neighborhood is booming',
      body: 'A trendy district sprang up around one of your properties.',
      eligible: (g) => g.properties.isNotEmpty,
      choices: [
        CrisisChoice('Ride the wave', (g, rng) {
          final p = _randProp(g, rng)!;
          final bump = p.currentValue * 0.15;
          p.currentValue += bump;
          return 'Your ${Properties.byId(p.defId).name} jumped ${_usd(bump)} '
              'in value.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'hoa_fine',
      emoji: '📋',
      title: 'HOA on the warpath',
      body: 'The homeowners\' association says your place violates the rules.',
      eligible: (g) => g.properties.isNotEmpty,
      choices: [
        CrisisChoice('Pay the fine', (g, rng) {
          final amt = _scaled(g, 0.008, 500);
          g.cash -= amt;
          return 'Paid the ${_usd(amt)} fine. Pick your battles.';
        }),
        CrisisChoice('Fight the board', (g, rng) {
          if (rng.nextBool()) return 'You won the meeting. Fine dropped.';
          final amt = _scaled(g, 0.015, 900);
          g.cash -= amt;
          return 'They doubled down. ${_usd(amt)} with legal costs.';
        }),
      ],
    ),

    // ===================== Loan sharks / debt ==========================
    CrisisEvent(
      id: 'loan_shark',
      emoji: '🦈',
      title: 'A loan shark\'s offer',
      body: 'A "friend of a friend" offers fast cash, no questions asked. The '
          'terms are… not friendly.',
      choices: [
        CrisisChoice('Take the cash', (g, rng) {
          final amt = _scaled(g, 0.12, 5000);
          g.cash += amt;
          g.debt += amt * 1.4;
          return 'You take ${_usd(amt)} — and now owe ${_usd(amt * 1.4)} at a '
              'brutal rate.';
        }),
        CrisisChoice('Walk away', (g, rng) => 'You keep your kneecaps.'),
      ],
    ),
    CrisisEvent(
      id: 'payday_loan',
      emoji: '💸',
      title: 'Payday loan billboard',
      body: 'Quick money to smooth things over — at an eye-watering APR.',
      choices: [
        CrisisChoice('Borrow a little', (g, rng) {
          final amt = _scaled(g, 0.05, 2000);
          g.cash += amt;
          g.debt += amt * 1.25;
          return 'Borrowed ${_usd(amt)}; you owe ${_usd(amt * 1.25)}.';
        }),
        CrisisChoice('Hard pass', (g, rng) => 'You\'ve heard how this ends.'),
      ],
    ),
    CrisisEvent(
      id: 'shark_collects',
      emoji: '🦈',
      title: 'The shark wants his money',
      body: 'Your lender\'s associates are at the door about your debt.',
      eligible: (g) => g.debt > 0,
      choices: [
        CrisisChoice('Pay what you can', (g, rng) {
          final amt = (g.debt * 0.4) > g.cash ? g.cash : g.debt * 0.4;
          g.cash -= amt;
          g.debt -= amt;
          if (g.debt < 0.01) g.debt = 0;
          return 'You hand over ${_usd(amt)}. They\'ll be back.';
        }),
        CrisisChoice('Dodge them', (g, rng) {
          if (rng.nextBool()) return 'You lay low. For now.';
          final add = g.debt * 0.3;
          g.debt += add;
          return 'Bad idea — they tacked on ${_usd(add)} in "fees".';
        }),
      ],
    ),
    CrisisEvent(
      id: 'debt_consolidation',
      emoji: '🧮',
      title: 'A way out of debt?',
      body: 'A consolidation firm offers to refinance your debt — for a fee.',
      eligible: (g) => g.debt > 0,
      choices: [
        CrisisChoice('Refinance', (g, rng) {
          final fee = g.debt * 0.05;
          g.cash -= fee;
          g.debt *= 0.75;
          return 'Paid ${_usd(fee)}; your debt drops by a quarter.';
        }),
        CrisisChoice('Go it alone', (g, rng) => 'You\'ll handle it yourself.'),
      ],
    ),

    // ===================== Gambles / scams =============================
    CrisisEvent(
      id: 'startup',
      emoji: '🚀',
      title: 'A friend\'s startup',
      body: 'An old friend wants you in on their startup. 5x… or zero.',
      choices: [
        CrisisChoice('Write a check', (g, rng) {
          final amt = _scaled(g, 0.08, 2000);
          g.cash -= amt;
          if (rng.nextDouble() < 0.35) {
            g.cash += amt * 5;
            return 'It hit! ${_usd(amt)} became ${_usd(amt * 5)}.';
          }
          return 'It folded. You lost ${_usd(amt)}.';
        }),
        CrisisChoice('Politely pass', (g, rng) => 'You keep your powder dry.'),
      ],
    ),
    CrisisEvent(
      id: 'insider_tip',
      emoji: '🤫',
      title: 'A too-good tip',
      body: 'Someone slips you "guaranteed" inside info. It\'s not legal.',
      choices: [
        CrisisChoice('Act on it', (g, rng) {
          if (rng.nextDouble() < 0.5) {
            final amt = _scaled(g, 0.10, 3000);
            g.cash += amt;
            return 'It paid — ${_usd(amt)} richer. No one noticed.';
          }
          final amt = _scaled(g, 0.12, 4000);
          g.cash -= amt;
          return 'You got caught. Fines: ${_usd(amt)}.';
        }),
        CrisisChoice('Walk away', (g, rng) => 'You keep your hands clean.'),
      ],
    ),
    CrisisEvent(
      id: 'pyramid',
      emoji: '🔺',
      title: 'An "amazing opportunity"',
      body: 'A cousin pitches you a "business" with a suspiciously tiered '
          'structure.',
      choices: [
        CrisisChoice('Buy in', (g, rng) {
          final amt = _scaled(g, 0.03, 1500);
          g.cash -= amt;
          if (rng.nextDouble() < 0.2) {
            g.cash += amt * 2;
            return 'You got out near the top — doubled to ${_usd(amt * 2)}.';
          }
          return 'It collapsed, as they do. Lost ${_usd(amt)}.';
        }),
        CrisisChoice('Decline', (g, rng) => 'You\'ve seen this movie.'),
      ],
    ),
    CrisisEvent(
      id: 'casino',
      emoji: '🎲',
      title: 'A night at the casino',
      body: 'The table is hot and the drinks are free.',
      choices: [
        CrisisChoice('Place a big bet', (g, rng) {
          final amt = _scaled(g, 0.03, 1000);
          if (rng.nextDouble() < 0.48) {
            g.cash += amt;
            return 'Red hits! You\'re up ${_usd(amt)}.';
          }
          g.cash -= amt;
          return 'The house wins. Down ${_usd(amt)}.';
        }),
        CrisisChoice('Call it a night', (g, rng) => 'You cash out even. Wise.'),
      ],
    ),
    CrisisEvent(
      id: 'crypto_hack',
      emoji: '🔓',
      title: 'Your exchange got hacked',
      body: 'The platform holding your crypto was breached.',
      eligible: (g) => _holds(g, AssetKind.crypto),
      choices: [
        CrisisChoice('Brace for it', (g, rng) {
          final h = _randOfKind(g, rng, AssetKind.crypto)!;
          final name = Catalog.assetById(h.assetId).name;
          if (rng.nextDouble() < 0.5) {
            return 'Your $name was in cold storage — untouched. Phew.';
          }
          final lost = g.valueOf(h) * 0.4;
          h.shares *= 0.6;
          h.costBasis *= 0.6;
          return 'They drained 40% of your $name — ${_usd(lost)} gone.';
        }),
        CrisisChoice('Move to a hardware wallet', (g, rng) {
          final amt = _scaled(g, 0.005, 200);
          g.cash -= amt;
          return 'You self-custody for ${_usd(amt)}. Sleep easier.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'overseas_deal',
      emoji: '✈️',
      title: 'An overseas "investment"',
      body: 'A stranger emails about a fortune that just needs your help (and a '
          'small fee).',
      choices: [
        CrisisChoice('Send the fee', (g, rng) {
          final amt = _scaled(g, 0.02, 1000);
          g.cash -= amt;
          return 'Shockingly, it was a scam. ${_usd(amt)} gone.';
        }),
        CrisisChoice('Delete it', (g, rng) => 'Into the trash it goes.'),
      ],
    ),

    // ===================== Everyday life ==============================
    CrisisEvent(
      id: 'wedding',
      emoji: '💒',
      title: 'A destination wedding',
      body: 'Your friend is getting married — somewhere expensive.',
      choices: [
        CrisisChoice('Go all out', (g, rng) {
          final amt = _scaled(g, 0.02, 1200);
          g.cash -= amt;
          return 'Flights, hotel, gift: ${_usd(amt)}. Worth it.';
        }),
        CrisisChoice('Send a gift, skip the trip', (g, rng) {
          final amt = _scaled(g, 0.004, 300);
          g.cash -= amt;
          return 'A thoughtful ${_usd(amt)} gift and your regrets.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'friend_borrow',
      emoji: '🙏',
      title: 'A friend needs a loan',
      body: 'A close friend is in a tight spot and asks to borrow money.',
      choices: [
        CrisisChoice('Lend it', (g, rng) {
          final amt = _scaled(g, 0.03, 1500);
          g.cash -= amt;
          if (rng.nextDouble() < 0.6) {
            g.cash += amt;
            return 'They paid you back in full. A friendship intact.';
          }
          return 'They vanished. You\'re out ${_usd(amt)} and a friend.';
        }),
        CrisisChoice('Gently decline', (g, rng) =>
            'You keep money and friendship separate.'),
      ],
    ),
    CrisisEvent(
      id: 'jury_duty',
      emoji: '👨‍⚖️',
      title: 'Jury duty',
      body: 'You\'ve been summoned for a long trial.',
      choices: [
        CrisisChoice('Serve your civic duty', (g, rng) {
          final amt = g.effectivePay * 0.3;
          g.cash -= amt;
          return 'Lost ${_usd(amt)} of income, gained a story.';
        }),
        CrisisChoice('Get excused', (g, rng) => 'You wriggle out of it.'),
      ],
    ),
    CrisisEvent(
      id: 'pet_emergency',
      emoji: '🐕',
      title: 'Your pet is sick',
      body: 'A trip to the emergency vet is never cheap.',
      choices: [
        CrisisChoice('Whatever it takes', (g, rng) {
          final amt = _scaled(g, 0.02, 900);
          g.cash -= amt;
          return 'Good as new for ${_usd(amt)}. Worth every penny.';
        }),
        CrisisChoice('The basic plan', (g, rng) {
          final amt = _scaled(g, 0.008, 400);
          g.cash -= amt;
          return 'The essentials — ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'rent_hike',
      emoji: '🏢',
      title: 'Your landlord raised the rent',
      body: 'Your own rent just jumped. Eat it, or move?',
      choices: [
        CrisisChoice('Suck it up', (g, rng) {
          final amt = _scaled(g, 0.01, 600);
          g.cash -= amt;
          return 'You absorb the ${_usd(amt)} hike for now.';
        }),
        CrisisChoice('Move somewhere cheaper', (g, rng) {
          final amt = _scaled(g, 0.015, 800);
          g.cash -= amt;
          return 'Moving costs ${_usd(amt)} up front, but you\'ll save later.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'brand_deal',
      emoji: '📱',
      title: 'You went viral',
      body: 'A post blew up and a brand wants to sponsor you.',
      choices: [
        CrisisChoice('Cash the check', (g, rng) {
          final amt = _scaled(g, 0.03, 2000);
          g.cash += amt;
          return 'A ${_usd(amt)} brand deal. Easy money.';
        }),
        CrisisChoice('Stay authentic', (g, rng) =>
            'You keep your feed sponsor-free. Respect.'),
      ],
    ),
    CrisisEvent(
      id: 'art_flip',
      emoji: '🖼️',
      title: 'An estate-sale find',
      body: 'You spot a painting that might be worth a fortune… or nothing.',
      choices: [
        CrisisChoice('Buy and authenticate', (g, rng) {
          final amt = _scaled(g, 0.02, 1000);
          g.cash -= amt;
          if (rng.nextDouble() < 0.4) {
            final win = amt * 4;
            g.cash += win;
            return 'It\'s the real deal — sold for ${_usd(win)}!';
          }
          return 'A clever fake. You\'re out ${_usd(amt)}.';
        }),
        CrisisChoice('Leave it', (g, rng) => 'Probably for the best.'),
      ],
    ),
    CrisisEvent(
      id: 'natural_disaster',
      emoji: '🌪️',
      title: 'Disaster hits your area',
      body: 'A storm tears through town.',
      choices: [
        CrisisChoice('Cover the damage', (g, rng) {
          if (rng.nextDouble() < 0.4) {
            return 'You got lucky — barely a scratch.';
          }
          final amt = _scaled(g, 0.04, 1500);
          g.cash -= amt;
          return 'Repairs and supplies: ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'charity_gala',
      emoji: '🕴️',
      title: 'A charity gala',
      body: 'You\'re invited to a black-tie fundraiser — donations expected.',
      choices: [
        CrisisChoice('Donate generously', (g, rng) {
          final amt = _scaled(g, 0.02, 1000);
          g.cash -= amt;
          return 'You give ${_usd(amt)}. The room applauds.';
        }),
        CrisisChoice('Just the ticket', (g, rng) {
          final amt = _scaled(g, 0.004, 250);
          g.cash -= amt;
          return 'You cover the ${_usd(amt)} plate and slip out early.';
        }),
      ],
    ),

    // ===================== Markets / holdings ==========================
    CrisisEvent(
      id: 'stock_buyout',
      emoji: '🏷️',
      title: 'A buyout offer',
      body: 'A company you own shares in is being acquired at a premium.',
      eligible: (g) => _holds(g, AssetKind.stock),
      choices: [
        CrisisChoice('Take the premium', (g, rng) {
          final h = _randOfKind(g, rng, AssetKind.stock)!;
          final name = Catalog.assetById(h.assetId).name;
          final v = g.valueOf(h);
          final bonus = v * 0.20;
          g.sell(h, 0, max: true);
          g.cash += bonus;
          return 'Your $name was bought out — cashed ${_usd(v + bonus)} (+20%).';
        }),
        CrisisChoice('Hold for more',
            (g, rng) => 'You bet a higher bid is coming.'),
      ],
    ),
    CrisisEvent(
      id: 'special_dividend',
      emoji: '💵',
      title: 'A special dividend',
      body: 'A company you hold is returning a pile of cash to shareholders.',
      eligible: (g) => _holds(g, AssetKind.stock),
      choices: [
        CrisisChoice('Collect it', (g, rng) {
          final h = _randOfKind(g, rng, AssetKind.stock)!;
          final amt = g.valueOf(h) * 0.05;
          g.cash += amt;
          return 'A ${_usd(amt)} special dividend hits your account.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'recession_warning',
      emoji: '🌧️',
      title: 'Storm clouds gathering',
      body: 'Analysts whisper a downturn is coming. Hedge, or hold?',
      eligible: (g) =>
          g.regime == MarketRegime.boom || g.regime == MarketRegime.normal,
      choices: [
        CrisisChoice('Hedge with gold', (g, rng) {
          final amt = _buy(g, 'gold', _scaled(g, 0.10, 2000));
          return amt > 0
              ? 'Moved ${_usd(amt)} into gold.'
              : 'Not enough cash to hedge.';
        }),
        CrisisChoice('Ignore the noise', (g, rng) => 'You stay the course.'),
      ],
    ),
    CrisisEvent(
      id: 'buy_the_dip',
      emoji: '🌪️',
      title: 'Blood in the streets',
      body: 'The market is in free-fall and everyone is panicking.',
      eligible: (g) =>
          g.regime == MarketRegime.crash || g.regime == MarketRegime.downturn,
      choices: [
        CrisisChoice('Back up the truck', (g, rng) {
          final amt = _buy(g, 'spx', _scaled(g, 0.20, 3000));
          return amt > 0
              ? 'Bought the dip — ${_usd(amt)} into the S&P.'
              : 'Not enough cash to pounce.';
        }),
        CrisisChoice('Sit tight', (g, rng) => 'You wait it out.'),
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
