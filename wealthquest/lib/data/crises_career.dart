import 'crisis_kit.dart';

/// Career & work expansion pack. Every choice is a real tradeoff (a pro and a con).
class CareerCrises {
  CareerCrises._();

  static final List<CrisisEvent> all = [
    // ── BASE TIER (no minNetWorth) ──────────────────────────────────────────
    CrisisEvent(
      id: 'career_layoff_buyout',
      emoji: '📦',
      title: 'Voluntary buyout on the table',
      body: 'Reorg time. HR offers a buyout — a lump-sum severance if you '
          'leave now, or you can cling on and ride out the uncertainty.',
      choices: [
        CrisisChoice('Take the buyout', (g, rng) {
          final pkg = gain(g, rng, 6000, 14000);
          unpaidLeave(g, 3, 'Job hunting after buyout');
          return 'You pocket ${usd(pkg)} severance — now three lean months of '
              'job hunting with no salary.';
        }),
        CrisisChoice('Cling to your desk', (g, rng) =>
            'You decline the envelope and keep your paycheck — for now.'),
      ],
    ),
    CrisisEvent(
      id: 'career_counteroffer',
      emoji: '🤝',
      title: 'A rival firm is courting you',
      body: 'A competitor dangles a better title. Your boss counteroffers a '
          'raise to keep you — but staying may stall the new opportunity.',
      choices: [
        CrisisChoice('Take the counteroffer & raise', (g, rng) {
          final bump = gain(g, rng, 1200, 3000);
          obligation(g, 'Retention clawback if you leave early', 200, 6);
          return 'You bank a ${usd(bump)} retention bonus, but you\'re locked '
              'in — \$200/mo clawback hangs over you for six months.';
        }),
        CrisisChoice('Jump to the rival', (g, rng) {
          final delta = wager(g, rng, 2500, 0.55, 2.2);
          return delta >= 0
              ? 'The leap pays off — ${usd(delta)} richer at the new shop.'
              : 'The new gig fizzles in probation — down ${usd(-delta)}.';
        }),
        CrisisChoice('Stay put, no drama', (g, rng) =>
            'You decline both and keep your head down.'),
      ],
    ),
    CrisisEvent(
      id: 'career_expense_report',
      emoji: '🧾',
      title: 'Boss asks you to cook the expense report',
      body: 'Your manager "suggests" you pad the quarterly expense report and '
          'split the difference. Easy money — if nobody audits it.',
      choices: [
        CrisisChoice('Pad it and pocket the cash', (g, rng) {
          final skim = gain(g, rng, 800, 2000);
          if (rng.nextDouble() < 0.35) {
            final fine = spend(g, rng, 3000, 6000);
            return 'You skim ${usd(skim)}, then finance audits — a ${usd(fine)} '
                'fine and a very awkward meeting.';
          }
          return 'No audit this quarter. You quietly keep ${usd(skim)}.';
        }),
        CrisisChoice('Report it straight', (g, rng) =>
            'You file honest numbers and sleep fine.'),
      ],
    ),
    CrisisEvent(
      id: 'career_promotion_burnout',
      emoji: '🔥',
      title: 'Promotion — with brutal hours',
      body: 'A bigger title and a fatter paycheck, but 70-hour weeks come with '
          'it. Your wallet thanks you; your body files a complaint.',
      choices: [
        CrisisChoice('Grab the promotion', (g, rng) {
          final raise = gain(g, rng, 2000, 4000);
          obligation(g, 'Burnout: takeout, therapy, gym you never use', 300, 8);
          return 'A ${usd(raise)} signing kicker — but burnout taxes you '
              '\$300/mo for eight months.';
        }),
        CrisisChoice('Stay in your lane', (g, rng) =>
            'You pass on the title and keep your weekends.'),
      ],
    ),
    CrisisEvent(
      id: 'career_freelance_gig',
      emoji: '💻',
      title: 'A weekend freelance contract',
      body: 'A client wants a side project done fast. Good cash, but the '
          'deadline eats every weekend for a month.',
      choices: [
        CrisisChoice('Take the contract', (g, rng) {
          final fee = gain(g, rng, 1500, 3500);
          final coffee = spend(g, rng, 100, 300);
          return 'You invoice ${usd(fee)} (minus ${usd(coffee)} in late-night '
              'coffee) and lose a month of weekends.';
        }),
        CrisisChoice('Protect your weekends', (g, rng) =>
            'You turn it down and actually rest.'),
      ],
    ),
    CrisisEvent(
      id: 'career_certification',
      emoji: '📜',
      title: 'A certification could pay off',
      body: 'A respected industry cert opens doors — but the exam and prep '
          'materials cost real money up front, with no guaranteed return.',
      choices: [
        CrisisChoice('Pay for the cert & exam', (g, rng) {
          final cost = spend(g, rng, 600, 1500);
          if (rng.nextDouble() < 0.6) {
            final raise = gain(g, rng, 1200, 2800);
            return 'You spent ${usd(cost)} and it landed — a ${usd(raise)} '
                'bump for the new credential.';
          }
          return 'You pass the ${usd(cost)} exam, but nobody at work cares yet.';
        }),
        CrisisChoice('Skip it for now', (g, rng) =>
            'You keep your cash and your current title.'),
      ],
    ),
    CrisisEvent(
      id: 'career_toxic_client',
      emoji: '☠️',
      title: 'Fire the client from hell?',
      body: 'Your biggest account is also your most abusive. Drop them and you '
          'reclaim your sanity — and lose the revenue.',
      choices: [
        CrisisChoice('Fire the toxic client', (g, rng) {
          obligation(g, 'Lost client: leaner months ahead', 250, 5);
          return 'Sweet freedom — but the gap costs you \$250/mo for five '
              'months until you replace the income.';
        }),
        CrisisChoice('Grit your teeth and keep them', (g, rng) {
          final fee = gain(g, rng, 800, 1800);
          final stress = spend(g, rng, 200, 500);
          return 'You bank ${usd(fee)}, then blow ${usd(stress)} on a spa day '
              'to recover from the call.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'career_union_strike',
      emoji: '✊',
      title: 'Union calls a strike',
      body: 'The picket line is up. Walk out for better terms, or cross it and '
          'keep getting paid while your coworkers glare.',
      choices: [
        CrisisChoice('Walk the picket line', (g, rng) {
          unpaidLeave(g, 2, 'On strike with the union');
          return 'Solidarity has a price — two months unpaid on the line.';
        }),
        CrisisChoice('Cross the picket for pay', (g, rng) {
          final pay = gain(g, rng, 1000, 2500);
          obligation(g, 'Scab reputation: shunned, paying for lunches alone',
              120, 6);
          return 'You keep ${usd(pay)} coming in, but "scab" sticks — \$120/mo '
              'in social fallout for six months.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'career_wfh_stipend',
      emoji: '🏠',
      title: 'Return-to-office mandate',
      body: 'The company wants you back at a desk. Negotiate to stay remote '
          'with a stipend, or comply and eat the commute.',
      choices: [
        CrisisChoice('Negotiate remote + stipend', (g, rng) {
          if (rng.nextDouble() < 0.5) {
            final stipend = gain(g, rng, 400, 1200);
            return 'They cave — ${usd(stipend)} home-office stipend and you '
                'keep your slippers on.';
          }
          obligation(g, 'Commute: gas, tolls, sad parking garage', 180, 6);
          return 'They say no. You commute anyway — \$180/mo for six months.';
        }),
        CrisisChoice('Just go back to the office', (g, rng) {
          obligation(g, 'Commute costs', 180, 6);
          return 'You comply — \$180/mo in commuting for six months.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'career_mentor_stipend',
      emoji: '🧑‍🏫',
      title: 'Mentor a junior for a stipend',
      body: 'Leadership asks you to mentor a new hire. A modest stipend comes '
          'with it — and hours you\'d rather spend on your own work.',
      choices: [
        CrisisChoice('Take on the mentee', (g, rng) {
          final stipend = gain(g, rng, 500, 1500);
          final time = spend(g, rng, 100, 400);
          return 'You earn a ${usd(stipend)} stipend, minus ${usd(time)} in '
              'lost billable focus.';
        }),
        CrisisChoice('Politely decline', (g, rng) =>
            'You keep your calendar clear and pass the mentee along.'),
      ],
    ),
    CrisisEvent(
      id: 'career_conference',
      emoji: '🎤',
      title: 'An industry conference invite',
      body: 'A flagship conference could grow your network — but travel, '
          'tickets, and hotels aren\'t cheap, and the payoff is a maybe.',
      choices: [
        CrisisChoice('Go and network hard', (g, rng) {
          final cost = spend(g, rng, 700, 1600);
          if (rng.nextDouble() < 0.45) {
            final lead = gain(g, rng, 1500, 3500);
            return 'You spent ${usd(cost)} and shook the right hand — a '
                '${usd(lead)} lead walks out the door with you.';
          }
          return 'You spent ${usd(cost)} on swag and small talk. Nice tote bag.';
        }),
        CrisisChoice('Watch the livestream for free', (g, rng) =>
            'You skip the flight and catch the talks from your couch.'),
      ],
    ),
    CrisisEvent(
      id: 'career_side_hustle',
      emoji: '🛒',
      title: 'Launch a little side hustle',
      body: 'You\'ve got an idea for a small online store. Sink some startup '
          'cash in — it could take off, or quietly die.',
      choices: [
        CrisisChoice('Bootstrap the store', (g, rng) {
          final delta = wager(g, rng, 1500, 0.45, 3.0);
          return delta >= 0
              ? 'Orders roll in — the hustle nets you ${usd(delta)}.'
              : 'Crickets. The store flops and you eat ${usd(-delta)} in '
                  'inventory.';
        }),
        CrisisChoice('Stick to the day job', (g, rng) =>
            'You shelve the idea and keep your evenings.'),
      ],
    ),
    CrisisEvent(
      id: 'career_overtime_grind',
      emoji: '⏰',
      title: 'Mandatory overtime stretch',
      body: 'A big release means weeks of overtime. Time-and-a-half pay is '
          'real, but so is the toll on everything else.',
      choices: [
        CrisisChoice('Grind the overtime', (g, rng) {
          final ot = gain(g, rng, 900, 2200);
          final makeup = spend(g, rng, 150, 450);
          return 'You bank ${usd(ot)} in OT, then ${usd(makeup)} making up for '
              'missed dinners and a forgotten birthday.';
        }),
        CrisisChoice('Set a boundary', (g, rng) =>
            'You clock out on time and let the deadline be someone else\'s '
            'problem.'),
      ],
    ),

    // ── MID TIER (minNetWorth: 30000) ───────────────────────────────────────
    CrisisEvent(
      id: 'career_relocation_package',
      emoji: '🚚',
      title: 'Relocate for a promotion',
      body: 'The company will move you cross-country for a bigger role. There '
          'is a signing bonus — and the move itself is on your dime up front.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Take the package & move', (g, rng) {
          final bonus = gain(g, rng, 5000, 12000);
          final moving = spend(g, rng, 3000, 7000);
          return 'You collect a ${usd(bonus)} signing bonus and pay ${usd(moving)} '
              'to actually move the boxes.';
        }),
        CrisisChoice('Stay rooted', (g, rng) =>
            'You decline — your couch isn\'t going anywhere.'),
      ],
    ),
    CrisisEvent(
      id: 'career_headhunted',
      emoji: '🎯',
      title: 'A headhunter has a number',
      body: 'A recruiter swears they can place you somewhere far better — for '
          'a finder\'s arrangement and the risk it doesn\'t pan out.',
      choices: [
        CrisisChoice('Let them shop you around', (g, rng) {
          final delta = wager(g, rng, 4000, 0.5, 2.6);
          return delta >= 0
              ? 'They land you a sweet seat — ${usd(delta)} ahead.'
              : 'The "perfect role" evaporates and you\'re out ${usd(-delta)} '
                  'in their fee.';
        }),
        CrisisChoice('Ghost the recruiter', (g, rng) =>
            'You let the LinkedIn message rot in your inbox.'),
      ],
    ),
    CrisisEvent(
      id: 'career_startup_equity',
      emoji: '🚀',
      title: 'A startup offers equity over cash',
      body: 'A scrappy startup wants you — at a lower salary, but with a chunk '
          'of equity that could be worth a fortune or worth nothing.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Take the pay cut for equity', (g, rng) {
          unpaidLeave(g, 1, 'Bridging the pay gap to the startup');
          final delta = wager(g, rng, 6000, 0.4, 4.0);
          return delta >= 0
              ? 'A lean first month, then the equity pops — ${usd(delta)} '
                  'richer.'
              : 'A lean first month, and the cap table screws you — '
                  '${usd(-delta)} gone.';
        }),
        CrisisChoice('Stay salaried & safe', (g, rng) =>
            'You keep the boring, reliable paycheck.'),
      ],
    ),
    CrisisEvent(
      id: 'career_workplace_injury',
      emoji: '🩼',
      title: 'You got hurt on the job',
      body: 'A workplace injury sidelines you. Push a comp claim for a payout '
          'and time to heal, or tough it out to avoid the friction.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('File for workers\' comp', (g, rng) {
          final payout = gain(g, rng, 3000, 7000);
          unpaidLeave(g, 2, 'Recovering on workers\' comp');
          return 'A ${usd(payout)} settlement, and two months off your regular '
              'salary to actually heal.';
        }),
        CrisisChoice('Tough it out', (g, rng) {
          final meds = spend(g, rng, 400, 1200);
          return 'You limp on and pay ${usd(meds)} out of pocket for the '
              'physio you won\'t admit you need.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'career_defer_bonus',
      emoji: '🗓️',
      title: 'Defer your annual bonus?',
      body: 'You can take this year\'s bonus now, or defer it for a bigger '
          'payout next year — if the company is still flush.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Defer for a bigger check', (g, rng) {
          if (rng.nextDouble() < 0.65) {
            final big = gain(g, rng, 5000, 11000);
            return 'The gamble holds — a fat ${usd(big)} deferred bonus lands.';
          }
          final scraps = gain(g, rng, 500, 1500);
          return 'A bad year hits and the deferral shrinks — only ${usd(scraps)} '
              'survives.';
        }),
        CrisisChoice('Take it now', (g, rng) {
          final now = gain(g, rng, 3000, 6000);
          return 'Bird in hand — ${usd(now)} in your account today.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'career_company_car_lease',
      emoji: '🚗',
      title: 'Company car or cash allowance?',
      body: 'A new role comes with a perk choice: a leased company car, or a '
          'monthly cash allowance you manage yourself.',
      choices: [
        CrisisChoice('Take the cash allowance', (g, rng) {
          final allowance = gain(g, rng, 1500, 3000);
          obligation(g, 'Running your own car: insurance, gas, repairs', 350, 6);
          return 'You pocket ${usd(allowance)} up front, then \$350/mo keeping '
              'your own wheels on the road for six months.';
        }),
        CrisisChoice('Take the company car', (g, rng) =>
            'You take the lease — no cash, but no headaches either.'),
      ],
    ),

    // ── HIGH TIER (minNetWorth: 150000) ─────────────────────────────────────
    CrisisEvent(
      id: 'career_quit_to_consult',
      emoji: '🧳',
      title: 'Quit to go independent',
      body: 'You have enough cushion to quit and consult solo. Total freedom — '
          'and a terrifying gap before the first invoice clears.',
      minNetWorth: 150000,
      eligible: (g) => g.ageYears >= 28,
      choices: [
        CrisisChoice('Hang out your shingle', (g, rng) {
          unpaidLeave(g, 4, 'Ramping up the consulting practice');
          final delta = wager(g, rng, 20000, 0.5, 2.4);
          return delta >= 0
              ? 'Four dry months, then clients flood in — ${usd(delta)} ahead.'
              : 'Four dry months and the pipeline stays empty — ${usd(-delta)} '
                  'burned.';
        }),
        CrisisChoice('Stay employed', (g, rng) =>
            'You keep the salary and the dream on the shelf.'),
      ],
    ),
    CrisisEvent(
      id: 'career_buy_into_partnership',
      emoji: '🏛️',
      title: 'Buy into the partnership',
      body: 'The firm offers you partner — but partners buy in. A serious '
          'capital call now for a share of future profits.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Make partner, write the check', (g, rng) {
          final buyIn = spendScaled(g, 0.04, 25000);
          if (rng.nextDouble() < 0.6) {
            final distro = gain(g, rng, 30000, 70000);
            return 'You wire ${usd(buyIn)} in, and the first profit '
                'distribution returns ${usd(distro)}.';
          }
          return 'You wire ${usd(buyIn)} in; the partnership has a slow year '
              'and distributions are thin.';
        }),
        CrisisChoice('Stay salaried counsel', (g, rng) =>
            'You decline the buy-in and keep your capital.'),
      ],
    ),
    CrisisEvent(
      id: 'career_executive_severance',
      emoji: '🪂',
      title: 'Golden parachute or fight it',
      body: 'A boardroom shakeup pushes you out. Sign the exit package quietly, '
          'or lawyer up for a bigger one with no guarantees.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Sign the parachute', (g, rng) {
          final chute = gain(g, rng, 25000, 60000);
          unpaidLeave(g, 3, 'Between executive roles');
          return 'You glide out with ${usd(chute)} and three months to find '
              'the next corner office.';
        }),
        CrisisChoice('Lawyer up for more', (g, rng) {
          final legal = spendScaled(g, 0.03, 8000);
          if (rng.nextDouble() < 0.5) {
            final settle = gain(g, rng, 50000, 110000);
            return 'You spend ${usd(legal)} on counsel and squeeze out a '
                '${usd(settle)} settlement.';
          }
          return 'You spend ${usd(legal)} on lawyers and settle for roughly '
              'what they first offered. Pyrrhic.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'career_sabbatical',
      emoji: '🏝️',
      title: 'A six-month sabbatical',
      body: 'You\'ve earned the right to step away for half a year — unpaid, '
          'but you\'d come back recharged. The cost is six months of no salary.',
      minNetWorth: 30000,
      eligible: (g) => g.ageYears >= 30,
      choices: [
        CrisisChoice('Take the sabbatical', (g, rng) {
          unpaidLeave(g, 6, 'On a well-earned sabbatical');
          final travel = spend(g, rng, 5000, 12000);
          return 'Six months unpaid and ${usd(travel)} on the trip — but you '
              'come back a human being again.';
        }),
        CrisisChoice('Keep grinding', (g, rng) =>
            'You stay on the treadmill and keep the checks coming.'),
      ],
    ),

    // ── TYCOON TIER (minNetWorth: 750000) ───────────────────────────────────
    CrisisEvent(
      id: 'career_acquire_competitor',
      emoji: '🏢',
      title: 'Acquire a struggling competitor',
      body: 'A rival firm is on the ropes and could be yours. Fold their book '
          'of business into yours — if the integration doesn\'t implode.',
      minNetWorth: 750000,
      choices: [
        CrisisChoice('Buy them out', (g, rng) {
          final price = spendScaled(g, 0.05, 80000);
          final delta = wager(g, rng, 120000, 0.55, 2.0);
          return delta >= 0
              ? 'You pay ${usd(price)} for the firm and the synergies are real '
                  '— a ${usd(delta)} windfall as clients stay.'
              : 'You pay ${usd(price)}, then half their clients bolt — a '
                  '${usd(-delta)} hole to fill.';
        }),
        CrisisChoice('Let them fail', (g, rng) =>
            'You pass and watch the competition collapse on its own.'),
      ],
    ),

    // ── Petty ones that stop bugging the wealthy ────────────────
    CrisisEvent(
      id: 'career_coffee_run',
      emoji: '☕',
      title: 'Stuck on the office coffee run',
      body: 'You always end up fronting the team coffee order. Keep playing '
          'nice, or finally put your foot down.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Cover the round again', (g, rng) {
          final tab = spend(g, rng, 30, 90);
          return 'You eat the ${usd(tab)} tab and bank some goodwill.';
        }),
        CrisisChoice('Start a kitty — awkwardly', (g, rng) =>
            'You set up a coffee fund. Half the team "forgets" their wallet, '
            'but your tab stops growing.'),
      ],
    ),
    CrisisEvent(
      id: 'career_linkedin_course',
      emoji: '📱',
      title: 'That "career-changing" online course',
      body: 'An influencer swears their $200 course will double your salary. '
          'It probably won\'t. But what if it does?',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('Buy the course', (g, rng) {
          final cost = spend(g, rng, 100, 350);
          if (rng.nextDouble() < 0.3) {
            final tip = gain(g, rng, 400, 1000);
            return 'You spent ${usd(cost)} — and one actual tip in module 6 '
                'nets you ${usd(tip)}. Broken clock, right twice.';
          }
          return 'You spent ${usd(cost)} and watched two modules before life '
              'got in the way.';
        }),
        CrisisChoice('Close the tab', (g, rng) =>
            'You resist the funnel and keep your money.'),
      ],
    ),
  ];
}
