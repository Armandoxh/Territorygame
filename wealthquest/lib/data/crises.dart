import 'dart:math';

import '../models/asset.dart';
import '../models/climate.dart';
import '../models/crisis.dart';
import '../models/holding.dart';
import '../models/property.dart';
import '../state/game_controller.dart';
import 'catalog.dart';
import 'properties.dart';

/// The library of crisis / decision events, plus the picker.
///
/// Events are TIERED BY NET WORTH ([CrisisEvent.minNetWorth]/[maxNetWorth]):
/// you start with cheap everyday surprises, and bigger, pricier events unlock
/// as you get wealthy (while petty ones fade out). Cheap events use roughly
/// flat dollar costs; the expensive tiers scale with net worth so they bite.
/// And every choice has a cost somewhere — even "free" windfalls (a severance
/// means months without a paycheck).
///
/// Real-world expense inspiration: home (furnace/roof/foundation/plumbing),
/// auto (transmission/tires), medical, legal, and the rest.
class Crises {
  Crises._();

  // ---- helpers ----------------------------------------------------------
  static double _flat(Random rng, double lo, double hi) =>
      lo + rng.nextDouble() * (hi - lo);

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

  // Tier thresholds (net worth) for readability.
  static const double _t1 = 30000;
  static const double _t2 = 150000;
  static const double _t3 = 750000;
  static const double _t4 = 5000000;

  static final List<CrisisEvent> all = [
    // ============ TIER 0 — everyday cheap surprises (fade when rich) ======
    CrisisEvent(
      id: 'broken_phone',
      emoji: '📱',
      title: 'Your phone died',
      body: 'You dropped it one too many times. You need a working phone.',
      maxNetWorth: 400000,
      choices: [
        CrisisChoice('Buy a new one', (g, rng) {
          final amt = _flat(rng, 500, 900);
          g.cash -= amt;
          return 'A shiny replacement: ${_usd(amt)}.';
        }),
        CrisisChoice('Get the cracked screen fixed', (g, rng) {
          final amt = _flat(rng, 150, 320);
          g.cash -= amt;
          return 'Patched up for ${_usd(amt)}. Good enough.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'car_repair',
      emoji: '🔧',
      title: 'Check-engine light',
      body: 'Your car is making a noise that sounds expensive.',
      maxNetWorth: 600000,
      choices: [
        CrisisChoice('Take it to the shop', (g, rng) {
          final amt = _flat(rng, 500, 1100);
          g.cash -= amt;
          return 'Repaired for ${_usd(amt)}.';
        }),
        CrisisChoice('Ignore it for now', (g, rng) {
          if (rng.nextDouble() < 0.5) return 'It... stopped? You got lucky.';
          final amt = _flat(rng, 1500, 3000);
          g.cash -= amt;
          return 'It got much worse. ${_usd(amt)} to fix.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'tires',
      emoji: '🛞',
      title: 'Bald tires (and brakes)',
      body: 'The mechanic says it\'s past time.',
      maxNetWorth: 400000,
      choices: [
        CrisisChoice('Replace them', (g, rng) {
          final amt = _flat(rng, 400, 850);
          g.cash -= amt;
          return 'New rubber for ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'parking',
      emoji: '🅿️',
      title: 'Towed!',
      body: 'You parked in the wrong spot and the city noticed.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Pay the ticket + tow', (g, rng) {
          final amt = _flat(rng, 150, 450);
          g.cash -= amt;
          return 'Sprung your car for ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'vet',
      emoji: '🐕',
      title: 'Your pet is sick',
      body: 'A trip to the emergency vet is never cheap.',
      maxNetWorth: 500000,
      choices: [
        CrisisChoice('Whatever it takes', (g, rng) {
          final amt = _flat(rng, 500, 1000);
          g.cash -= amt;
          return 'Good as new for ${_usd(amt)}.';
        }),
        CrisisChoice('The basic plan', (g, rng) {
          final amt = _flat(rng, 200, 400);
          g.cash -= amt;
          return 'The essentials — ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'dental',
      emoji: '🦷',
      title: 'Surprise root canal',
      body: 'That twinge turned out to be serious.',
      maxNetWorth: 500000,
      choices: [
        CrisisChoice('Get it done', (g, rng) {
          final amt = _flat(rng, 600, 1300);
          g.cash -= amt;
          return 'Fixed for ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'appliance',
      emoji: '🧺',
      title: 'The washer died',
      body: 'A major appliance gave up the ghost.',
      maxNetWorth: 600000,
      choices: [
        CrisisChoice('Replace it', (g, rng) {
          final amt = _flat(rng, 700, 1500);
          g.cash -= amt;
          return 'New appliance: ${_usd(amt)}.';
        }),
        CrisisChoice('Repair the old one', (g, rng) {
          if (rng.nextDouble() < 0.6) {
            final amt = _flat(rng, 200, 450);
            g.cash -= amt;
            return 'Limping along for ${_usd(amt)}.';
          }
          final amt = _flat(rng, 800, 1500);
          g.cash -= amt;
          return 'Unfixable — bought new anyway. ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'laptop',
      emoji: '💻',
      title: 'Your laptop fried',
      body: 'A spilled coffee claimed your machine.',
      maxNetWorth: 500000,
      choices: [
        CrisisChoice('Buy a replacement', (g, rng) {
          final amt = _flat(rng, 700, 1400);
          g.cash -= amt;
          return 'Back in business for ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'minor_medical',
      emoji: '🩹',
      title: 'Urgent care visit',
      body: 'Nothing serious, but the copay still stings.',
      maxNetWorth: 500000,
      choices: [
        CrisisChoice('Pay the copay', (g, rng) {
          final amt = _flat(rng, 300, 900);
          g.cash -= amt;
          return 'Patched up for ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'speeding',
      emoji: '🚓',
      title: 'Speeding ticket',
      body: 'Those flashing lights were for you.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Just pay it', (g, rng) {
          final amt = _flat(rng, 200, 500);
          g.cash -= amt;
          return 'Fine paid: ${_usd(amt)}. Slow down.';
        }),
        CrisisChoice('Contest it', (g, rng) {
          if (rng.nextBool()) return 'Dismissed on a technicality!';
          final amt = _flat(rng, 350, 700);
          g.cash -= amt;
          return 'Lost — fine plus court costs: ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'jury_duty',
      emoji: '👨‍⚖️',
      title: 'Jury duty',
      body: 'You\'ve been summoned for a long trial.',
      maxNetWorth: 400000,
      choices: [
        CrisisChoice('Serve', (g, rng) {
          final amt = g.effectivePay * 0.3;
          g.cash -= amt;
          return 'Lost ${_usd(amt)} of income, gained a story.';
        }),
        CrisisChoice('Get excused', (g, rng) => 'You wriggle out of it.'),
      ],
    ),
    CrisisEvent(
      id: 'found_wallet',
      emoji: '👛',
      title: 'You found a wallet',
      body: 'Stuffed with cash and an ID. Return it, or keep it?',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('Return it', (g, rng) {
          final amt = _flat(rng, 150, 500);
          g.cash += amt;
          return 'A ${_usd(amt)} reward. Karma.';
        }),
        CrisisChoice('Keep the cash', (g, rng) {
          final amt = _flat(rng, 300, 800);
          g.cash += amt;
          return 'You pocket ${_usd(amt)}. Don\'t think about it.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'scratch_ticket',
      emoji: '🎰',
      title: 'A lucky scratch ticket',
      body: 'That gas-station ticket actually hit.',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('Cash it in', (g, rng) {
          final amt = _flat(rng, 500, 3000);
          g.cash += amt;
          return 'You win ${_usd(amt)}!';
        }),
      ],
    ),
    CrisisEvent(
      id: 'rent_hike',
      emoji: '🏢',
      title: 'Your rent went up',
      body: 'Your landlord raised it. Eat it, or move?',
      maxNetWorth: 500000,
      choices: [
        CrisisChoice('Suck it up', (g, rng) {
          final amt = _flat(rng, 600, 1200);
          g.cash -= amt;
          return 'You absorb the ${_usd(amt)} hike.';
        }),
        CrisisChoice('Move somewhere cheaper', (g, rng) {
          final amt = _flat(rng, 1200, 2500);
          g.cash -= amt;
          return 'Moving cost ${_usd(amt)} up front, but you\'ll save.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'wedding_gift',
      emoji: '🎁',
      title: 'A friend\'s wedding',
      body: 'Gift, outfit, the works.',
      maxNetWorth: 400000,
      choices: [
        CrisisChoice('Be generous', (g, rng) {
          final amt = _flat(rng, 200, 600);
          g.cash -= amt;
          return 'A lovely ${_usd(amt)} gift.';
        }),
        CrisisChoice('Send your regrets', (g, rng) =>
            'A card and your best wishes. Free.'),
      ],
    ),
    CrisisEvent(
      id: 'friend_borrow',
      emoji: '🙏',
      title: 'A friend needs a loan',
      body: 'A close friend is in a tight spot and asks to borrow money.',
      maxNetWorth: 600000,
      choices: [
        CrisisChoice('Lend it', (g, rng) {
          final amt = _flat(rng, 800, 2000);
          g.cash -= amt;
          if (rng.nextDouble() < 0.6) {
            g.cash += amt;
            return 'They paid you back. Friendship intact.';
          }
          return 'They vanished. Out ${_usd(amt)} and a friend.';
        }),
        CrisisChoice('Gently decline', (g, rng) =>
            'You keep money and friendship separate.'),
      ],
    ),
    CrisisEvent(
      id: 'casino',
      emoji: '🎲',
      title: 'A night at the casino',
      body: 'The table is hot and the drinks are free.',
      choices: [
        CrisisChoice('Place a bet', (g, rng) {
          final amt = _flat(rng, 500, 1500);
          if (rng.nextDouble() < 0.48) {
            g.cash += amt;
            return 'Red hits! Up ${_usd(amt)}.';
          }
          g.cash -= amt;
          return 'The house wins. Down ${_usd(amt)}.';
        }),
        CrisisChoice('Call it a night', (g, rng) => 'You cash out even. Wise.'),
      ],
    ),
    CrisisEvent(
      id: 'payday_loan',
      emoji: '💸',
      title: 'Payday loan billboard',
      body: 'Quick money to smooth things over — at an eye-watering APR.',
      maxNetWorth: 150000,
      choices: [
        CrisisChoice('Borrow a little', (g, rng) {
          final amt = _flat(rng, 1000, 3000);
          g.cash += amt;
          g.debt += amt * 1.25;
          return 'Borrowed ${_usd(amt)}; you owe ${_usd(amt * 1.25)}.';
        }),
        CrisisChoice('Hard pass', (g, rng) => 'You\'ve heard how this ends.'),
      ],
    ),
    CrisisEvent(
      id: 'side_hustle',
      emoji: '💡',
      title: 'A side-hustle idea',
      body: 'You could spin up a little business — for a price.',
      maxNetWorth: 600000,
      choices: [
        CrisisChoice('Go for it', (g, rng) {
          final cost = _flat(rng, 800, 1800);
          g.cash -= cost;
          if (rng.nextDouble() < 0.5) {
            final win = cost * 3;
            g.cash += win;
            return 'It took off — ${_usd(win)} in sales.';
          }
          return 'It fizzled. Out ${_usd(cost)}.';
        }),
        CrisisChoice('Stay focused', (g, rng) => 'You keep your weekends.'),
      ],
    ),

    // ============ TIER 0 — everyday windfalls (balance the surprises) ======
    CrisisEvent(
      id: 'tax_refund',
      emoji: '💵',
      title: 'A fat tax refund',
      body: 'Turns out you over-withheld all year. The government owes you.',
      maxNetWorth: 400000,
      choices: [
        CrisisChoice('Cash the check', (g, rng) {
          final amt = _flat(rng, 600, 1800);
          g.cash += amt;
          return 'A ${_usd(amt)} refund lands in your account.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'sold_clutter',
      emoji: '📦',
      title: 'You cleaned out the closet',
      body: 'A weekend of decluttering turned up stuff worth selling.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('List it all online', (g, rng) {
          final amt = _flat(rng, 400, 1200);
          g.cash += amt;
          return 'Sold the lot for ${_usd(amt)}.';
        }),
        CrisisChoice('Just the big stuff', (g, rng) {
          final amt = _flat(rng, 200, 600);
          g.cash += amt;
          return 'Quick flip — ${_usd(amt)}, no fuss.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'referral_bonus',
      emoji: '🤝',
      title: 'A referral paid out',
      body: 'A friend you referred at work got hired — and you get a bonus.',
      maxNetWorth: 500000,
      choices: [
        CrisisChoice('Nice', (g, rng) {
          final amt = _flat(rng, 500, 1500);
          g.cash += amt;
          return 'A ${_usd(amt)} referral bonus hits your paycheck.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'cashback',
      emoji: '💳',
      title: 'A sign-up bonus posted',
      body: 'That credit-card cashback offer finally cleared.',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('Take the rewards', (g, rng) {
          final amt = _flat(rng, 200, 700);
          g.cash += amt;
          return '${_usd(amt)} in cashback — free money for spending anyway.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'birthday_cash',
      emoji: '🎂',
      title: 'Birthday money',
      body: 'Cards arrive, and a few of them have cash tucked inside.',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('Thanks, relatives', (g, rng) {
          final amt = _flat(rng, 150, 600);
          g.cash += amt;
          return 'You pocket ${_usd(amt)} in birthday cash.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'overtime',
      emoji: '⏰',
      title: 'Overtime is on offer',
      body: 'Your boss needs the weekend covered — time-and-a-half.',
      maxNetWorth: 400000,
      choices: [
        CrisisChoice('Pick up the shifts', (g, rng) {
          final amt = _flat(rng, 400, 1100);
          g.cash += amt;
          return 'You grind the weekend and bank ${_usd(amt)}.';
        }),
        CrisisChoice('Enjoy your weekend', (g, rng) =>
            'You rest up. Money isn\'t everything.'),
      ],
    ),
    CrisisEvent(
      id: 'class_action',
      emoji: '📬',
      title: 'A class-action check',
      body: 'Some company wronged you years ago. The settlement just paid out.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Deposit it', (g, rng) {
          final amt = _flat(rng, 150, 800);
          g.cash += amt;
          return 'A surprise ${_usd(amt)} for a lawsuit you forgot about.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'office_raffle',
      emoji: '🎟️',
      title: 'You won the office raffle',
      body: 'You never win these. This time your ticket came up.',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('Collect the prize', (g, rng) {
          final amt = _flat(rng, 300, 1200);
          g.cash += amt;
          return 'A ${_usd(amt)} prize — beginner\'s luck.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'freelance_gig',
      emoji: '💼',
      title: 'A freelance gig lands',
      body: 'An old contact needs a quick project done on the side.',
      maxNetWorth: 500000,
      choices: [
        CrisisChoice('Take the job', (g, rng) {
          final amt = _flat(rng, 600, 2000);
          g.cash += amt;
          return 'A few evenings\' work for ${_usd(amt)}.';
        }),
        CrisisChoice('Too busy', (g, rng) => 'You let this one pass.'),
      ],
    ),
    CrisisEvent(
      id: 'utility_rebate',
      emoji: '🧾',
      title: 'A rebate finally cleared',
      body: 'That energy-efficiency rebate you filed for ages ago came through.',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('About time', (g, rng) {
          final amt = _flat(rng, 150, 500);
          g.cash += amt;
          return '${_usd(amt)} back in your pocket.';
        }),
      ],
    ),

    // ============ TIER 1 — mid-life expenses ($30k+) ======================
    CrisisEvent(
      id: 'transmission',
      emoji: '🚗',
      title: 'Your transmission blew',
      body: 'One of the priciest things a car can do.',
      minNetWorth: _t1,
      choices: [
        CrisisChoice('Rebuild it', (g, rng) {
          final amt = _flat(rng, 2000, 4500);
          g.cash -= amt;
          return 'Back on the road for ${_usd(amt)}.';
        }),
        CrisisChoice('Buy a different car', (g, rng) {
          final amt = _scaled(g, 0.04, 6000);
          g.cash -= amt;
          return 'Traded up instead — ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'furnace',
      emoji: '🔥',
      title: 'The furnace quit in winter',
      body: 'No heat, and a new HVAC system isn\'t cheap.',
      minNetWorth: _t1,
      choices: [
        CrisisChoice('High-efficiency unit', (g, rng) {
          final amt = _flat(rng, 5000, 9000);
          g.cash -= amt;
          return 'Toasty again — ${_usd(amt)}.';
        }),
        CrisisChoice('Builder-grade replacement', (g, rng) {
          final amt = _flat(rng, 3000, 5000);
          g.cash -= amt;
          return 'It\'ll do. ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'plumbing',
      emoji: '🚽',
      title: 'Sewer line backup',
      body: 'A nightmare under the house.',
      minNetWorth: _t1,
      choices: [
        CrisisChoice('Call the plumber', (g, rng) {
          final amt = _flat(rng, 1500, 4000);
          g.cash -= amt;
          return 'Cleared and repaired for ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'medical_bill',
      emoji: '🏥',
      title: 'Hospital stay',
      body: 'Even insured, the out-of-pocket bills are brutal.',
      minNetWorth: _t1,
      choices: [
        CrisisChoice('Pay it down', (g, rng) {
          final amt = _scaled(g, 0.04, 3000);
          g.cash -= amt;
          return 'Settled the ${_usd(amt)} bill.';
        }),
        CrisisChoice('Negotiate a payment plan', (g, rng) {
          final amt = _scaled(g, 0.05, 3500);
          g.addObligation('Hospital payment plan', amt / 6, 6);
          return 'Spread ${_usd(amt)} over six months.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'audit',
      emoji: '🧾',
      title: 'Tax audit',
      body: 'The tax office wants a word about last year.',
      minNetWorth: _t1,
      choices: [
        CrisisChoice('Just pay it', (g, rng) {
          final amt = _scaled(g, 0.06, 2000);
          g.cash -= amt;
          return 'Paid ${_usd(amt)} in back taxes.';
        }),
        CrisisChoice('Hire an accountant', (g, rng) {
          final amt = _scaled(g, 0.025, 1500);
          g.cash -= amt;
          return 'Whittled down to ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'lawsuit',
      emoji: '⚖️',
      title: 'You\'re being sued',
      body: 'A former associate is suing over an old deal.',
      minNetWorth: _t1,
      choices: [
        CrisisChoice('Settle quietly', (g, rng) {
          final amt = _scaled(g, 0.04, 2000);
          g.cash -= amt;
          return 'Settled for ${_usd(amt)}.';
        }),
        CrisisChoice('Fight it', (g, rng) {
          if (rng.nextBool()) {
            final amt = _scaled(g, 0.012, 1000);
            g.cash -= amt;
            return 'You won — ${_usd(amt)} in fees.';
          }
          final amt = _scaled(g, 0.09, 5000);
          g.cash -= amt;
          return 'You lost. Damages + fees: ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'wedding_destination',
      emoji: '💒',
      title: 'A destination wedding',
      body: 'Your friend is getting married — somewhere expensive.',
      minNetWorth: _t1,
      choices: [
        CrisisChoice('Go all out', (g, rng) {
          final amt = _scaled(g, 0.02, 2000);
          g.cash -= amt;
          return 'Flights, hotel, gift: ${_usd(amt)}.';
        }),
        CrisisChoice('Send a gift, skip the trip', (g, rng) {
          final amt = _flat(rng, 300, 700);
          g.cash -= amt;
          return 'A thoughtful ${_usd(amt)} gift.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'certification',
      emoji: '🎓',
      title: 'A career-boosting course',
      body: 'A pricey certification could pay off at work.',
      minNetWorth: _t1,
      choices: [
        CrisisChoice('Pay for it', (g, rng) {
          final cost = g.effectivePay * 0.8 + 500;
          g.cash -= cost;
          if (rng.nextDouble() < 0.7) {
            final bump = (g.effectivePay + 500) * 2;
            g.cash += bump;
            return 'Landed you a ${_usd(bump)} project bonus.';
          }
          return 'No payoff yet. (−${_usd(cost)})';
        }),
        CrisisChoice('Skip it', (g, rng) => 'Maybe next year.'),
      ],
    ),
    CrisisEvent(
      id: 'headhunter',
      emoji: '📞',
      title: 'A headhunter calls',
      body: 'A rival wants you. Take a signing bonus and jump (with a gap '
          'between jobs), or negotiate a raise where you are?',
      minNetWorth: _t1,
      choices: [
        CrisisChoice('Jump for a signing bonus', (g, rng) {
          final amt = (g.job.pay) * 2;
          g.cash += amt;
          g.takeUnpaidLeave(1, 'Job transition — no pay');
          return 'A ${_usd(amt)} bonus — but a month off the payroll first.';
        }),
        CrisisChoice('Negotiate a raise', (g, rng) {
          if (rng.nextDouble() < 0.7) {
            final amt = g.effectivePay * 1.2;
            g.cash += amt;
            return 'They counter — a ${_usd(amt)} retention bump.';
          }
          return 'They call your bluff. You stay put.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'layoff',
      emoji: '📉',
      title: 'Layoffs are coming',
      body: 'HR offers a voluntary buyout. The cash is nice — but you\'ll be '
          'job-hunting without a paycheck.',
      minNetWorth: _t1,
      choices: [
        CrisisChoice('Take the severance', (g, rng) {
          final amt = g.job.pay * 2.5;
          g.cash += amt;
          g.takeUnpaidLeave(3, 'Between jobs — no salary');
          return 'You take ${_usd(amt)} — but no salary for 3 months.';
        }),
        CrisisChoice('Stay and hope', (g, rng) =>
            'You keep your head down and your job.'),
      ],
    ),
    CrisisEvent(
      id: 'bonus',
      emoji: '🎁',
      title: 'Year-end bonus',
      body: 'Take it as cash, or as company stock that could swing either way?',
      minNetWorth: _t1,
      choices: [
        CrisisChoice('Take the cash', (g, rng) {
          final amt = g.job.pay * 1.5;
          g.cash += amt;
          return 'Banked a ${_usd(amt)} bonus.';
        }),
        CrisisChoice('Take stock', (g, rng) {
          final mult = 0.3 + rng.nextDouble() * 2.4;
          final amt = g.job.pay * 1.5 * mult;
          g.cash += amt;
          return mult >= 1
              ? 'The stock ran — worth ${_usd(amt)}.'
              : 'The stock slipped — worth ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'identity_theft',
      emoji: '🕵️',
      title: 'Identity theft',
      body: 'Someone\'s been racking up charges in your name.',
      minNetWorth: _t1,
      choices: [
        CrisisChoice('Pay for protection', (g, rng) {
          final amt = _scaled(g, 0.02, 1000);
          g.cash -= amt;
          return 'Locked it down for ${_usd(amt)}.';
        }),
        CrisisChoice('Dispute every charge', (g, rng) {
          if (rng.nextDouble() < 0.6) return 'You clawed it all back.';
          final amt = _scaled(g, 0.05, 2500);
          g.cash -= amt;
          return 'The bank sided against you — ${_usd(amt)} gone.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'moving',
      emoji: '📦',
      title: 'A cross-country move',
      body: 'Life calls you to a new city. Movers aren\'t cheap.',
      minNetWorth: _t1,
      choices: [
        CrisisChoice('Hire full-service movers', (g, rng) {
          final amt = _flat(rng, 3000, 6000);
          g.cash -= amt;
          return 'Door to door for ${_usd(amt)}.';
        }),
        CrisisChoice('Rent a truck, DIY', (g, rng) {
          final amt = _flat(rng, 1000, 2200);
          g.cash -= amt;
          g.takeUnpaidLeave(1, 'Off work for the move');
          return 'Cheaper at ${_usd(amt)} — but you take a month off to do it.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'injury',
      emoji: '🩼',
      title: 'A bad fall',
      body: 'You broke your leg — surgery, then weeks of recovery.',
      minNetWorth: _t1,
      choices: [
        CrisisChoice('Rest and recover properly', (g, rng) {
          final amt = _scaled(g, 0.03, 2000);
          g.cash -= amt;
          g.takeUnpaidLeave(2, 'Recovering — no pay');
          return 'Surgery ${_usd(amt)}, plus two months off work.';
        }),
        CrisisChoice('Push through it', (g, rng) {
          final amt = _scaled(g, 0.015, 1200);
          g.cash -= amt;
          if (rng.nextDouble() < 0.5) {
            g.takeUnpaidLeave(3, 'Re-injured — no pay');
            return 'You made it worse. ${_usd(amt)} and three months off.';
          }
          return 'You toughed it out. ${_usd(amt)} in bills.';
        }),
      ],
    ),

    // ============ Property / landlord (gated by ownership) ================
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
            final fee = _scaled(g, 0.01, 1500);
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
        CrisisChoice('Hold out', (g, rng) =>
            'You bet it\'ll be worth even more later.'),
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
          if (rng.nextDouble() < 0.5) return 'Appeal worked — bill waived.';
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
          return 'It failed. ${_usd(amt)} to rebuild.';
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
          final amt = _scaled(g, 0.015, 1000);
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
          final amt = _scaled(g, 0.02, 2000);
          g.cash -= amt;
          return 'Legally removed for ${_usd(amt)}.';
        }),
        CrisisChoice('Pay them to leave', (g, rng) {
          final amt = _scaled(g, 0.012, 1000);
          g.cash -= amt;
          return 'Cash-for-keys: ${_usd(amt)} and they\'re gone.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'prepay_tenant',
      emoji: '🤝',
      title: 'A tenant offers to prepay',
      body: 'A great renter offers a year of rent up front — but then no '
          'monthly checks from that unit for a while.',
      eligible: (g) => g.properties.any((h) => h.rentedOut),
      choices: [
        CrisisChoice('Take the lump sum', (g, rng) {
          final r = _randRental(g, rng)!;
          final amt = r.monthlyRent * 11;
          g.cash += amt;
          return 'A year of rent up front: ${_usd(amt)}.';
        }),
        CrisisChoice('Keep it monthly', (g, rng) =>
            'You prefer the steady drip.'),
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
          final amt = _scaled(g, 0.008, 600);
          g.cash -= amt;
          return 'Paid the ${_usd(amt)} fine. Pick your battles.';
        }),
        CrisisChoice('Fight the board', (g, rng) {
          if (rng.nextBool()) return 'You won the meeting. Fine dropped.';
          final amt = _scaled(g, 0.015, 1200);
          g.cash -= amt;
          return 'They doubled down. ${_usd(amt)} with legal costs.';
        }),
      ],
    ),

    // ============ TIER 2 — major events ($150k+) ==========================
    CrisisEvent(
      id: 'foundation',
      emoji: '🧱',
      title: 'Foundation problems',
      body: 'Cracks in the foundation — one of the priciest home repairs there '
          'is.',
      minNetWorth: _t2,
      choices: [
        CrisisChoice('Underpin it properly', (g, rng) {
          final amt = _scaled(g, 0.03, 12000);
          g.cash -= amt;
          return 'Stabilized for ${_usd(amt)}.';
        }),
        CrisisChoice('Cosmetic fix for now', (g, rng) {
          final amt = _scaled(g, 0.008, 3000);
          g.cash -= amt;
          if (rng.nextDouble() < 0.5) {
            final more = _scaled(g, 0.05, 18000);
            g.cash -= more;
            return 'It spread. ${_usd(amt + more)} all told.';
          }
          return 'Holding for now — ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'major_surgery',
      emoji: '🏥',
      title: 'Major surgery',
      body: 'A serious procedure — and serious recovery time.',
      minNetWorth: _t2,
      choices: [
        CrisisChoice('Get the best care', (g, rng) {
          final amt = _scaled(g, 0.06, 15000);
          g.cash -= amt;
          g.takeUnpaidLeave(2, 'Recovering — no pay');
          return '${_usd(amt)} for top care, plus two months off.';
        }),
        CrisisChoice('Go with what insurance covers', (g, rng) {
          final amt = _scaled(g, 0.03, 8000);
          g.cash -= amt;
          g.takeUnpaidLeave(1, 'Recovering — no pay');
          return '${_usd(amt)} out of pocket, a month off.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'eldercare',
      emoji: '👵',
      title: 'A parent needs care',
      body: 'An aging parent needs long-term care you\'ll be helping to cover.',
      minNetWorth: _t2,
      choices: [
        CrisisChoice('Cover a care facility', (g, rng) {
          final monthly = _scaled(g, 0.01, 3000);
          g.addObligation('Eldercare', monthly, 12);
          return 'A good facility: about ${_usd(monthly)}/mo for a year.';
        }),
        CrisisChoice('Care for them at home', (g, rng) {
          final amt = _scaled(g, 0.02, 4000);
          g.cash -= amt;
          g.takeUnpaidLeave(2, 'Family caregiving — no pay');
          return 'Renovations ${_usd(amt)}, and two months off to help.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'startup',
      emoji: '🚀',
      title: 'A friend\'s startup',
      body: 'An old friend wants you in. 5x… or zero.',
      minNetWorth: _t2,
      choices: [
        CrisisChoice('Write a check', (g, rng) {
          final amt = _scaled(g, 0.08, 5000);
          g.cash -= amt;
          if (rng.nextDouble() < 0.35) {
            g.cash += amt * 5;
            return 'It hit! ${_usd(amt)} became ${_usd(amt * 5)}.';
          }
          return 'It folded. Lost ${_usd(amt)}.';
        }),
        CrisisChoice('Politely pass', (g, rng) => 'You keep your powder dry.'),
      ],
    ),
    CrisisEvent(
      id: 'inheritance',
      emoji: '💰',
      title: 'An unexpected inheritance',
      body: 'A distant relative has left you a bequest.',
      minNetWorth: _t2,
      choices: [
        CrisisChoice('Accept the windfall', (g, rng) {
          final amt = _scaled(g, 0.10, 20000);
          g.cash += amt;
          return 'You inherit ${_usd(amt)}.';
        }),
        CrisisChoice('Take half, donate half', (g, rng) {
          final amt = _scaled(g, 0.10, 20000) / 2;
          g.cash += amt;
          return 'You keep ${_usd(amt)} and donate the rest.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'insider_tip',
      emoji: '🤫',
      title: 'A too-good tip',
      body: 'Someone slips you "guaranteed" inside info. It\'s not legal.',
      minNetWorth: _t2,
      choices: [
        CrisisChoice('Act on it', (g, rng) {
          if (rng.nextDouble() < 0.5) {
            final amt = _scaled(g, 0.10, 8000);
            g.cash += amt;
            return 'It paid — ${_usd(amt)} richer.';
          }
          final amt = _scaled(g, 0.12, 10000);
          g.cash -= amt;
          return 'You got caught. Fines: ${_usd(amt)}.';
        }),
        CrisisChoice('Walk away', (g, rng) => 'You keep your hands clean.'),
      ],
    ),
    CrisisEvent(
      id: 'brand_deal',
      emoji: '📱',
      title: 'You went viral',
      body: 'A post blew up and a brand wants to sponsor you.',
      minNetWorth: _t2,
      choices: [
        CrisisChoice('Cash the check', (g, rng) {
          final amt = _scaled(g, 0.03, 6000);
          g.cash += amt;
          return 'A ${_usd(amt)} brand deal.';
        }),
        CrisisChoice('Stay authentic', (g, rng) =>
            'You keep your feed sponsor-free.'),
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
            return 'Your $name was in cold storage — untouched.';
          }
          final lost = g.valueOf(h) * 0.4;
          h.shares *= 0.6;
          h.costBasis *= 0.6;
          return 'They drained 40% of your $name — ${_usd(lost)} gone.';
        }),
        CrisisChoice('Move to a hardware wallet', (g, rng) {
          final amt = _scaled(g, 0.005, 300);
          g.cash -= amt;
          return 'You self-custody for ${_usd(amt)}.';
        }),
      ],
    ),
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
          g.sell(h, 0, max: true);
          g.cash += v * 0.20;
          return 'Your $name was bought out — cashed ${_usd(v * 1.2)} (+20%).';
        }),
        CrisisChoice('Hold for more', (g, rng) =>
            'You bet a higher bid is coming.'),
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

    // ============ TIER 3 — wealthy problems ($750k+) ======================
    CrisisEvent(
      id: 'big_lawsuit',
      emoji: '👨‍⚖️',
      title: 'A serious lawsuit',
      body: 'This one isn\'t nuisance money — they\'re coming for real damages.',
      minNetWorth: _t3,
      choices: [
        CrisisChoice('Settle out of court', (g, rng) {
          final amt = _scaled(g, 0.06, 50000);
          g.cash -= amt;
          return 'Settled for ${_usd(amt)} to make it disappear.';
        }),
        CrisisChoice('Go to trial', (g, rng) {
          if (rng.nextDouble() < 0.45) {
            final amt = _scaled(g, 0.02, 20000);
            g.cash -= amt;
            return 'Vindicated — ${_usd(amt)} in legal fees.';
          }
          final amt = _scaled(g, 0.15, 120000);
          g.cash -= amt;
          return 'The jury hammered you: ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'family_bailout',
      emoji: '👨‍👩‍👧',
      title: 'Family needs a bailout',
      body: 'A relative is drowning financially and turns to you.',
      minNetWorth: _t3,
      choices: [
        CrisisChoice('Bail them out', (g, rng) {
          final amt = _scaled(g, 0.05, 40000);
          g.cash -= amt;
          return 'You write a ${_usd(amt)} check. Family is family.';
        }),
        CrisisChoice('Offer a small loan instead', (g, rng) {
          final amt = _scaled(g, 0.015, 12000);
          g.cash -= amt;
          return 'A ${_usd(amt)} loan and some tough love.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'failed_venture',
      emoji: '📉',
      title: 'A venture implodes',
      body: 'A business you backed is going under and the calls are getting '
          'frantic.',
      minNetWorth: _t3,
      choices: [
        CrisisChoice('Double down to save it', (g, rng) {
          final amt = _scaled(g, 0.10, 80000);
          g.cash -= amt;
          if (rng.nextDouble() < 0.35) {
            g.cash += amt * 2.5;
            return 'You saved it — and ${_usd(amt * 2.5)} came back.';
          }
          return 'It died anyway. ${_usd(amt)} down the drain.';
        }),
        CrisisChoice('Cut your losses', (g, rng) {
          final amt = _scaled(g, 0.04, 30000);
          g.cash -= amt;
          return 'You write off ${_usd(amt)} and walk.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'divorce',
      emoji: '💔',
      title: 'A costly divorce',
      body: 'Things fell apart, and the settlement won\'t be cheap.',
      minNetWorth: _t3,
      choices: [
        CrisisChoice('Settle fairly', (g, rng) {
          final amt = _scaled(g, 0.12, 80000);
          g.cash -= amt;
          g.addObligation('Support payments', _scaled(g, 0.004, 3000), 12);
          return 'A ${_usd(amt)} settlement, plus support for a year.';
        }),
        CrisisChoice('Lawyer up and fight', (g, rng) {
          final amt = _scaled(g, 0.18, 130000);
          g.cash -= amt;
          return 'You "win," but the lawyers do better: ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'luxury_upkeep',
      emoji: '🛥️',
      title: 'Toys are expensive',
      body: 'The boat, the cars, the second home — upkeep never stops.',
      minNetWorth: _t3,
      choices: [
        CrisisChoice('Maintain it all', (g, rng) {
          final amt = _scaled(g, 0.03, 25000);
          g.cash -= amt;
          return '${_usd(amt)} to keep the good life running.';
        }),
        CrisisChoice('Sell something off', (g, rng) {
          final amt = _scaled(g, 0.02, 15000);
          g.cash += amt;
          return 'You offload a toy for ${_usd(amt)}. Simplify.';
        }),
      ],
    ),

    // ============ TIER 4 — tycoon problems ($5M+) =========================
    CrisisEvent(
      id: 'estate_restructure',
      emoji: '🏦',
      title: 'Estate restructuring',
      body: 'Your wealth is complex enough to need a small army of advisors.',
      minNetWorth: _t4,
      choices: [
        CrisisChoice('Pay the advisors', (g, rng) {
          final amt = _scaled(g, 0.02, 100000);
          g.cash -= amt;
          return '${_usd(amt)} in fees — but the trust will save more.';
        }),
        CrisisChoice('Wing it', (g, rng) {
          final amt = _scaled(g, 0.05, 250000);
          g.cash -= amt;
          return 'The taxman feasts: ${_usd(amt)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'high_profile_lawsuit',
      emoji: '📰',
      title: 'A headline lawsuit',
      body: 'You\'re wealthy enough to be a target, and the press is watching.',
      minNetWorth: _t4,
      choices: [
        CrisisChoice('Settle and gag it', (g, rng) {
          final amt = _scaled(g, 0.08, 400000);
          g.cash -= amt;
          return 'Quietly settled for ${_usd(amt)}.';
        }),
        CrisisChoice('Fight it publicly', (g, rng) {
          if (rng.nextDouble() < 0.5) {
            final amt = _scaled(g, 0.03, 150000);
            g.cash -= amt;
            return 'You won the narrative — ${_usd(amt)} in costs.';
          }
          final amt = _scaled(g, 0.18, 900000);
          g.cash -= amt;
          return 'It went badly: ${_usd(amt)} and a bruised name.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'forgery_scandal',
      emoji: '🖼️',
      title: 'Your art was forged',
      body: 'A centerpiece of your collection turns out to be fake.',
      minNetWorth: _t4,
      choices: [
        CrisisChoice('Eat the loss', (g, rng) {
          final amt = _scaled(g, 0.05, 200000);
          g.cash -= amt;
          return 'A ${_usd(amt)} write-off and a lesson.';
        }),
        CrisisChoice('Sue the dealer', (g, rng) {
          if (rng.nextDouble() < 0.5) {
            final amt = _scaled(g, 0.04, 150000);
            g.cash += amt;
            return 'You recovered ${_usd(amt)} in damages.';
          }
          final amt = _scaled(g, 0.03, 120000);
          g.cash -= amt;
          return 'The dealer vanished. ${_usd(amt)} in legal fees.';
        }),
      ],
    ),

    // ============ Market-condition events (any wealth) ====================
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

  /// Pick a random event whose net-worth band and context allow it right now.
  ///
  /// Two things keep the stream from feeling repetitive:
  ///  - The minimum-wealth floor is checked against a non-negative net worth,
  ///    so a player who's gone *underwater* (negative net worth, e.g. after a
  ///    payday loan) still draws from the base tier instead of getting nothing.
  ///  - Events in [GameController.recentCrisisIds] are skipped so the same
  ///    decision doesn't resurface back-to-back. If avoiding repeats would
  ///    leave nothing, we fall back to the full eligible set rather than
  ///    firing blank.
  static CrisisEvent? pick(GameController g, Random rng) {
    final nw = g.netWorth;
    // Underwater players are treated as net worth 0 for the *floor* test only;
    // the max-wealth cap still uses the real (possibly negative) figure.
    final floorNw = nw < 0 ? 0.0 : nw;
    final eligible = all
        .where((e) =>
            floorNw >= e.minNetWorth && nw <= e.maxNetWorth && e.eligible(g))
        .toList();
    if (eligible.isEmpty) return null;
    final fresh =
        eligible.where((e) => !g.recentCrisisIds.contains(e.id)).toList();
    final pool = fresh.isNotEmpty ? fresh : eligible;
    return pool[rng.nextInt(pool.length)];
  }
}
