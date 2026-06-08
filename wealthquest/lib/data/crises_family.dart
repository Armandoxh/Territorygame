import 'crisis_kit.dart';

/// Family & relationships expansion pack. Every choice is a real tradeoff.
class FamilyCrises {
  FamilyCrises._();

  static final List<CrisisEvent> all = [
    // ---- base tier (no minNetWorth) ----------------------------------------
    CrisisEvent(
      id: 'fam_brother_loan',
      emoji: '🤝',
      title: 'Your Brother Calls',
      body:
          'It\'s your brother. "Between gigs" again, rent is due, and you know '
          'where this is going.',
      choices: [
        CrisisChoice('Lend him the money', (g, rng) {
          final amt = spend(g, rng, 1000, 4000);
          if (rng.nextDouble() < 0.45) {
            final back = gain(g, rng, 1000, 4000);
            return 'Months later he wires back ${usd(back)}. A genuine miracle.';
          }
          return 'You\'re out ${usd(amt)} and he\'s "between jobs" again.';
        }),
        CrisisChoice('Offer to cover one bill, not cash', (g, rng) {
          final amt = spend(g, rng, 300, 900);
          return 'You pay his ${usd(amt)} utility bill directly. He grumbles, '
              'but the lights stay on.';
        }),
        CrisisChoice('Say no, gently', (g, rng) {
          return 'You hold the line. He says he "understands" in the voice that '
              'means he doesn\'t. \$0 spent, some goodwill too.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_pet_adoption',
      emoji: '🐶',
      title: 'The Shelter Puppy',
      body:
          'The kids found a wobbly rescue mutt at the adoption fair and he is '
          'looking right at you.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Adopt him', (g, rng) {
          final fee = spend(g, rng, 150, 450);
          obligation(g, 'Dog food & vet plan', rnd(rng, 60, 140), 18);
          return 'Adoption fee ${usd(fee)}, plus a kibble-and-checkup tab for a '
              'while. Worth every cent of slobber.';
        }),
        CrisisChoice('Walk away', (g, rng) {
          return 'You leave empty-handed. The kids stage a silent protest for a '
              'week. \$0 — and a small hole in everyone\'s heart.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_vet_emergency',
      emoji: '🐱',
      title: '2 a.m. Vet Emergency',
      body:
          'The cat ate something it absolutely should not have. The emergency '
          'clinic does not do payment plans, exactly.',
      eligible: (g) => true,
      choices: [
        CrisisChoice('Authorize the surgery', (g, rng) {
          final bill = spend(g, rng, 1500, 5000);
          return 'Surgery, X-rays, an overnight stay: ${usd(bill)}. The cat is '
              'fine and completely unrepentant.';
        }),
        CrisisChoice('Try the cheaper "wait and see" plan', (g, rng) {
          final first = spend(g, rng, 200, 500);
          if (rng.nextDouble() < 0.55) {
            return 'You pay ${usd(first)} for fluids and meds. By morning the '
                'little gremlin has bounced back. Dodged it.';
          }
          final more = spend(g, rng, 2000, 4000);
          return 'It gets worse overnight — ${usd(more)} in emergency surgery '
              'anyway. Should\'ve just done it the first time.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_friend_destination_wedding',
      emoji: '🏝️',
      title: 'Destination Wedding Invite',
      body:
          'Your closest friend is getting married in Tulum. Flights, hotel, a '
          'gift, three days off — the whole production.',
      maxNetWorth: 400000,
      choices: [
        CrisisChoice('Fly out and celebrate', (g, rng) {
          final cost = spend(g, rng, 1500, 4000);
          return 'Flights, resort, and a generous gift run ${usd(cost)}. You '
              'cry at the vows and mean it.';
        }),
        CrisisChoice('Send a gift, skip the trip', (g, rng) {
          final gift = spend(g, rng, 150, 500);
          return 'A ${usd(gift)} gift and heartfelt regrets. They understand — '
              'mostly. The photos look incredible without you.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_new_baby',
      emoji: '👶',
      title: 'A New Arrival',
      body:
          'Congratulations — you\'re a parent. Now comes parental leave and the '
          'small matter of paying for childcare.',
      choices: [
        CrisisChoice('Take full leave, then daycare', (g, rng) {
          unpaidLeave(g, 3, 'Parental leave');
          obligation(g, 'Daycare', rnd(rng, 1000, 1900), 24);
          return 'Three months of no salary and a daycare bill that rivals a '
              'mortgage. Also: the smell of a newborn\'s head. Net win.';
        }),
        CrisisChoice('Short leave, lean on family', (g, rng) {
          unpaidLeave(g, 1, 'Parental leave');
          obligation(g, 'Babysitting & supplies', rnd(rng, 300, 700), 18);
          return 'One month off and Grandma covers Tuesdays. Cheaper, but you '
              'owe a lot of casseroles in return.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_cousin_business',
      emoji: '🚀',
      title: 'Your Cousin\'s "Sure Thing"',
      body:
          'Cousin Dre has an "absolutely cannot lose" food-truck-meets-app idea '
          'and wants you in as an early investor.',
      choices: [
        CrisisChoice('Go all in (\$5k)', (g, rng) {
          final r = wager(g, rng, 5000, 0.35, 3.0);
          if (r > 0) {
            return 'Against all odds it pops — you clear ${usd(r)}. Dre was '
                'right, infuriatingly.';
          }
          return 'The truck\'s transmission dies in week two. You eat the '
              '${usd(-r)} and a lot of leftover tacos.';
        }),
        CrisisChoice('Toss in a token \$1k', (g, rng) {
          final r = wager(g, rng, 1000, 0.4, 2.5);
          if (r > 0) {
            return 'Your modest ${usd(1000)} turns into ${usd(r)}. Enough to '
                'feel smart at Thanksgiving.';
          }
          return 'Gone, but only ${usd(-r)}. Cheap tuition in saying no to '
              'family next time.';
        }),
        CrisisChoice('Pass, keep the peace', (g, rng) {
          return 'You decline. Dre calls you "risk-averse" like it\'s an '
              'insult. \$0 risked.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_inlaws_visit',
      emoji: '🏠',
      title: 'In-Laws For Two Weeks',
      body:
          'The in-laws are visiting. Two weeks of hosting, restaurants, day '
          'trips, and your father-in-law "forgetting" his wallet.',
      maxNetWorth: 350000,
      choices: [
        CrisisChoice('Be the gracious host', (g, rng) {
          final cost = spend(g, rng, 800, 2500);
          return 'Dinners, a winery tour, fresh towels: ${usd(cost)}. You earn '
              'serious points and a slightly emptier fridge.';
        }),
        CrisisChoice('Keep it low-key and home-cooked', (g, rng) {
          final cost = spend(g, rng, 200, 600);
          return 'Board games and pot roast: ${usd(cost)}. Cheaper, and your '
              'mother-in-law notes it. Loudly.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_kid_travel_sport',
      emoji: '⚽',
      title: 'Travel Team Tryouts',
      body:
          'Your kid made the elite travel soccer squad. The talent is real; so '
          'are the fees, gear, and weekend hotel rooms.',
      choices: [
        CrisisChoice('Sign them up', (g, rng) {
          final upfront = spend(g, rng, 600, 1500);
          obligation(g, 'Travel team fees', rnd(rng, 200, 450), 9);
          return 'Cleats, club dues, and a season of gas-station coffee: '
              '${usd(upfront)} now plus monthly. They light up on the field, '
              'though.';
        }),
        CrisisChoice('Stick with rec league', (g, rng) {
          final cost = spend(g, rng, 80, 250);
          return 'Local rec league for ${usd(cost)}. Same joy, fewer interstate '
              'tournaments. Your weekends survive.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_sibling_tuition',
      emoji: '🎓',
      title: 'Help With a Sibling\'s Tuition',
      body:
          'Your kid sister is one semester short of her degree and the aid fell '
          'through. She asks you to help her cross the finish line.',
      choices: [
        CrisisChoice('Cover the semester yourself', (g, rng) {
          final amt = spend(g, rng, 3000, 8000);
          return 'You write the check — ${usd(amt)}. She graduates and frames '
              'you a thank-you. Sappy. Worth it.';
        }),
        CrisisChoice('Co-borrow it as a loan she\'ll repay', (g, rng) {
          studentDebt(g, rnd(rng, 4000, 9000));
          if (rng.nextDouble() < 0.5) {
            final back = gain(g, rng, 1000, 3000);
            return 'You take on the loan; she chips in ${usd(back)} early once '
                'she\'s hired. Slow, but she\'s good for it.';
          }
          return 'The balance lands on your student-loan tab. She "totally will" '
              'pay it back. The interest clock is ticking.';
        }),
        CrisisChoice('Help her find scholarships instead', (g, rng) {
          return 'You spend a weekend on applications instead of money. \$0, and '
              'she actually lands a small grant. Teamwork.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_godchild_gift',
      emoji: '🎁',
      title: 'Godchild\'s Big Birthday',
      body:
          'Your godkid turns ten and has reached the "wants a very specific, '
          'very expensive thing" stage of life.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Get the dream gift', (g, rng) {
          final cost = spend(g, rng, 200, 700);
          return 'You splurge ${usd(cost)} and become the favorite adult. The '
              'parents are mildly annoyed. Mission accomplished.';
        }),
        CrisisChoice('Open a small savings bond instead', (g, rng) {
          final cost = spend(g, rng, 50, 200);
          return 'You put ${usd(cost)} toward their future. Wildly unpopular '
              'today, quietly wise in fifteen years.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_cosign_car',
      emoji: '🚗',
      title: 'Co-Sign the Car Loan',
      body:
          'Your nephew can\'t get a car loan without a co-signer and swears on '
          'everything he\'ll never miss a payment.',
      choices: [
        CrisisChoice('Co-sign it', (g, rng) {
          if (rng.nextDouble() < 0.55) {
            return 'He makes every payment, on time, for a year. You feel like a '
                'genius mentor. \$0 out of pocket.';
          }
          final hit = rnd(rng, 4000, 9000);
          loanShark(g, hit);
          return 'He defaults. The lender comes for the co-signer — that\'s you. '
              '${usd(hit)} of ugly debt is now yours.';
        }),
        CrisisChoice('Gift a down payment instead, no signature', (g, rng) {
          final amt = spend(g, rng, 1000, 2500);
          return 'You hand over ${usd(amt)} for a bigger down payment so he can '
              'qualify alone. Capped risk, capped guilt.';
        }),
        CrisisChoice('Decline, drive him to dealerships', (g, rng) {
          return 'You won\'t sign, but you spend Saturdays car-hunting with him. '
              '\$0 — and he finds a cheap beater that runs.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_reunion_host',
      emoji: '🍖',
      title: 'You Volunteered To Host The Reunion',
      body:
          'Somehow you said yes to organizing the family reunion. Forty people, '
          'a pavilion rental, and Aunt Carol\'s opinions.',
      maxNetWorth: 400000,
      choices: [
        CrisisChoice('Go big — caterer and venue', (g, rng) {
          final cost = spend(g, rng, 1500, 4500);
          return 'Pavilion, caterer, a bouncy castle: ${usd(cost)}. It\'s '
              'legendary. People talk about it for years.';
        }),
        CrisisChoice('Potluck in the park', (g, rng) {
          final cost = spend(g, rng, 200, 700);
          return 'Everyone brings a dish; you cover the park permit and drinks '
              'for ${usd(cost)}. Chaotic, charming, cheap.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_partner_merge_finances',
      emoji: '💑',
      title: 'Merge Finances?',
      body:
          'Your partner wants to combine accounts and tackle their lingering '
          'debt together. Romantic — and a real financial entanglement.',
      choices: [
        CrisisChoice('Merge and pay down their debt', (g, rng) {
          final amt = spend(g, rng, 2000, 6000);
          obligation(g, 'Shared debt payoff', rnd(rng, 200, 500), 12);
          return 'You knock ${usd(amt)} off their balance now and split the rest '
              'monthly. Trust, with a price tag.';
        }),
        CrisisChoice('Keep separate, build a joint fund', (g, rng) {
          final amt = spend(g, rng, 500, 1500);
          return 'You seed a ${usd(amt)} shared "us" account but keep your own. '
              'Boundaries intact, and honestly a little safer.';
        }),
      ],
    ),
    // ---- minNetWorth 30000 -------------------------------------------------
    CrisisEvent(
      id: 'fam_aging_parent_care',
      emoji: '👵',
      title: 'Mom Needs More Care',
      body:
          'Your mother can no longer manage alone. You can move her in, or help '
          'pay for an assisted-living place near you.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Move her in, retrofit the house', (g, rng) {
          final reno = spend(g, rng, 3000, 9000);
          obligation(g, 'In-home care help', rnd(rng, 400, 900), 24);
          return 'A grab-bar bathroom and a ramp: ${usd(reno)}, plus part-time '
              'aides monthly. Hard days, but she\'s home with you.';
        }),
        CrisisChoice('Help fund assisted living', (g, rng) {
          obligation(g, 'Assisted living gap', rnd(rng, 1500, 3500), 24);
          return 'You cover the gap her pension can\'t — a steep monthly bill. '
              'She\'s safe and social; your wallet feels it.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_your_wedding',
      emoji: '💍',
      title: 'Planning Your Own Wedding',
      body:
          'You\'re engaged. Now the budget meeting: dream wedding, sensible '
          'wedding, or elope and bank the difference.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('The big day', (g, rng) {
          final cost = spend(g, rng, 18000, 36000);
          return 'A hundred and fifty guests, a band, a tearful toast: '
              '${usd(cost)}. Unforgettable. Also expensive.';
        }),
        CrisisChoice('Tasteful and trimmed', (g, rng) {
          final cost = spend(g, rng, 6000, 14000);
          return 'Close friends, a backyard, great tacos: ${usd(cost)}. All the '
              'love, half the line items.';
        }),
        CrisisChoice('Elope, party later', (g, rng) {
          final cost = spend(g, rng, 1500, 4000);
          return 'Courthouse, then a trip: ${usd(cost)}. Some relatives sulk; '
              'your savings account quietly rejoices.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_parent_medical_bill',
      emoji: '🏥',
      title: 'A Relative\'s Medical Bill',
      body:
          'Your uncle\'s surgery left a bill insurance won\'t fully cover, and '
          'he\'s too proud to ask. The family looks at you.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Quietly pay it off', (g, rng) {
          final amt = spendScaled(g, 0.06, 4000);
          return 'You settle ${usd(amt)} with the hospital and tell no one. He '
              'finds out anyway and can barely speak.';
        }),
        CrisisChoice('Split it with the cousins', (g, rng) {
          final amt = spend(g, rng, 1500, 4000);
          return 'You organize a family split and chip in ${usd(amt)}. Shared '
              'load, shared relief — and a few who "forget" to pay.';
        }),
        CrisisChoice('Help him set up a payment plan', (g, rng) {
          final amt = spend(g, rng, 300, 800);
          return 'You cover the ${usd(amt)} first installment and negotiate the '
              'rest down. Less cash, more dignity for him.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_bail_out',
      emoji: '🆘',
      title: 'The 3 a.m. Bail Call',
      body:
          'A family member is in a holding cell over something dumb but real. '
          'Bail is set and the clock is ticking.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Post bail tonight', (g, rng) {
          final amt = spend(g, rng, 2000, 6000);
          if (rng.nextDouble() < 0.6) {
            final back = gain(g, rng, 2000, 6000);
            return 'You post ${usd(amt)}. They show up to court and the bail '
                'comes back — you net most of ${usd(back)} eventually.';
          }
          return 'You post ${usd(amt)}. They miss a hearing and the money '
              'evaporates. Lesson: expensive.';
        }),
        CrisisChoice('Use a bail bondsman to limit exposure', (g, rng) {
          final fee = spend(g, rng, 500, 1500);
          return 'You pay a bondsman\'s ${usd(fee)} non-refundable fee. Less '
              'cash at risk, but that fee is just gone.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_sibling_house_deposit',
      emoji: '🔑',
      title: 'A Hand With The House Deposit',
      body:
          'Your sister found the perfect starter home but is short on the down '
          'payment. A gift now could change her whole decade.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Gift the gap', (g, rng) {
          final amt = spendScaled(g, 0.08, 5000);
          return 'You gift ${usd(amt)} toward the deposit. She gets the keys and '
              'a "thank you" you\'ll feel for years.';
        }),
        CrisisChoice('Loan it, paperwork and all', (g, rng) {
          final amt = spend(g, rng, 5000, 12000);
          if (rng.nextDouble() < 0.6) {
            final back = gain(g, rng, 3000, 12000);
            obligation(g, 'Sister\'s repayments', rnd(rng, 150, 400), 12);
            return 'A real loan with a real schedule — ${usd(amt)} out, ${usd(back)} '
                'and steady payments coming back. She\'s reliable.';
          }
          return 'You lend ${usd(amt)} on a handshake-plus-spreadsheet. '
              'Payments start "next month." They always do.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_nephew_first_car_repair',
      emoji: '🔧',
      title: 'The College Kid\'s Car Dies',
      body:
          'Your niece\'s ancient commuter just blew its transmission three weeks '
          'into a new job she really needs to keep.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Pay for the rebuild', (g, rng) {
          final amt = spend(g, rng, 1500, 4000);
          return 'You cover the ${usd(amt)} transmission job. She keeps the job, '
              'and you keep a fan for life.';
        }),
        CrisisChoice('Chip in toward a used replacement', (g, rng) {
          final amt = spend(g, rng, 2500, 6000);
          return 'You put ${usd(amt)} toward a reliable used car so this never '
              'happens again. Pricier now, calmer later.';
        }),
      ],
    ),
    // ---- minNetWorth 150000 ------------------------------------------------
    CrisisEvent(
      id: 'fam_inheritance_strings',
      emoji: '📜',
      title: 'Inheritance, With Strings',
      body:
          'Great-Aunt Vivian left you a tidy sum — on the condition you also '
          'take over the upkeep of her ancient, beloved lake cabin.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Accept the money and the cabin', (g, rng) {
          final inh = gain(g, rng, 40000, 90000);
          obligation(g, 'Cabin upkeep & taxes', rnd(rng, 600, 1400), 24);
          return 'You bank ${usd(inh)}, then inherit a roof that leaks and a '
              'dock that doesn\'t. The sunsets, though.';
        }),
        CrisisChoice('Take a reduced cash-only share', (g, rng) {
          final inh = gain(g, rng, 20000, 45000);
          return 'You waive the cabin for a clean ${usd(inh)}. No memories, no '
              'maintenance. The cousins fight over the lake place instead.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_parents_retirement_gift',
      emoji: '🌅',
      title: 'Pay Off Your Parents\' Mortgage',
      body:
          'Your parents are nearing retirement still carrying a mortgage. You '
          'could wipe it out and hand them their freedom.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Pay it off in full', (g, rng) {
          final amt = spendScaled(g, 0.18, 30000);
          return 'You clear ${usd(amt)} of mortgage in one stroke. Your dad, who '
              'never cries, has to "go check on something."';
        }),
        CrisisChoice('Cover their payments for a few years', (g, rng) {
          obligation(g, 'Parents\' mortgage', rnd(rng, 1200, 2200), 24);
          return 'You take over the monthly note for a while. Lighter today, a '
              'steady drip on your books for two years.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_family_business_buyin',
      emoji: '🏪',
      title: 'Buy Into The Family Business',
      body:
          'Your dad\'s hardware store is finally turning a corner and he\'s '
          'offering you a real equity stake — if you fund the expansion.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Fund the full expansion', (g, rng) {
          final stake = spendScaled(g, 0.15, 25000);
          final r = wager(g, rng, stake, 0.5, 2.2);
          if (r > 0) {
            return 'You put in ${usd(stake)}; the second location thrives and '
                'your stake pays out ${usd(r)}. Dad was right.';
          }
          return 'You put in ${usd(stake)}; the new lease and a slow season '
              'eat it. Family dinners get a little quieter.';
        }),
        CrisisChoice('Take a small, safe stake', (g, rng) {
          final stake = spend(g, rng, 10000, 25000);
          final r = wager(g, rng, stake, 0.55, 1.8);
          if (r > 0) {
            return 'A measured ${usd(stake)} buy-in returns ${usd(r)}. Modest, '
                'real, and zero shouting matches.';
          }
          return 'Your ${usd(stake)} stake dips with the market. Salvageable, '
              'and you kept the bigger bag dry.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'fam_eldercare_premium',
      emoji: '🏡',
      title: 'The Memory-Care Decision',
      body:
          'Dad\'s condition needs specialized memory care now. The good facility '
          'is excellent — and breathtakingly expensive.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Choose the top facility', (g, rng) {
          obligation(g, 'Memory care', rnd(rng, 4000, 7000), 24);
          return 'Round-the-clock specialists and a real garden — a heavy '
              'monthly bill, but he\'s safe and cared for. Worth it.';
        }),
        CrisisChoice('A solid facility plus a care fund', (g, rng) {
          final fund = spend(g, rng, 15000, 35000);
          obligation(g, 'Care top-ups', rnd(rng, 1500, 3000), 24);
          return 'You prepay ${usd(fund)} into a care fund and cover top-ups '
              'monthly. A balance of quality and not going broke.';
        }),
      ],
    ),
    // ---- minNetWorth 750000 (tycoon-tier ask) ------------------------------
    CrisisEvent(
      id: 'fam_legacy_foundation',
      emoji: '🏛️',
      title: 'The Family Legacy Pitch',
      body:
          'Now that you\'re wealthy, the whole family has ideas: a scholarship '
          'fund in Grandpa\'s name, or seed money for the next generation\'s '
          'ventures.',
      minNetWorth: 750000,
      choices: [
        CrisisChoice('Endow a scholarship fund', (g, rng) {
          final amt = spendScaled(g, 0.1, 75000);
          return 'You endow ${usd(amt)} in Grandpa\'s name. His photo goes on a '
              'plaque; your name goes on a building. Legacy, locked in.';
        }),
        CrisisChoice('Stake the next generation\'s ventures', (g, rng) {
          final stake = spendScaled(g, 0.08, 60000);
          final r = wager(g, rng, stake, 0.45, 2.5);
          if (r > 0) {
            return 'You back the cousins\' startups with ${usd(stake)}. One hits '
                'big and returns ${usd(r)}. You\'re the family\'s VC now.';
          }
          return 'You stake ${usd(stake)} across a dozen family dreams. Most '
              'fizzle. You knew the odds — and it bought a lot of goodwill.';
        }),
        CrisisChoice('Set up a modest matching gift', (g, rng) {
          final amt = spendScaled(g, 0.03, 30000);
          return 'You match whatever the family raises — ${usd(amt)} in the end. '
              'Generous, prudent, and it gets everyone invested.';
        }),
      ],
    ),
  ];
}
