import 'crisis_kit.dart';

/// Lifestyle & opportunities expansion pack. Every choice is a real tradeoff.
class LifestyleCrises {
  LifestyleCrises._();

  static final List<CrisisEvent> all = [
    // ---------------------------------------------------------------- base tier
    CrisisEvent(
      id: 'life_dream_trip',
      emoji: '🏝️',
      title: 'The dream trip is finally bookable',
      body: 'That bucket-list two weeks of beaches and street food is on sale '
          'this week only. Memories, or money in the bank?',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Book the dream trip', (g, rng) {
          final c = spend(g, rng, 2500, 6000);
          return 'Worth every cent — ${usd(c)} on memories you can\'t buy back.';
        }),
        CrisisChoice('Staycation instead', (g, rng) {
          final c = spend(g, rng, 100, 400);
          return 'You do the local thing for ${usd(c)} and quietly keep the rest.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'life_festival_pass',
      emoji: '🎪',
      title: 'A weekend music festival',
      body: 'Your favorite headliners, one lineup, one weekend. Tickets, '
          'camping, and "festival prices" add up fast.',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('Buy the VIP pass', (g, rng) {
          final c = spend(g, rng, 600, 1500);
          return 'You front-row it all weekend for ${usd(c)}. No regrets.';
        }),
        CrisisChoice('Single-day general admission', (g, rng) {
          final c = spend(g, rng, 120, 300);
          return 'One day, ${usd(c)}, and you\'re home for your own bed.';
        }),
        CrisisChoice('Stream the sets at home', (g, rng) =>
            'You skip the mud and the markup entirely.'),
      ],
    ),
    CrisisEvent(
      id: 'life_flash_sale',
      emoji: '🛍️',
      title: 'A flash sale you "can\'t miss"',
      body: 'A countdown timer, 70% off, and a cart that somehow filled itself. '
          'Genuine deal or manufactured panic?',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('Fill the cart', (g, rng) {
          final c = spend(g, rng, 150, 600);
          if (rng.nextDouble() < 0.4) {
            return 'Half of it gets returned anyway — ${usd(c)} of impulse.';
          }
          return 'You score genuine deals for ${usd(c)}. Treat earned.';
        }),
        CrisisChoice('Close the tab', (g, rng) =>
            'The timer hits zero. You feel oddly powerful.'),
      ],
    ),
    CrisisEvent(
      id: 'life_tasting_menu',
      emoji: '🍽️',
      title: 'A twelve-course tasting menu',
      body: 'The hottest reservation in town opened up. Foams, tweezered '
          'micro-greens, and a bill to match.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Splurge on the full pairing', (g, rng) {
          final c = spend(g, rng, 300, 800);
          return 'Twelve tiny, transcendent plates for ${usd(c)}. Still hungry.';
        }),
        CrisisChoice('Just drinks at the bar', (g, rng) {
          final c = spend(g, rng, 40, 120);
          return 'You soak in the vibe for ${usd(c)} and grab tacos after.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'life_gym_membership',
      emoji: '🏋️',
      title: 'A shiny gym membership',
      body: 'New-year-new-you energy. The fancy gym has a sauna, classes, and a '
          'twelve-month contract you can\'t easily cancel.',
      choices: [
        CrisisChoice('Sign the year contract', (g, rng) {
          obligation(g, 'Gym membership', rnd(rng, 40, 90), 12);
          if (rng.nextDouble() < 0.5) {
            return 'You actually go three times a week. Money well spent.';
          }
          return 'You go twice in March and pay all year anyway.';
        }),
        CrisisChoice('Bodyweight workouts at home', (g, rng) =>
            'You bookmark a free workout playlist and call it gains.'),
      ],
    ),
    CrisisEvent(
      id: 'life_subscription_box',
      emoji: '📦',
      title: 'A curated subscription box',
      body: 'Monthly surprise goodies, "just $X a month." Delightful at first, '
          'easy to forget you\'re even paying for it.',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('Subscribe — treat yourself', (g, rng) {
          obligation(g, 'Subscription box', rnd(rng, 20, 50), 9);
          return 'A little parcel of joy every month — for as long as you notice.';
        }),
        CrisisChoice('One-time gift box', (g, rng) {
          final c = spend(g, rng, 30, 70);
          return 'You buy a single box for ${usd(c)}, no strings attached.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'life_etsy_shop',
      emoji: '🧶',
      title: 'Turn your hobby into an Etsy shop?',
      body: 'Friends keep saying your handmade stuff could sell. Setting up '
          'means materials, listing fees, and a lot of late nights.',
      choices: [
        CrisisChoice('Stock up and open the shop', (g, rng) {
          final c = spend(g, rng, 300, 900);
          if (rng.nextDouble() < 0.45) {
            final earned = gain(g, rng, 1200, 4000);
            return 'Your store takes off — ${usd(earned)} in orders after '
                '${usd(c)} of supplies.';
          }
          return 'Three sales (two to your mom). ${usd(c)} of yarn in a closet.';
        }),
        CrisisChoice('Keep it a hobby', (g, rng) =>
            'You make things for the love of it, not the listings.'),
      ],
    ),
    CrisisEvent(
      id: 'life_streaming_rig',
      emoji: '🎮',
      title: 'Go live as a streamer?',
      body: 'A decent capture card, mic, and lights could launch a channel. '
          'Most streamers earn nothing — a few earn a lot.',
      choices: [
        CrisisChoice('Buy the rig and go live', (g, rng) {
          final c = spend(g, rng, 800, 2200);
          if (rng.nextDouble() < 0.35) {
            final earned = gain(g, rng, 2000, 6000);
            return 'A clip blows up — subs and donations bring ${usd(earned)} '
                'after ${usd(c)} of gear.';
          }
          return 'Average viewers: 2 (one is your router). ${usd(c)} spent.';
        }),
        CrisisChoice('Stick to playing for fun', (g, rng) =>
            'You keep gaming a hobby, not a hustle.'),
      ],
    ),
    CrisisEvent(
      id: 'life_viral_moment',
      emoji: '📱',
      title: 'You went viral overnight',
      body: 'A random post hit ten million views. Suddenly brands are sliding '
          'into your DMs — but the spotlight is a fishbowl.',
      choices: [
        CrisisChoice('Sign a brand-deal contract', (g, rng) {
          final upfront = gain(g, rng, 1500, 5000);
          obligation(g, 'Sponsored-post quota', rnd(rng, 100, 300), 6);
          return 'You bank ${usd(upfront)} upfront — and owe sponsored posts for '
              'half a year.';
        }),
        CrisisChoice('Enjoy it and stay private', (g, rng) =>
            'You log off, touch grass, and let the moment pass.'),
      ],
    ),
    CrisisEvent(
      id: 'life_photography',
      emoji: '📸',
      title: 'Sell your photography?',
      body: 'People love your shots. A proper camera and a stock-photo account '
          'could turn likes into licensing income — or just gather dust.',
      choices: [
        CrisisChoice('Invest in a real camera', (g, rng) {
          final c = spend(g, rng, 1000, 2500);
          if (rng.nextDouble() < 0.4) {
            final earned = gain(g, rng, 1500, 4500);
            return 'Licensing and a wedding gig bring ${usd(earned)} after '
                '${usd(c)} of glass.';
          }
          return 'Gorgeous photos, zero buyers. ${usd(c)} of gear, lovely hobby.';
        }),
        CrisisChoice('Phone camera is fine', (g, rng) =>
            'You keep shooting for the \'gram, not the invoice.'),
      ],
    ),
    CrisisEvent(
      id: 'life_no_spend',
      emoji: '🚫',
      title: 'A "no-spend month" challenge',
      body: 'A friend dares you to buy nothing but essentials for thirty days. '
          'Great for the wallet — if your willpower holds.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Take the challenge', (g, rng) {
          if (rng.nextDouble() < 0.6) {
            final saved = gain(g, rng, 400, 1200);
            return 'You white-knuckle it and stash ${usd(saved)} you\'d have '
                'blown.';
          }
          final c = spend(g, rng, 200, 700);
          return 'You crack on day eleven and "reward" yourself ${usd(c)} worth.';
        }),
        CrisisChoice('Decline — life\'s short', (g, rng) {
          final c = spend(g, rng, 50, 250);
          return 'You spend a normal ${usd(c)} and feel no shame.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'life_gadget',
      emoji: '📱',
      title: 'The new flagship phone drops',
      body: 'Your current phone works fine. The new one has a slightly better '
          'camera and a price tag that does not.',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('Pre-order it day one', (g, rng) {
          final c = spend(g, rng, 900, 1600);
          return 'Shiny new glass rectangle for ${usd(c)}. The old one still '
              'worked.';
        }),
        CrisisChoice('Keep your current phone', (g, rng) =>
            'You slap a fresh case on the old one and move on.'),
      ],
    ),
    CrisisEvent(
      id: 'life_wedding_season',
      emoji: '💒',
      title: 'Wedding-guest season',
      body: 'Four weddings, two destinations, and a registry that wants a '
          'KitchenAid. Showing up isn\'t free.',
      choices: [
        CrisisChoice('Attend them all, gifts and travel', (g, rng) {
          final c = spend(g, rng, 1500, 4000);
          return 'Open bars, awkward dances, and ${usd(c)} lighter. Worth it.';
        }),
        CrisisChoice('Pick two, send regrets to the rest', (g, rng) {
          final c = spend(g, rng, 400, 1000);
          return 'You go to the close ones for ${usd(c)} and mail cards to the '
              'rest.';
        }),
      ],
    ),

    // ------------------------------------------------------ minNetWorth: 30,000
    CrisisEvent(
      id: 'life_sneaker_drop',
      emoji: '👟',
      title: 'A hyped sneaker drop',
      body: 'A limited collab everyone wants. Resale prices are wild — if you '
          'can flip them before the hype fades.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Cop a pair to flip', (g, rng) {
          final r = wager(g, rng, rnd(rng, 300, 800), 0.5, 2.2);
          if (r > 0) return 'You flip them for a tidy ${usd(r)} profit. Deadstock '
              'gold.';
          return 'The hype died on arrival — you eat ${usd(-r)}. Nice shoes, '
              'though.';
        }),
        CrisisChoice('Buy one pair to actually wear', (g, rng) {
          final c = spend(g, rng, 180, 350);
          return 'You wear them, scuff them, love them. ${usd(c)} well spent.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'life_art_auction',
      emoji: '🖼️',
      title: 'An up-and-coming artist\'s first show',
      body: 'A gallery is selling early work by a painter the critics like. '
          'It could be a smart buy — or just a nice wall decoration.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Buy a piece as an investment', (g, rng) {
          final r = wager(g, rng, scaled(g, 0.01, 1500), 0.4, 2.5);
          if (r > 0) return 'The artist breaks out — your canvas is now worth '
              '${usd(r)} more.';
          return 'Their career fizzled; you\'re ${usd(-r)} down but have great '
              'taste.';
        }),
        CrisisChoice('Buy a print you just like', (g, rng) {
          final c = spend(g, rng, 150, 500);
          return 'A ${usd(c)} print that makes you happy beats a speculation.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'life_wine_cellar',
      emoji: '🍷',
      title: 'A case of investment-grade wine',
      body: 'A sommelier swears this vintage will appreciate. You could lay it '
          'down for years — or just, you know, drink it.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Cellar it as an investment', (g, rng) {
          final r = wager(g, rng, scaled(g, 0.008, 1200), 0.45, 2.0);
          if (r > 0) return 'The vintage gets rave reviews — up ${usd(r)} at '
              'auction.';
          return 'A corked case and a soft market cost you ${usd(-r)}.';
        }),
        CrisisChoice('Buy a nice bottle and drink it', (g, rng) {
          final c = spend(g, rng, 60, 200);
          return 'You uncork ${usd(c)} of joy tonight. No regrets, no resale.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'life_move_cheaper',
      emoji: '📦',
      title: 'Move to a cheaper city?',
      body: 'Remote work means you could decamp somewhere with half the rent. '
          'The move costs real money up front, but the savings keep coming.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Pack up and relocate', (g, rng) {
          final c = spend(g, rng, 2500, 6000);
          final saved = gain(g, rng, 3000, 7200); // a year of lower rent, realized
          return 'Moving runs ${usd(c)}, but a year of half-price rent nets you '
              'back ${usd(saved)}.';
        }),
        CrisisChoice('Stay put where your people are', (g, rng) =>
            'You decide your network is worth the premium.'),
      ],
    ),
    CrisisEvent(
      id: 'life_country_club',
      emoji: '⛳',
      title: 'A country-club invitation',
      body: 'A connection offers to sponsor your membership. The golf is fine; '
          'the networking is the real product. Dues are not cheap.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Join for the connections', (g, rng) {
          obligation(g, 'Club dues', rnd(rng, 200, 500), 8);
          if (rng.nextDouble() < 0.5) {
            final deal = gain(g, rng, 2000, 6000);
            return 'A back-nine handshake turns into ${usd(deal)} of business.';
          }
          return 'Great cheese plates, no leads. The dues keep coming.';
        }),
        CrisisChoice('Politely decline', (g, rng) =>
            'You keep your weekends and your dues.'),
      ],
    ),
    CrisisEvent(
      id: 'life_timeshare',
      emoji: '🏖️',
      title: 'A "free" weekend and a timeshare pitch',
      body: 'A free resort stay — you just have to sit through a ninety-minute '
          'presentation. The salesperson is very, very good.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Sign — they wore you down', (g, rng) {
          final down = spend(g, rng, 1000, 3000);
          obligation(g, 'Timeshare maintenance fees', rnd(rng, 80, 200), 12);
          return 'You\'re locked in: ${usd(down)} down and forever maintenance '
              'fees.';
        }),
        CrisisChoice('Take the free stay, walk away', (g, rng) {
          if (rng.nextDouble() < 0.3) {
            final c = spend(g, rng, 100, 300);
            return 'They guilt you into ${usd(c)} of "resort fees," but you '
                'escape.';
          }
          return 'You smile, say no eleven times, and enjoy the free weekend.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'life_brand_deal',
      emoji: '🤝',
      title: 'A real influencer brand deal',
      body: 'A mid-tier brand offers a six-month ambassador contract. Steady '
          'money — but you owe them content and your feed becomes an ad.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Sign the ambassador deal', (g, rng) {
          final upfront = gain(g, rng, 3000, 8000);
          obligation(g, 'Content deliverables', rnd(rng, 150, 400), 6);
          return 'A ${usd(upfront)} signing check — and a content quota hanging '
              'over you.';
        }),
        CrisisChoice('Hold out for a better fit', (g, rng) =>
            'You pass; your feed stays yours for now.'),
      ],
    ),

    // ----------------------------------------------------- minNetWorth: 150,000
    CrisisEvent(
      id: 'life_luxury_watch',
      emoji: '⌚',
      title: 'A luxury watch on the wrist',
      body: 'A steel sports watch with a years-long waitlist just became '
          'available. A status piece — and maybe one that holds value.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Buy it as a flex and a bet', (g, rng) {
          final r = wager(g, rng, scaled(g, 0.03, 8000), 0.45, 1.8);
          if (r > 0) return 'The waitlist hype holds — it appreciates ${usd(r)}. '
              'Wear it well.';
          return 'The bubble cooled and it depreciates ${usd(-r)}. Still ticks.';
        }),
        CrisisChoice('A solid mechanical for a fraction', (g, rng) {
          final c = spend(g, rng, 1500, 4000);
          return 'A ${usd(c)} watch that tells time beautifully. Less flex, less '
              'froth.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'life_first_class',
      emoji: '🛫',
      title: 'Upgrade to first class?',
      body: 'A long-haul flight, and the lie-flat suite is "only" a few thousand '
          'more. Champagne and sleep, or the back of the plane and savings.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Turn left at the door', (g, rng) {
          final c = spendScaled(g, 0.02, 4000);
          return 'Caviar, a flat bed, and ${usd(c)} of bragging rights.';
        }),
        CrisisChoice('Premium economy is plenty', (g, rng) {
          final c = spend(g, rng, 400, 1000);
          return 'A ${usd(c)} upgrade gets you legroom without the splurge.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'life_supercar',
      emoji: '🏎️',
      title: 'A weekend supercar rental',
      body: 'A track day and a screaming V8 for the weekend. Pure adrenaline — '
          'and a deposit that could buy a used sedan.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Rent the dream and floor it', (g, rng) {
          final c = spendScaled(g, 0.015, 3000);
          if (rng.nextDouble() < 0.2) {
            final scratch = spend(g, rng, 1500, 4000);
            return 'A curbed wheel adds ${usd(scratch)} to the ${usd(c)} rental. '
                'Still grinning.';
          }
          return 'The best weekend in ages for ${usd(c)}. Ears still ringing.';
        }),
        CrisisChoice('A track-day experience instead', (g, rng) {
          final c = spend(g, rng, 500, 1200);
          return 'You get your laps in for ${usd(c)} with an instructor riding '
              'shotgun.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'life_charity_gala',
      emoji: '🎩',
      title: 'A black-tie charity gala',
      body: 'A seat at the right table buys goodwill, a tax write-off, and a '
          'room full of useful people. The ticket is steep.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Buy a table and be seen', (g, rng) {
          final c = spendScaled(g, 0.02, 5000);
          if (rng.nextDouble() < 0.5) {
            final deal = gain(g, rng, 4000, 12000);
            return 'You donate ${usd(c)} and a tablemate sends ${usd(deal)} your '
                'way.';
          }
          return 'You give ${usd(c)}, eat the rubber chicken, and feel good.';
        }),
        CrisisChoice('Quietly write a smaller check', (g, rng) {
          final c = spend(g, rng, 500, 2000);
          return 'You donate ${usd(c)} anonymously and skip the bow tie.';
        }),
      ],
    ),

    // ----------------------------------------------------- minNetWorth: 750,000
    CrisisEvent(
      id: 'life_yacht_week',
      emoji: '🛥️',
      title: 'A chartered yacht week',
      body: 'A crewed yacht through turquoise islands, with a chef and a '
          'tender. The ultimate flex — at the ultimate price.',
      minNetWorth: 750000,
      choices: [
        CrisisChoice('Charter the yacht', (g, rng) {
          final c = spendScaled(g, 0.025, 40000);
          return 'A week of sun-drenched perfection for ${usd(c)}. Anchors '
              'aweigh.';
        }),
        CrisisChoice('A luxury villa instead', (g, rng) {
          final c = spendScaled(g, 0.01, 12000);
          return 'You rent a stunning villa for ${usd(c)} — same view, no '
              'seasickness.';
        }),
        CrisisChoice('Stay home this season', (g, rng) =>
            'You let the Riviera wait another year.'),
      ],
    ),
  ];
}
