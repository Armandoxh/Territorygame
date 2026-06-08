import 'crisis_kit.dart';

/// Legal, scams & taxes expansion pack. Every choice is a real tradeoff.
class LegalCrises {
  LegalCrises._();

  static final List<CrisisEvent> all = [
    // ---- BASE tier (no minNetWorth) ----------------------------------------
    CrisisEvent(
      id: 'legal_irs_audit_letter',
      emoji: '⚖️',
      title: 'The IRS wants a word',
      body: 'A real audit notice lands in your mailbox. The numbers on last '
          'year\'s return don\'t quite line up, and the agent has questions.',
      choices: [
        CrisisChoice('Just pay what they ask', (g, rng) {
          final bill = spend(g, rng, 800, 2500);
          return 'You write the check — ${usd(bill)} in back taxes and '
              'penalties, no drama.';
        }),
        CrisisChoice('Hire a pro to fight it', (g, rng) {
          final fees = spend(g, rng, 1500, 3500);
          if (rng.nextDouble() < 0.5) {
            return 'Your CPA finds the error in THEIR favor — the bill '
                'vanishes for ${usd(fees)} in representation.';
          }
          final bill = spend(g, rng, 1000, 3000);
          return 'The audit stands: ${usd(fees)} in fees AND ${usd(bill)} owed.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'legal_parking_ticket',
      emoji: '🅿️',
      title: 'A bogus parking ticket',
      body: 'There was NO sign. You\'re sure of it. But the ticket is real and '
          'the clock on the late fee is ticking.',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('Pay it and move on', (g, rng) {
          final fine = spend(g, rng, 45, 120);
          return 'Paid ${usd(fine)}. Annoying, but done.';
        }),
        CrisisChoice('Contest it at the courthouse', (g, rng) {
          if (rng.nextDouble() < 0.45) {
            return 'The judge tosses it — you owe nothing and feel vindicated.';
          }
          final fine = spend(g, rng, 90, 180);
          return 'Denied, and the late fee stuck: ${usd(fine)} for a wasted '
              'afternoon.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'legal_romance_scam',
      emoji: '💔',
      title: 'Your online sweetheart needs a loan',
      body: 'You\'ve been chatting for months. Now they\'re "stuck overseas" '
          'and need money for a flight home. They feel so real.',
      maxNetWorth: 200000,
      choices: [
        CrisisChoice('Wire the money — true love', (g, rng) {
          final loss = spend(g, rng, 2000, 9000);
          return 'The account goes dark the instant it clears. ${usd(loss)} '
              'gone, and so are they.';
        }),
        CrisisChoice('Ask to video-call first', (g, rng) {
          if (rng.nextDouble() < 0.75) {
            return 'They refuse, then vanish. You dodged a scam and kept every '
                'dollar.';
          }
          final gift = spend(g, rng, 50, 150);
          return 'They were real after all — you send a small ${usd(gift)} '
              'gift card to make up for the suspicion.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'legal_jury_duty',
      emoji: '👨‍⚖️',
      title: 'You\'ve been summoned for jury duty',
      body: 'A multi-week trial, and your employer doesn\'t make up the '
          'difference. Civic duty pays $30 a day.',
      choices: [
        CrisisChoice('Serve like a good citizen', (g, rng) {
          unpaidLeave(g, 1, 'jury duty');
          final stipend = gain(g, rng, 150, 400);
          return 'A month off the job, ${usd(stipend)} in juror pay, and a '
              'front-row seat to justice.';
        }),
        CrisisChoice('Try to weasel out of it', (g, rng) {
          if (rng.nextDouble() < 0.4) {
            return 'The judge buys your hardship excuse — you\'re dismissed, no '
                'lost pay.';
          }
          unpaidLeave(g, 1, 'jury duty');
          final fine = spend(g, rng, 100, 300);
          return 'The judge sees through it AND fines you ${usd(fine)} for '
              'wasting the court\'s time — you serve anyway.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'legal_found_wallet',
      emoji: '👛',
      title: 'A fat wallet on the sidewalk',
      body: 'No one\'s looking. It\'s stuffed with cash and an ID. The right '
          'thing and the easy thing point in different directions.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Track down the owner', (g, rng) {
          final reward = gain(g, rng, 40, 200);
          return 'The grateful owner presses ${usd(reward)} into your hand. '
              'Karma: paid.';
        }),
        CrisisChoice('Pocket the cash', (g, rng) {
          final take = gain(g, rng, 100, 500);
          if (rng.nextDouble() < 0.35) {
            final loss = spend(g, rng, 400, 1200);
            return 'You took ${usd(take)} — but a CCTV cam caught you and the '
                'theft charge costs ${usd(loss)} to make go away.';
          }
          return 'You keep ${usd(take)} and a faint, lingering guilt.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'legal_fender_bender',
      emoji: '🚗',
      title: 'A parking-lot fender-bender',
      body: 'You tapped their bumper. There\'s a tiny scuff. The other driver '
          'is already eyeing the damage and reaching for their phone.',
      choices: [
        CrisisChoice('Admit fault, settle on the spot', (g, rng) {
          final cash = spend(g, rng, 300, 900);
          return 'You hand over ${usd(cash)} cash, no insurance, no paper '
              'trail. Clean.';
        }),
        CrisisChoice('Deny everything, drive off', (g, rng) {
          if (rng.nextDouble() < 0.45) {
            return 'No witnesses, no plates caught. You get away with it.';
          }
          final claim = spend(g, rng, 1200, 3500);
          return 'They photographed your plate. The hit-and-run claim runs '
              '${usd(claim)} once insurance and your deductible land.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'legal_speeding_ticket',
      emoji: '🚓',
      title: 'Pulled over for speeding',
      body: 'Radar clocked you well over. The officer is writing it up. You '
          'could pay, or roll the dice on traffic court.',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('Pay the fine', (g, rng) {
          final fine = spend(g, rng, 150, 400);
          return '${usd(fine)} and a point on your license. Lesson learned.';
        }),
        CrisisChoice('Contest it in traffic court', (g, rng) {
          final court = spend(g, rng, 50, 120);
          if (rng.nextDouble() < 0.4) {
            return 'The cop no-shows — case dismissed for just ${usd(court)} in '
                'filing fees.';
          }
          final fine = spend(g, rng, 150, 400);
          return 'You lose: ${usd(court)} in fees PLUS the ${usd(fine)} ticket.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'legal_mlm_pitch',
      emoji: '🧴',
      title: 'An old friend\'s "business opportunity"',
      body: 'They cornered you over coffee with a pitch deck about essential '
          'oils and "passive income." The starter kit is only a few thousand.',
      maxNetWorth: 200000,
      choices: [
        CrisisChoice('Buy in — be your own boss', (g, rng) {
          final kit = spend(g, rng, 1500, 4000);
          if (rng.nextDouble() < 0.2) {
            final sales = gain(g, rng, 800, 2500);
            return 'You actually hustle and claw back ${usd(sales)} of your '
                '${usd(kit)} buy-in. Most don\'t.';
          }
          return 'A garage full of unsold inventory. ${usd(kit)} down the '
              'drain, friendship strained.';
        }),
        CrisisChoice('Politely decline', (g, rng) =>
            'You change the subject and keep your wallet — and the friendship — '
            'intact.'),
      ],
    ),
    CrisisEvent(
      id: 'legal_phishing_email',
      emoji: '📧',
      title: '"Your account has been suspended"',
      body: 'An urgent email with your bank\'s logo demands you "verify" your '
          'login through a link right now or lose access.',
      choices: [
        CrisisChoice('Click and enter your details', (g, rng) {
          final loss = spend(g, rng, 500, 3000);
          obligation(g, 'fraud monitoring', 20, 12);
          return 'It was a phishing site. ${usd(loss)} drained before you '
              'froze the card, plus a year of monitoring.';
        }),
        CrisisChoice('Delete it and call the bank directly', (g, rng) =>
            'The real bank confirms it was a scam. Nothing lost but two minutes '
            'on hold.'),
      ],
    ),
    CrisisEvent(
      id: 'legal_sweepstakes',
      emoji: '🎉',
      title: '"You\'ve WON a $50,000 prize!"',
      body: 'A call says you won a sweepstakes you don\'t remember entering. '
          'To release the prize, you just need to cover the "processing fee."',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('Pay the fee to claim it', (g, rng) {
          final fee = spend(g, rng, 300, 1500);
          return 'You pay ${usd(fee)}... and then they ask for another fee. '
              'There is no prize. Classic advance-fee scam.';
        }),
        CrisisChoice('Hang up', (g, rng) =>
            'Real sweepstakes never charge you to win. You keep every cent.'),
      ],
    ),
    CrisisEvent(
      id: 'legal_diy_taxes',
      emoji: '🧮',
      title: 'Tax season: pro or DIY?',
      body: 'Your return is getting complicated. A CPA wants a few hundred '
          'bucks; the free software is right there, tempting you.',
      choices: [
        CrisisChoice('Pay a CPA to do it right', (g, rng) {
          final fee = spend(g, rng, 250, 600);
          return '${usd(fee)} for a clean, accurate filing and zero anxiety.';
        }),
        CrisisChoice('DIY it for free', (g, rng) {
          if (rng.nextDouble() < 0.6) {
            return 'You nail it yourself and pocket the prep fee. Nicely done.';
          }
          final bill = spend(g, rng, 600, 2200);
          return 'A misentered form triggers a correction notice months later: '
              '${usd(bill)} in back tax and penalties.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'legal_crypto_doubler',
      emoji: '🪙',
      title: 'A crypto "guaranteed doubler"',
      body: 'A slick stranger in your DMs runs a platform that "doubles your '
          'deposit in 30 days, guaranteed." Testimonials everywhere.',
      maxNetWorth: 200000,
      choices: [
        CrisisChoice('Deposit and watch it grow', (g, rng) {
          final loss = spend(g, rng, 1000, 6000);
          return 'The dashboard shows huge gains — until withdrawal day, when '
              'the site 404s. ${usd(loss)} into a rug pull.';
        }),
        CrisisChoice('"Guaranteed" is a red flag', (g, rng) =>
            'You block them. A week later the "platform" vanishes with everyone '
            'else\'s money — but not yours.'),
      ],
    ),
    CrisisEvent(
      id: 'legal_class_action',
      emoji: '📨',
      title: 'A class-action notice arrives',
      body: 'A company you bought from is settling a lawsuit. You can join the '
          'class for a small payout, or opt out to keep your right to sue.',
      choices: [
        CrisisChoice('Join the class, take the check', (g, rng) {
          final payout = gain(g, rng, 15, 120);
          return 'Months later a check for ${usd(payout)} shows up. Not riches, '
              'but free money.';
        }),
        CrisisChoice('Opt out and sue on your own', (g, rng) {
          final fees = spend(g, rng, 200, 800);
          if (rng.nextDouble() < 0.3) {
            final award = gain(g, rng, 1500, 5000);
            return 'Your individual claim hits: ${usd(award)} after ${usd(fees)}'
                ' in costs. Rolling the dice paid off.';
          }
          return 'Your solo case fizzles. ${usd(fees)} in costs and nothing to '
              'show — the class members got their checks.';
        }),
      ],
    ),
    // ---- minNetWorth: 30000 ------------------------------------------------
    CrisisEvent(
      id: 'legal_neighbor_lawsuit',
      emoji: '🧑‍⚖️',
      title: 'Your neighbor is suing you',
      body: 'A tree from your yard fell on their fence. They want damages, and '
          'they\'ve already filed in small-claims court.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Settle out of court', (g, rng) {
          final settle = spend(g, rng, 800, 2500);
          return 'You pay ${usd(settle)} and you\'re still on speaking terms '
              'over the fence.';
        }),
        CrisisChoice('Fight it in small claims', (g, rng) {
          final fees = spend(g, rng, 300, 900);
          if (rng.nextDouble() < 0.5) {
            return 'The judge rules it an act of God — you owe only ${usd(fees)}'
                ' in filing costs.';
          }
          final dmg = spend(g, rng, 1500, 4000);
          return 'You lose: ${usd(fees)} in costs plus ${usd(dmg)} in damages, '
              'and a frosty neighbor.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'legal_identity_theft',
      emoji: '🪪',
      title: 'Someone is using your identity',
      body: 'Cards you never opened are appearing on your credit report. The '
          'cleanup — affidavits, freezes, disputes — is going to be a slog.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Pay for full-service cleanup', (g, rng) {
          final upfront = spend(g, rng, 400, 1200);
          obligation(g, 'credit monitoring', 25, 18);
          return 'A restoration service handles it for ${usd(upfront)} plus '
              '18 months of monitoring. Painful but thorough.';
        }),
        CrisisChoice('Do it all yourself', (g, rng) {
          unpaidLeave(g, 1, 'untangling identity theft');
          if (rng.nextDouble() < 0.55) {
            return 'Weeks of phone calls, but you clear it for free. Your time, '
                'not your money.';
          }
          final loss = spend(g, rng, 1000, 4000);
          return 'You miss a fraudulent account and it metastasizes: ${usd(loss)}'
              ' in damage before you catch it.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'legal_workplace_kickback',
      emoji: '💼',
      title: 'A vendor offers you a "thank-you"',
      body: 'You steer a contract their way and a fat envelope appears on your '
          'desk. No one would ever know. Probably.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Take the kickback', (g, rng) {
          final bribe = gain(g, rng, 3000, 9000);
          if (rng.nextDouble() < 0.4) {
            final fine = spend(g, rng, 5000, 15000);
            unpaidLeave(g, 2, 'fired and under investigation');
            return 'Compliance flags the deal. You pocketed ${usd(bribe)} but '
                'lose ${usd(fine)} and your job over it.';
          }
          return 'No one notices. ${usd(bribe)} richer and quietly compromised.';
        }),
        CrisisChoice('Report it to compliance', (g, rng) {
          final bonus = gain(g, rng, 200, 1000);
          return 'You do the clean thing. A small integrity ${usd(bonus)} bonus '
              'and a clear conscience.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'legal_hoa_fine',
      emoji: '🏘️',
      title: 'The HOA fined you for your fence',
      body: 'Your fence is two inches too tall, per a busybody on the board. '
          'The fine grows every month you ignore it.',
      minNetWorth: 30000,
      maxNetWorth: 400000,
      choices: [
        CrisisChoice('Pay the fine and lower the fence', (g, rng) {
          final fine = spend(g, rng, 100, 300);
          final fix = spend(g, rng, 150, 500);
          return '${usd(fine)} fine plus ${usd(fix)} to trim it. Peace with the '
              'board restored.';
        }),
        CrisisChoice('Appeal at the board meeting', (g, rng) {
          if (rng.nextDouble() < 0.45) {
            return 'You win the room over — fine waived, fence stays. Petty '
                'victory secured.';
          }
          final fine = spend(g, rng, 250, 700);
          return 'The board doubles down. The accumulated fine is now '
              '${usd(fine)}.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'legal_under_table_gig',
      emoji: '💵',
      title: 'A side gig that pays cash only',
      body: 'A client offers good money for weekend work — strictly cash, '
          'nothing reported. The IRS would never have to know. Or would it.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Take it, skip the taxes', (g, rng) {
          final cash = gain(g, rng, 2000, 6000);
          if (rng.nextDouble() < 0.35) {
            final penalty = spend(g, rng, 1500, 5000);
            return 'The client 1099\'d you anyway. ${usd(cash)} earned, '
                '${usd(penalty)} in back taxes and underreporting penalties.';
          }
          return 'You bank ${usd(cash)} tax-free and nobody\'s the wiser. This '
              'time.';
        }),
        CrisisChoice('Take it and report it honestly', (g, rng) {
          final net = gain(g, rng, 1400, 4200);
          return 'You declare it all and net ${usd(net)} after tax. No looking '
              'over your shoulder.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'legal_warranty_battle',
      emoji: '🔧',
      title: 'They denied your warranty claim',
      body: 'Your expensive appliance died and the manufacturer is stonewalling '
          'with fine print. You can eat the cost or escalate.',
      minNetWorth: 30000,
      maxNetWorth: 400000,
      choices: [
        CrisisChoice('Just buy a replacement', (g, rng) {
          final cost = spend(g, rng, 600, 2000);
          return '${usd(cost)} for a new unit. Done fighting, finally quiet.';
        }),
        CrisisChoice('Escalate with a demand letter', (g, rng) {
          final time = spend(g, rng, 0, 80);
          if (rng.nextDouble() < 0.5) {
            final refund = gain(g, rng, 600, 2000);
            return 'The threat of small claims works — full ${usd(refund)} '
                'refund for ${usd(time)} in postage and persistence.';
          }
          final cost = spend(g, rng, 600, 2000);
          return 'They don\'t budge. You buy a replacement anyway: ${usd(cost)} '
              'plus a wasted month of emails.';
        }),
      ],
    ),
    // ---- minNetWorth: 150000 -----------------------------------------------
    CrisisEvent(
      id: 'legal_big_audit',
      emoji: '🏛️',
      title: 'A full field audit of your finances',
      body: 'The IRS isn\'t mailing letters this time — they\'re sending an '
          'agent to comb through years of returns. The stakes scale with your '
          'wealth.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Bring in a tax attorney', (g, rng) {
          final fees = spendScaled(g, 0.015, 4000);
          if (rng.nextDouble() < 0.55) {
            return 'Your attorney walks them through clean books — ${usd(fees)} '
                'in fees and the case closes with no adjustment.';
          }
          final bill = spendScaled(g, 0.02, 6000);
          return 'They find a real problem: ${usd(fees)} in fees plus '
              '${usd(bill)} in back tax owed.';
        }),
        CrisisChoice('Represent yourself to save money', (g, rng) {
          if (rng.nextDouble() < 0.3) {
            return 'You hold your own and survive it clean. Bold, and it paid '
                'off.';
          }
          final bill = spendScaled(g, 0.035, 9000);
          return 'In over your head, you concede everything: ${usd(bill)} in '
              'assessments and penalties.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'legal_business_lawsuit',
      emoji: '📑',
      title: 'A six-figure lawsuit names you',
      body: 'A former partner claims you owe them. Their lawyers want a fortune; '
          'a settlement now would be cheaper but still steep.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Settle to make it disappear', (g, rng) {
          final settle = spendScaled(g, 0.04, 10000);
          return 'You pay ${usd(settle)} to close it quietly and protect your '
              'reputation.';
        }),
        CrisisChoice('Take it to trial', (g, rng) {
          final fees = spendScaled(g, 0.02, 6000);
          if (rng.nextDouble() < 0.5) {
            return 'The jury sides with you — ${usd(fees)} in legal fees and '
                'the claim is dismissed entirely.';
          }
          final judgment = spendScaled(g, 0.06, 20000);
          return 'You lose at trial: ${usd(fees)} in fees PLUS a ${usd(judgment)}'
              ' judgment against you. Ouch.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'legal_contractor_lien',
      emoji: '🏗️',
      title: 'A contractor filed a lien on your property',
      body: 'You disputed a botched renovation and withheld payment. Now '
          'there\'s a mechanic\'s lien clouding your title.',
      minNetWorth: 150000,
      eligible: (g) => g.properties > 0,
      choices: [
        CrisisChoice('Pay to clear the lien', (g, rng) {
          final pay = spendScaled(g, 0.03, 8000);
          return 'You pay ${usd(pay)} to lift the lien and keep your title '
              'clean. Galling, but simple.';
        }),
        CrisisChoice('Fight the lien in court', (g, rng) {
          final fees = spendScaled(g, 0.015, 4000);
          if (rng.nextDouble() < 0.5) {
            return 'The court finds the work defective and voids the lien — '
                '${usd(fees)} in fees, nothing more.';
          }
          final owed = spendScaled(g, 0.045, 12000);
          return 'The lien is upheld: ${usd(fees)} in fees plus ${usd(owed)} '
              'owed with interest.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'legal_inheritance_dispute',
      emoji: '📜',
      title: 'A fight over the will',
      body: 'A relative is contesting an inheritance you were promised. Lawyer '
          'up for a long probate battle, or accept a quick, smaller split.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Accept a quiet 50/50 split', (g, rng) {
          final share = gain(g, rng, 8000, 25000);
          return 'You take the ${usd(share)} compromise and keep the family '
              'from imploding at Thanksgiving.';
        }),
        CrisisChoice('Lawyer up and fight for it all', (g, rng) {
          final fees = spendScaled(g, 0.02, 5000);
          if (rng.nextDouble() < 0.45) {
            final award = gain(g, rng, 25000, 70000);
            return 'Probate rules in your favor: ${usd(award)} after ${usd(fees)}'
                ' in fees. The cousins don\'t speak to you now.';
          }
          return 'You lose the challenge AND ${usd(fees)} in legal fees, and '
              'inherit nothing but resentment.';
        }),
      ],
    ),
    // ---- minNetWorth: 750000 -----------------------------------------------
    CrisisEvent(
      id: 'legal_offshore_shelter',
      emoji: '🏝️',
      title: 'An "aggressive" offshore tax shelter',
      body: 'A wealth advisor pitches a structure that could slash your tax '
          'bill — sitting right on the line between clever and criminal.',
      minNetWorth: 750000,
      choices: [
        CrisisChoice('Set up the shelter', (g, rng) {
          final saved = gain(g, rng, 20000, 60000);
          if (rng.nextDouble() < 0.4) {
            final penalty = spendScaled(g, 0.08, 40000);
            unpaidLeave(g, 2, 'tax-fraud investigation');
            return 'You saved ${usd(saved)} — until the scheme is flagged as '
                'illegal. ${usd(penalty)} in penalties and a frozen career.';
          }
          return 'It holds up as legal-ish. ${usd(saved)} saved, and a knot in '
              'your stomach every April.';
        }),
        CrisisChoice('Stick to legitimate planning', (g, rng) {
          final saved = gain(g, rng, 4000, 15000);
          return 'Your CPA finds ${usd(saved)} in clean, boring, bulletproof '
              'deductions. You sleep fine.';
        }),
      ],
    ),
  ];
}
