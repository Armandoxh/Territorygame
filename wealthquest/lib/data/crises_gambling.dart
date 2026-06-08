import 'crisis_kit.dart';

/// Gambling, bets & hot tips expansion pack. Every choice is a real tradeoff.
class GamblingCrises {
  GamblingCrises._();

  static final List<CrisisEvent> all = [
    // ── BASE TIER (no minNetWorth) ──────────────────────────────────────────
    CrisisEvent(
      id: 'bet_buddy_lock_parlay',
      emoji: '🏈',
      title: 'Your buddy swears this parlay is a LOCK',
      body: 'Three legs, "can\'t-miss," he says. The math says three-leggers '
          'cash maybe one time in seven — but the payout is juicy.',
      maxNetWorth: 400000,
      choices: [
        CrisisChoice('Throw \$200 on the lock', (g, rng) {
          final r = wager(g, rng, rnd(rng, 150, 300), 0.15, 6.5);
          return r > 0
              ? 'All three hit — you cash ${usd(r)} and he\'ll never shut up.'
              : 'Leg three blew it in overtime. Down ${usd(-r)}.';
        }),
        CrisisChoice('Bet just the safest leg', (g, rng) {
          final r = wager(g, rng, rnd(rng, 150, 300), 0.55, 1.9);
          return r > 0
              ? 'The single hits — a tidy ${usd(r)}, no heroics.'
              : 'Even the "safe" one backdoored you. Down ${usd(-r)}.';
        }),
        CrisisChoice('Keep your money, watch for free', (g, rng) =>
            'You enjoy the game on the couch and risk nothing.'),
      ],
    ),
    CrisisEvent(
      id: 'bet_office_bracket',
      emoji: '🏀',
      title: 'The office bracket pool',
      body: 'Everyone\'s chipping in for the tournament bracket. Pure luck once '
          'the upsets start — but winner takes the pot.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Buy in', (g, rng) {
          final r = wager(g, rng, rnd(rng, 25, 75), 0.2, 8.0);
          return r > 0
              ? 'Your random picks ran the table — you scoop ${usd(r)}!'
              : 'A 12-seed wrecked your bracket by day two. Down ${usd(-r)}.';
        }),
        CrisisChoice('Skip it', (g, rng) =>
            'You sit out and keep your entry fee in your pocket.'),
      ],
    ),
    CrisisEvent(
      id: 'bet_poker_night',
      emoji: '🃏',
      title: 'Friday night poker with the crew',
      body: 'Low stakes, mostly skill if you play tight. You\'re a decent '
          'player — but the cards still do what they want.',
      maxNetWorth: 350000,
      choices: [
        CrisisChoice('Sit down and grind', (g, rng) {
          final r = wager(g, rng, rnd(rng, 100, 300), 0.6, 1.8);
          return r > 0
              ? 'You read the table all night and walk with ${usd(r)}.'
              : 'You ran your aces into a flush. Down ${usd(-r)}.';
        }),
        CrisisChoice('Just watch and drink', (g, rng) {
          final tab = spend(g, rng, 20, 60);
          return 'You nurse a beer for ${usd(tab)} and keep your bankroll.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'bet_app_signup_bonus',
      emoji: '📱',
      title: 'A betting app dangles a signup bonus',
      body: '"\$100 free!" — but the rollover terms mean you have to keep '
          'wagering to ever cash it out.',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('Grab the bonus and play it through', (g, rng) {
          final bonus = gain(g, rng, 80, 120);
          obligation(g, 'App rollover wagering', rnd(rng, 30, 70), 3);
          return 'You pocket ${usd(bonus)} in "free" credit — and the rollover '
              'keeps you betting for a while.';
        }),
        CrisisChoice('Delete the app', (g, rng) =>
            'You recognize the trap and uninstall it. No bonus, no strings.'),
      ],
    ),
    CrisisEvent(
      id: 'bet_scratch_habit',
      emoji: '🎫',
      title: 'The corner-store scratch ticket habit',
      body: 'You\'ve started buying a scratcher with every coffee. It\'s "only '
          'a couple bucks" — but it\'s every single day.',
      maxNetWorth: 200000,
      choices: [
        CrisisChoice('Lean in — buy a book of them', (g, rng) {
          obligation(g, 'Daily scratch tickets', rnd(rng, 60, 140), 6);
          if (rng.nextDouble() < 0.12) {
            final hit = gain(g, rng, 500, 2000);
            return 'One ticket actually pops for ${usd(hit)} — which guarantees '
                'you\'ll never stop now.';
          }
          return 'You silver-dust your fingers daily for months. Mostly losers.';
        }),
        CrisisChoice('Cap it at one a week', (g, rng) {
          final fun = spend(g, rng, 5, 15);
          return 'You ration it to ${usd(fun)} of weekend fun. Healthier.';
        }),
        CrisisChoice('Quit cold turkey', (g, rng) =>
            'You break the habit and keep the spare change.'),
      ],
    ),
    CrisisEvent(
      id: 'bet_coworker_lottery_pool',
      emoji: '🎰',
      title: 'The coworker lottery pool',
      body: 'The whole floor pitches in for a Powerball ticket every jackpot. '
          'If you skip and they hit, you\'ll be the only one still at work.',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('Chip in your \$20', (g, rng) {
          final r = wager(g, rng, 20, 0.05, 8.0);
          return r > 0
              ? 'The pool actually hits a tier — your cut is ${usd(r)}!'
              : 'No dice this time. ${usd(-r)} into the office dream.';
        }),
        CrisisChoice('Skip it this round', (g, rng) {
          if (rng.nextDouble() < 0.03) {
            return 'They WON. You watch eleven coworkers quit and you didn\'t '
                'buy in. Brutal.';
          }
          return 'They don\'t hit. You kept your \$20 and your dignity.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'bet_crypto_friend_100x',
      emoji: '🪙',
      title: 'A friend is "100% sure" this coin 10x\'s',
      body: 'He\'s all-in on a meme token and won\'t stop texting. The chart is '
          'a vertical line — which cuts both ways.',
      maxNetWorth: 400000,
      choices: [
        CrisisChoice('Ape in hard', (g, rng) {
          final r = wager(g, rng, rnd(rng, 500, 1500), 0.25, 5.0);
          return r > 0
              ? 'It pumps and you actually sell in time — up ${usd(r)}!'
              : 'The dev rugged it overnight. ${usd(-r)} to zero.';
        }),
        CrisisChoice('Toss in beer money', (g, rng) {
          final r = wager(g, rng, rnd(rng, 50, 150), 0.25, 5.0);
          return r > 0
              ? 'Your little stack rides the pump — ${usd(r)} richer.'
              : 'It dumped. ${usd(-r)} gone, lesson learned cheaply.';
        }),
        CrisisChoice('Mute the group chat', (g, rng) =>
            'You let this one moon (or crater) without you.'),
      ],
    ),
    CrisisEvent(
      id: 'bet_penny_stock_tip',
      emoji: '🤫',
      title: 'An "insider" penny-stock tip',
      body: 'A guy at the gym swears his cousin knows a buyout is coming. That '
          'is, of course, the textbook definition of insider trading.',
      choices: [
        CrisisChoice('Load up before the "news"', (g, rng) {
          final r = wager(g, rng, rnd(rng, 800, 2500), 0.4, 3.0);
          if (rng.nextDouble() < 0.2) {
            final fine = spend(g, rng, 2000, 6000);
            return 'Regulators flag the trade — a ${usd(fine)} fine on top of '
                'however it went. Should\'ve known.';
          }
          return r > 0
              ? 'The "tip" panned out — up ${usd(r)} and nobody asked questions.'
              : 'The buyout was a rumor. Down ${usd(-r)}.';
        }),
        CrisisChoice('Report it and walk away', (g, rng) =>
            'You want no part of a securities case. You pass clean.'),
      ],
    ),
    CrisisEvent(
      id: 'bet_chase_the_loss',
      emoji: '🔥',
      title: 'You\'re down and want it all back',
      body: 'Tonight went badly. The voice says one big bet fixes everything — '
          'and your card\'s already maxed, so a payday loan beckons.',
      choices: [
        CrisisChoice('Borrow and chase it', (g, rng) {
          final borrowed = rnd(rng, 1000, 3000);
          loanShark(g, borrowed);
          final r = wager(g, rng, borrowed, 0.45, 2.0);
          return r > 0
              ? 'You actually claw back ${usd(r)} — now just pay off that '
                  '${usd(borrowed)} shark loan...'
              : 'You blew the borrowed ${usd(borrowed)} too. Now you owe the '
                  'shark with nothing to show.';
        }),
        CrisisChoice('Log off and eat the loss', (g, rng) =>
            'You close the app. Tonight\'s loss is the loss. No spiral.'),
      ],
    ),
    CrisisEvent(
      id: 'bet_roulette_system',
      emoji: '🎡',
      title: 'A "system" that beats roulette',
      body: 'Double your bet after every loss — can\'t fail, right? The wheel '
          'has no memory, and the table has a limit.',
      maxNetWorth: 350000,
      choices: [
        CrisisChoice('Run the martingale', (g, rng) {
          final r = wager(g, rng, rnd(rng, 300, 800), 0.5, 1.9);
          return r > 0
              ? 'A few greens early and you walk up ${usd(r)}. The system '
                  '"works" — until it doesn\'t.'
              : 'You hit a cold streak and slammed the table cap. Down '
                  '${usd(-r)}.';
        }),
        CrisisChoice('Play the \$5 minimum for fun', (g, rng) {
          final tab = spend(g, rng, 20, 80);
          return 'You enjoy a few spins for ${usd(tab)} and call it a night.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'bet_dumb_wager_friend',
      emoji: '🤝',
      title: 'A bet with a friend over something dumb',
      body: 'You two are absolutely certain of opposite "facts." Pride is on '
          'the line, and so is fifty bucks.',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('Bet on it — you\'re RIGHT', (g, rng) {
          final r = wager(g, rng, rnd(rng, 40, 80), 0.5, 2.0);
          return r > 0
              ? 'The internet proves you right — ${usd(r)} and eternal '
                  'bragging rights.'
              : 'Turns out you were dead wrong. ${usd(-r)} and you\'ll never '
                  'hear the end of it.';
        }),
        CrisisChoice('"Let\'s just look it up"', (g, rng) =>
            'You settle it with a search and your wallet stays shut.'),
      ],
    ),
    CrisisEvent(
      id: 'bet_fantasy_buyin',
      emoji: '🏆',
      title: 'Fantasy league buy-in',
      body: 'The high-stakes fantasy league has an open spot. A whole season of '
          'sweating waiver wires — and a real prize pool.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Join the high-stakes league', (g, rng) {
          final r = wager(g, rng, rnd(rng, 200, 500), 0.4, 2.5);
          return r > 0
              ? 'Your draft was elite and you take the pot — ${usd(r)}.'
              : 'Two star players got hurt in week three. Down ${usd(-r)}.';
        }),
        CrisisChoice('Play the free league', (g, rng) =>
            'You join for pride only — all the trash talk, none of the risk.'),
      ],
    ),
    CrisisEvent(
      id: 'bet_day_trade_savings',
      emoji: '📈',
      title: 'The urge to day-trade your savings',
      body: 'You\'ve been watching tickers all day and feel like you\'ve "got '
          'a feel for it." Most day traders lose. But what if you\'re the one?',
      choices: [
        CrisisChoice('Throw real money at it for a month', (g, rng) {
          final r = wager(g, rng, rnd(rng, 1000, 3000), 0.4, 2.2);
          return r > 0
              ? 'You catch a couple of clean swings — up ${usd(r)}. Don\'t get '
                  'cocky.'
              : 'The market chopped you to pieces. Down ${usd(-r)}.';
        }),
        CrisisChoice('Paper-trade first', (g, rng) =>
            'You practice with fake money. Smart — and it costs nothing.'),
      ],
    ),

    // ── minNetWorth: 30000 ──────────────────────────────────────────────────
    CrisisEvent(
      id: 'bet_vegas_comp_trip',
      emoji: '🛩️',
      title: 'A comped Vegas trip',
      body: 'The casino flew you out free and put you up in a suite. The flight '
          'and room are "on them" — but nobody comps a non-gambler.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Hit the high-limit tables', (g, rng) {
          final r = wager(g, rng, rnd(rng, 2000, 6000), 0.45, 2.0);
          return r > 0
              ? 'The free suite paid for itself — you leave up ${usd(r)}.'
              : 'The "free" trip cost you ${usd(-r)} at the tables. That\'s the '
                  'whole business model.';
        }),
        CrisisChoice('Enjoy the buffet, bet small', (g, rng) {
          final small = spend(g, rng, 200, 600);
          return 'You play penny slots for ${usd(small)} and eat like a king on '
              'their dime.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'bet_bookie_account',
      emoji: '☎️',
      title: 'A local bookie offers you a line of credit',
      body: 'No app, no limits, "pay me Tuesday." It\'s frictionless — which is '
          'exactly the problem when the bets don\'t land.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Bet big on credit', (g, rng) {
          final stake = rnd(rng, 2000, 5000);
          final r = wager(g, rng, stake, 0.45, 2.0);
          if (r <= 0) {
            loanShark(g, stake);
            return 'You lost on the cuff — now you owe the bookie ${usd(stake)} '
                'at very persuasive interest.';
          }
          return 'It hit and you settle up clean — ${usd(r)} ahead, this time.';
        }),
        CrisisChoice('Keep it cash-only', (g, rng) =>
            'You refuse the credit. If you can\'t pay up front, you don\'t bet.'),
      ],
    ),
    CrisisEvent(
      id: 'bet_charity_casino',
      emoji: '🎗️',
      title: 'A charity casino night',
      body: 'A black-tie fundraiser with real tables. It\'s for a good cause — '
          'but the chips cost real money and the open bar lowers your guard.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Buy a stack and play hard', (g, rng) {
          final r = wager(g, rng, rnd(rng, 800, 2000), 0.45, 2.0);
          final gave = r < 0 ? -r : 0;
          return r > 0
              ? 'You run hot at the blackjack table — up ${usd(r)}, and the '
                  'charity still got your entry fee.'
              : 'The house wins, the charity wins, you... donated ${usd(gave)} '
                  'the hard way.';
        }),
        CrisisChoice('Donate directly, skip the tables', (g, rng) {
          final gift = spend(g, rng, 150, 500);
          return 'You write a clean ${usd(gift)} check and skip the felt.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'bet_point_spread_homer',
      emoji: '🏟️',
      title: 'You can\'t resist betting your home team',
      body: 'They\'re seven-point underdogs and your heart says they cover. '
          'Your heart is, statistically, a terrible handicapper.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Big bet on the home boys', (g, rng) {
          final r = wager(g, rng, rnd(rng, 1000, 3000), 0.47, 1.9);
          return r > 0
              ? 'They cover on a last-second field goal — up ${usd(r)}!'
              : 'Blown out by three touchdowns. ${usd(-r)} and a sad drive '
                  'home.';
        }),
        CrisisChoice('Bet the cold-blooded favorite', (g, rng) {
          final r = wager(g, rng, rnd(rng, 1000, 3000), 0.52, 1.9);
          return r > 0
              ? 'No loyalty, just edges — you cash ${usd(r)}.'
              : 'Even the chalk let you down. Down ${usd(-r)}.';
        }),
        CrisisChoice('Just watch the game', (g, rng) =>
            'You cheer with zero money on the line. Refreshing.'),
      ],
    ),
    CrisisEvent(
      id: 'bet_sportsbook_promo_boost',
      emoji: '🚀',
      title: 'A "profit boost" lands in your app',
      body: 'The book juiced the odds on a longshot just for you. It\'s a real '
          'edge — wrapped around a bet you\'d never otherwise make.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Max-bet the boosted longshot', (g, rng) {
          final r = wager(g, rng, rnd(rng, 500, 1500), 0.3, 4.0);
          return r > 0
              ? 'The boost turns a longshot into ${usd(r)} of real money!'
              : 'Boosted or not, longshots are long. Down ${usd(-r)}.';
        }),
        CrisisChoice('Use it on a small stake', (g, rng) {
          final r = wager(g, rng, rnd(rng, 50, 150), 0.3, 4.0);
          return r > 0
              ? 'A little money, a big multiplier — ${usd(r)} up.'
              : 'The longshot missed, but you only risked ${usd(-r)}.';
        }),
        CrisisChoice('Let it expire', (g, rng) =>
            'You ignore the boost. They only send them because they win.'),
      ],
    ),
    CrisisEvent(
      id: 'bet_live_in_game',
      emoji: '⏱️',
      title: 'Live in-game betting at halftime',
      body: 'Your team\'s down but the live odds are tempting. In-play betting '
          'is designed to keep you tapping all night.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Hammer the comeback line', (g, rng) {
          final r = wager(g, rng, rnd(rng, 800, 2000), 0.4, 2.6);
          return r > 0
              ? 'The second-half comeback is real — ${usd(r)} cashed live!'
              : 'They folded in the third quarter. Down ${usd(-r)}.';
        }),
        CrisisChoice('Close the app at halftime', (g, rng) =>
            'You walk away while you\'re even. The hardest, smartest move.'),
      ],
    ),

    // ── minNetWorth: 150000 ─────────────────────────────────────────────────
    CrisisEvent(
      id: 'bet_high_roller_backing',
      emoji: '💼',
      title: 'A pro gambler wants you to back him',
      body: 'A sharp poker player offers you a cut of his winnings if you stake '
          'his tournament buy-ins. His edge is real; variance is brutal.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Stake him for the series', (g, rng) {
          final r = wager(g, rng, rnd(rng, 8000, 20000), 0.45, 2.4);
          return r > 0
              ? 'He runs deep in two events — your backing returns ${usd(r)}.'
              : 'He busted every event on bad beats. You eat ${usd(-r)}.';
        }),
        CrisisChoice('Pass — too much variance', (g, rng) =>
            'You like him, but staking is a brutal business. You decline.'),
      ],
    ),
    CrisisEvent(
      id: 'bet_private_card_game',
      emoji: '🂡',
      title: 'An invite to a private high-stakes game',
      body: 'A discreet game above a restaurant, deep pockets at the table. The '
          'buy-in is serious and so are the players.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Buy in deep', (g, rng) {
          final r = wager(g, rng, rnd(rng, 10000, 25000), 0.5, 1.9);
          return r > 0
              ? 'You out-played the room and pocket ${usd(r)}.'
              : 'You were the mark and didn\'t know it. Down ${usd(-r)}.';
        }),
        CrisisChoice('Sit for the minimum', (g, rng) {
          final r = wager(g, rng, rnd(rng, 2000, 5000), 0.5, 1.9);
          return r > 0
              ? 'You play tight, leave early, up ${usd(r)}.'
              : 'A short, expensive education — down ${usd(-r)}.';
        }),
        CrisisChoice('Decline the invite', (g, rng) =>
            'You smile and say you\'ve got an early morning.'),
      ],
    ),
    CrisisEvent(
      id: 'bet_crypto_presale_whale',
      emoji: '🐋',
      title: 'A "guaranteed" crypto presale allocation',
      body: 'An insider offers you a whale-sized allocation in a token presale '
          'before it "definitely" lists 10x higher. Presales are a casino with '
          'better graphics.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Take the full allocation', (g, rng) {
          final r = wager(g, rng, rnd(rng, 15000, 40000), 0.3, 4.5);
          return r > 0
              ? 'It lists and you exit liquidity onto someone else — up '
                  '${usd(r)}!'
              : 'The team vanished post-launch. ${usd(-r)} to the void.';
        }),
        CrisisChoice('Take a small slice', (g, rng) {
          final r = wager(g, rng, rnd(rng, 2000, 6000), 0.3, 4.5);
          return r > 0
              ? 'Your modest bag 4x\'s — ${usd(r)} of nice surprise.'
              : 'It cratered, but you only risked ${usd(-r)}.';
        }),
        CrisisChoice('Pass on the presale', (g, rng) =>
            'You\'ve seen this movie. You keep your cash on the sidelines.'),
      ],
    ),
    CrisisEvent(
      id: 'bet_sports_book_arb',
      emoji: '⚖️',
      title: 'A "guaranteed" arbitrage betting service',
      body: 'For a hefty fee, a service promises risk-free profit by betting '
          'both sides across books. Until a book voids a bet and the "sure '
          'thing" goes one-sided.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Pay in and run the arbs', (g, rng) {
          final fee = spend(g, rng, 1000, 3000);
          final r = wager(g, rng, rnd(rng, 8000, 20000), 0.55, 1.7);
          return r > 0
              ? 'Mostly it works — after the ${usd(fee)} fee you net ${usd(r)}.'
              : 'A book voided a leg and limited your account. ${usd(fee)} fee '
                  'plus ${usd(-r)} down. So much for risk-free.';
        }),
        CrisisChoice('Decline the "free money"', (g, rng) =>
            'Free money with a subscription fee. You pass.'),
      ],
    ),

    // ── minNetWorth: 750000 ─────────────────────────────────────────────────
    CrisisEvent(
      id: 'bet_whale_sports_account',
      emoji: '🏛️',
      title: 'A bookmaker rolls out the red carpet',
      body: 'You\'re a "VIP" now — six-figure limits, a personal host, courtside '
          'seats. They only treat losers this well. The bets are enormous.',
      minNetWorth: 750000,
      choices: [
        CrisisChoice('Put a fortune on the big game', (g, rng) {
          final r = wager(g, rng, rnd(rng, 60000, 150000), 0.47, 1.95);
          return r > 0
              ? 'The whale bet lands — you cash a staggering ${usd(r)}.'
              : 'One game, gone. Down ${usd(-r)}. The host sends a fruit basket.';
        }),
        CrisisChoice('Take the perks, bet "small"', (g, rng) {
          final r = wager(g, rng, rnd(rng, 5000, 15000), 0.47, 1.95);
          return r > 0
              ? 'You keep the courtside seats and grind out ${usd(r)}.'
              : 'A modest ${usd(-r)} for a great seat. The VIP host smiles.';
        }),
        CrisisChoice('Cash out the comps, stop betting', (g, rng) =>
            'You enjoy the courtside seats and quietly stop placing bets.'),
      ],
    ),
  ];
}
