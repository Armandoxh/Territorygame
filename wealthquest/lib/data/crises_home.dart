import 'crisis_kit.dart';

/// Home, auto & possessions expansion pack. Every choice is a real tradeoff.
class HomeCrises {
  HomeCrises._();

  static final List<CrisisEvent> all = [
    // ── Base tier (no minNetWorth) ──────────────────────────────────────
    CrisisEvent(
      id: 'home_furnace_dies',
      emoji: '🔥',
      title: 'The furnace gives up in January',
      body: 'It\'s 12°F outside and the house is dropping a degree an hour. '
          'The unit is 18 years old.',
      minNetWorth: 0,
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Full replacement', (g, rng) {
          final c = spend(g, rng, 4000, 7000);
          return 'New furnace, fully installed, ${usd(c)}. The house is warm '
              'and you\'ll forget this by spring.';
        }),
        CrisisChoice('Patch the old one', (g, rng) {
          final c = spend(g, rng, 200, 600);
          if (rng.nextDouble() < 0.45) {
            final fix = spend(g, rng, 4500, 7500);
            return 'It limps two weeks, then dies for good — ${usd(fix)} for '
                'the replacement you should\'ve bought.';
          }
          return 'A new igniter and a prayer — ${usd(c)} and it roars back to '
              'life. Bought yourself another winter.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'home_water_heater',
      emoji: '🚿',
      title: 'Cold showers all week',
      body: 'The water heater is rumbling like a kettle and there\'s a rusty '
          'puddle underneath it.',
      minNetWorth: 0,
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Call a plumber', (g, rng) {
          final c = spend(g, rng, 900, 1800);
          return 'New tank, installed and hauled away — ${usd(c)}. Hot showers '
              'restored.';
        }),
        CrisisChoice('Swap it yourself', (g, rng) {
          final c = spend(g, rng, 400, 700);
          if (rng.nextDouble() < 0.35) {
            final fix = spend(g, rng, 1200, 2600);
            return 'You cross-thread a gas fitting and the smell scares you — '
                '${usd(fix)} for a pro to redo it all.';
          }
          return 'Tank, fittings, an afternoon of cursing — ${usd(c)} total. '
              'It holds. You\'re basically a plumber now.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'home_check_engine',
      emoji: '🚗',
      title: 'The check-engine light is on',
      body: 'Solid, not blinking. The car drives fine. The internet says it '
          'could be a $20 sensor or a $2,000 catalytic converter.',
      minNetWorth: 0,
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Get it diagnosed', (g, rng) {
          final c = spend(g, rng, 400, 1600);
          return 'Diagnostic plus the actual fix: ${usd(c)}. Light\'s off, '
              'conscience clear.';
        }),
        CrisisChoice('Ignore it and drive', (g, rng) {
          if (rng.nextDouble() < 0.5) {
            final fix = spend(g, rng, 1800, 3500);
            return 'A month later it strands you on the highway — ${usd(fix)} '
                'and a tow. The light was not bluffing.';
          }
          return 'It was a loose gas cap. The light eventually clears itself. '
              'Free, and smug about it.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'home_flat_tires',
      emoji: '🛞',
      title: 'Two bald tires and a slow leak',
      body: 'The mechanic shows you the tread — basically slicks. He suggests '
          'all four while you\'re here.',
      minNetWorth: 0,
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('All four, good rubber', (g, rng) {
          final c = spend(g, rng, 700, 1100);
          return 'A full set of name-brand tires, ${usd(c)}. Grippy and quiet.';
        }),
        CrisisChoice('Two cheapies, plug the leak', (g, rng) {
          final c = spend(g, rng, 200, 380);
          if (rng.nextDouble() < 0.3) {
            final fix = spend(g, rng, 600, 1000);
            return 'A budget tire blows on the freeway — ${usd(fix)} for the '
                'pair you skipped, plus a scare.';
          }
          return 'Two tires and a plug for ${usd(c)}. Not pretty, but rolling.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'home_used_car_deal',
      emoji: '🔑',
      title: 'A suspiciously cheap used car',
      body: 'A clean-looking sedan, half of book value, "selling fast, cash '
          'only." Could be a steal. Could be a flood car.',
      minNetWorth: 0,
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Roll the dice, buy it', (g, rng) {
          final r = wager(g, rng, 4000, 0.55, 1.9);
          if (r > 0) {
            return 'It runs like a champ and you flip it for a tidy '
                '${usd(r)} gain. You\'ve still got it.';
          }
          return 'Transmission grenades in week two — you eat ${usd(-r)}. '
              'Should\'ve read the title.';
        }),
        CrisisChoice('Pay for an inspection first', (g, rng) {
          final c = spend(g, rng, 120, 250);
          return 'The pre-buy inspection finds frame damage — ${usd(c)} '
              'well spent to walk away clean.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'home_appliance_dead',
      emoji: '🧺',
      title: 'The washer floods the laundry room',
      body: 'Mid-cycle, water everywhere. The machine is nine years old and '
          'making a noise like a dying robot.',
      minNetWorth: 0,
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Replace it', (g, rng) {
          final c = spend(g, rng, 600, 1100);
          return 'A shiny new washer for ${usd(c)}. No more laundromat trips.';
        }),
        CrisisChoice('Repair the old one', (g, rng) {
          final c = spend(g, rng, 150, 350);
          if (rng.nextDouble() < 0.4) {
            final fix = spend(g, rng, 650, 1150);
            return 'The repair holds for a month, then the drum seizes — '
                '${usd(fix)} for the replacement anyway.';
          }
          return 'New pump and a hose clamp, ${usd(c)}. It spins like new.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'home_extended_warranty',
      emoji: '📄',
      title: 'The extended-warranty hard sell',
      body: 'At the dealer counter they\'re pushing a bumper-to-bumper plan. '
          'Peace of mind, or a subscription trap on a car that\'ll be fine?',
      minNetWorth: 0,
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Buy the coverage', (g, rng) {
          obligation(g, 'Extended warranty', 95, 36);
          return 'You sign up at \$95/mo for three years. If the car holds '
              'together, you funded their boat.';
        }),
        CrisisChoice('Skip it, self-insure', (g, rng) {
          if (rng.nextDouble() < 0.3) {
            final fix = spend(g, rng, 1500, 3500);
            return 'Murphy\'s law: a major repair hits, ${usd(fix)} out of '
                'pocket. The salesman would\'ve smirked.';
          }
          return 'You pass. The car runs trouble-free and you keep the '
              'premiums in your own pocket.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'home_yard_sale',
      emoji: '🏷️',
      title: 'The garage is a disaster',
      body: 'A decade of clutter. You could haul it to the dump, or spend a '
          'weekend turning it into cash.',
      minNetWorth: 0,
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Run a yard sale', (g, rng) {
          final earned = gain(g, rng, 150, 700);
          return 'A weekend of haggling nets ${usd(earned)} and a clear '
              'garage. One man\'s junk.';
        }),
        CrisisChoice('List it all online', (g, rng) {
          if (rng.nextDouble() < 0.6) {
            final earned = gain(g, rng, 400, 1200);
            return 'Turns out your old camera lens was collectible — '
                '${usd(earned)} from the listings.';
          }
          final c = spend(g, rng, 40, 120);
          return 'Mostly tire-kickers and no-shows. You pay ${usd(c)} to '
              'finally just dump it.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'home_burst_pipe',
      emoji: '💧',
      title: 'A pipe bursts behind the wall',
      body: 'You hear dripping inside the drywall and the ceiling is bowing. '
          'Every minute it spreads.',
      minNetWorth: 0,
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Emergency plumber, now', (g, rng) {
          final c = spend(g, rng, 800, 2200);
          return 'After-hours rates sting, but the leak\'s stopped and the '
              'wall patched — ${usd(c)}.';
        }),
        CrisisChoice('Shut the main, DIY the patch', (g, rng) {
          final c = spend(g, rng, 80, 250);
          if (rng.nextDouble() < 0.45) {
            final fix = spend(g, rng, 1500, 4000);
            return 'Your patch leaks slowly for weeks — mold sets in and it\'s '
                '${usd(fix)} to remediate. Ugh.';
          }
          return 'A push-fit coupling and some drywall, ${usd(c)}. Crisis '
              'averted with a YouTube degree.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'home_pest_infestation',
      emoji: '🐜',
      title: 'Something is living in the walls',
      body: 'Scratching at night, droppings in the pantry. Could be mice. '
          'Could be a colony.',
      minNetWorth: 0,
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Hire an exterminator', (g, rng) {
          final c = spend(g, rng, 300, 900);
          return 'Traps, sealing, a follow-up visit — ${usd(c)} and the house '
              'is yours again.';
        }),
        CrisisChoice('Traps from the hardware store', (g, rng) {
          final c = spend(g, rng, 30, 90);
          if (rng.nextDouble() < 0.45) {
            final fix = spend(g, rng, 700, 1800);
            return 'They breed faster than you trap them — ${usd(fix)} for the '
                'pros after they chew the wiring.';
          }
          return 'A dozen snap-traps and steel wool, ${usd(c)}. Silent nights '
              'again.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'home_brakes_grinding',
      emoji: '🛑',
      title: 'The brakes are grinding metal',
      body: 'That screech became a grind. You can feel it in the pedal. This '
          'is not a maybe.',
      minNetWorth: 0,
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Pads and rotors, both axles', (g, rng) {
          final c = spend(g, rng, 600, 1100);
          return 'Full brake job, ${usd(c)}. You stop on a dime and sleep '
              'better.';
        }),
        CrisisChoice('Just the front pads, cheapest', (g, rng) {
          final c = spend(g, rng, 150, 300);
          if (rng.nextDouble() < 0.4) {
            final fix = spend(g, rng, 500, 950);
            return 'Worn rotors chew the new pads in a month — ${usd(fix)} to '
                'do it right the second time.';
          }
          return 'New front pads for ${usd(c)}. The grind\'s gone. Good '
              'enough.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'home_neighbor_tree',
      emoji: '🌳',
      title: 'The neighbor\'s tree took out your fence',
      body: 'A storm dropped their old oak across your back fence. They\'re '
          'apologetic but vague about paying.',
      minNetWorth: 0,
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Just fix it, keep the peace', (g, rng) {
          final c = spend(g, rng, 800, 2000);
          return 'New fence section and tree haul-off, ${usd(c)}. The '
              'neighbor brings you cookies. Worth it.';
        }),
        CrisisChoice('Demand they pay', (g, rng) {
          if (rng.nextDouble() < 0.5) {
            final won = gain(g, rng, 600, 1500);
            return 'Their insurance covers it — you net ${usd(won)} and a '
                'frosty wave each morning.';
          }
          final c = spend(g, rng, 900, 2100);
          return 'They lawyer up and it\'s "an act of God." You pay ${usd(c)} '
              'and the relationship.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'home_storage_auction',
      emoji: '🔐',
      title: 'A storage-unit auction',
      body: 'The locker is sealed; you get sixty seconds to peek from the '
          'door. Boxes, a covered shape, who knows. Cash bids only.',
      minNetWorth: 0,
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Bid on it', (g, rng) {
          final r = wager(g, rng, 800, 0.45, 2.6);
          if (r > 0) {
            return 'Under the tarp: a vintage motorcycle. You flip the lot for '
                'a ${usd(r)} score. Reality-TV money.';
          }
          return 'Forty boxes of someone\'s tax returns and broken lamps. '
              'You\'re out ${usd(-r)} and a dump run.';
        }),
        CrisisChoice('Watch and learn', (g, rng) =>
            'You pocket your cash and let the regulars overpay. Free '
            'entertainment.'),
      ],
    ),
    // ── minNetWorth: 30000 tier ─────────────────────────────────────────
    CrisisEvent(
      id: 'home_roof_leak',
      emoji: '🏠',
      title: 'A stain spreading across the ceiling',
      body: 'The roof is two decades old and the last storm found a way in. '
          'The stain grows after every rain.',
      minNetWorth: 30000,
      eligible: (g) => g.properties.isNotEmpty,
      choices: [
        CrisisChoice('Full roof replacement', (g, rng) {
          final c = spendScaled(g, 0.04, 8000);
          return 'A whole new roof, ${usd(c)}. Twenty-five-year warranty and '
              'no more buckets.';
        }),
        CrisisChoice('Patch the leak only', (g, rng) {
          final c = spend(g, rng, 500, 1500);
          if (rng.nextDouble() < 0.5) {
            final fix = spendScaled(g, 0.045, 9000);
            return 'The patch fails next season and water rots the decking — '
                '${usd(fix)} for the full job you delayed.';
          }
          return 'A targeted repair seals it, ${usd(c)}. Bought a few good '
              'years.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'home_transmission',
      emoji: '⚙️',
      title: 'The transmission is slipping',
      body: 'The car hesitates, then lurches into gear. The shop quotes a '
          'rebuild — more than the car may be worth.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Rebuild the transmission', (g, rng) {
          final c = spend(g, rng, 2800, 4500);
          return 'A rebuilt transmission, ${usd(c)}. The car drives like new '
              'and you keep it three more years.';
        }),
        CrisisChoice('Used transmission from a junkyard', (g, rng) {
          final c = spend(g, rng, 1200, 2200);
          if (rng.nextDouble() < 0.4) {
            final fix = spend(g, rng, 2800, 4500);
            return 'The salvage unit was no better — ${usd(fix)} for a proper '
                'rebuild after all. False economy.';
          }
          return 'A low-mileage salvage transmission, installed for ${usd(c)}. '
              'Rolled the dice and won.';
        }),
        CrisisChoice('Trade it in as-is', (g, rng) {
          final got = gain(g, rng, 300, 1200);
          loanShark(g, rnd(rng, 6000, 12000));
          return 'You dump it for ${usd(got)} and finance a replacement — '
              'new payments, but no more limping to work.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'home_ac_dies',
      emoji: '❄️',
      title: 'The AC quits in a heat wave',
      body: 'Three days of 100°F and the compressor just clunked and went '
          'silent. The house is an oven.',
      minNetWorth: 30000,
      eligible: (g) => g.properties.isNotEmpty,
      choices: [
        CrisisChoice('New central AC unit', (g, rng) {
          final c = spendScaled(g, 0.035, 5500);
          return 'A fresh high-efficiency system, ${usd(c)}. Cold air and a '
              'lower power bill.';
        }),
        CrisisChoice('Recharge and patch', (g, rng) {
          final c = spend(g, rng, 300, 800);
          if (rng.nextDouble() < 0.45) {
            final fix = spendScaled(g, 0.04, 6000);
            return 'The leak comes back in weeks — ${usd(fix)} for the '
                'replacement you couldn\'t avoid.';
          }
          return 'A coil cleaning and a refrigerant top-up, ${usd(c)}. It '
              'limps through summer.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'home_solar_panels',
      emoji: '☀️',
      title: 'A solar sales rep at your door',
      body: 'Panels would slash your power bill for decades — but the install '
          'is a real chunk of change up front.',
      minNetWorth: 30000,
      eligible: (g) => g.properties.isNotEmpty,
      choices: [
        CrisisChoice('Buy the system outright', (g, rng) {
          final c = spendScaled(g, 0.06, 14000);
          return 'A full rooftop array, ${usd(c)} up front. Your power bill '
              'all but vanishes — it pays for itself in a decade.';
        }),
        CrisisChoice('Finance it monthly', (g, rng) {
          obligation(g, 'Solar loan', 160, 120);
          return 'Zero down, \$160/mo for ten years. The panels save you '
              'roughly that — a wash you\'re betting will tilt your way.';
        }),
        CrisisChoice('Pass for now', (g, rng) =>
            'You keep your cash and your fossil-fueled bill. The rep leaves '
            'a brochure you\'ll never read.'),
      ],
    ),
    CrisisEvent(
      id: 'home_contractor_deposit',
      emoji: '🔨',
      title: 'A kitchen reno and a big deposit',
      body: 'The contractor wants 50% up front to "lock in materials." His '
          'reviews are great. His price is suspiciously low.',
      minNetWorth: 30000,
      eligible: (g) => g.properties.isNotEmpty,
      choices: [
        CrisisChoice('Pay the big deposit', (g, rng) {
          final r = wager(g, rng, 9000, 0.6, 1.7);
          if (r > 0) {
            return 'He delivers a gorgeous kitchen ahead of schedule — the '
                'gamble paid, worth ${usd(r)} in value and zero headaches.';
          }
          return 'He vanishes with the deposit. You\'re out ${usd(-r)} and '
              'half a kitchen. Classic.';
        }),
        CrisisChoice('Insist on milestone payments', (g, rng) {
          final c = spend(g, rng, 8000, 16000);
          return 'You pay in stages tied to inspections — ${usd(c)} total, no '
              'drama. A little more, a lot less risk.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'home_car_totaled',
      emoji: '💥',
      title: 'Your car is totaled',
      body: 'Not your fault — someone ran a light. Nobody hurt, but the car\'s '
          'a write-off. The insurance check won\'t cover a full replacement.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Take the payout, buy reliable', (g, rng) {
          final payout = gain(g, rng, 6000, 11000);
          final c = spend(g, rng, 10000, 16000);
          return 'Insurance pays ${usd(payout)}; you top it up for a solid '
              'used car at ${usd(c)}. Boring, dependable, done.';
        }),
        CrisisChoice('Pocket the check, buy a beater', (g, rng) {
          final payout = gain(g, rng, 6000, 11000);
          final c = spend(g, rng, 2000, 4000);
          if (rng.nextDouble() < 0.4) {
            final fix = spend(g, rng, 1500, 3500);
            return 'You keep most of the ${usd(payout)} payout, but the '
                '${usd(c)} beater needs ${usd(fix)} of work within months.';
          }
          return 'You bank most of the ${usd(payout)} and grab a ${usd(c)} '
              'runabout that actually runs. Frugal win.';
        }),
      ],
    ),
    // ── minNetWorth: 150000 tier ────────────────────────────────────────
    CrisisEvent(
      id: 'home_foundation_crack',
      emoji: '🧱',
      title: 'A crack in the foundation',
      body: 'A diagonal crack has opened in the basement wall and a door no '
          'longer closes square. The engineer\'s face was not reassuring.',
      minNetWorth: 150000,
      eligible: (g) => g.properties.isNotEmpty,
      choices: [
        CrisisChoice('Full underpinning fix', (g, rng) {
          final c = spendScaled(g, 0.06, 15000);
          return 'Piers, drainage, the works — ${usd(c)}. The house is stable '
              'for a generation and the inspection clears.';
        }),
        CrisisChoice('Cheap epoxy injection', (g, rng) {
          final c = spend(g, rng, 1500, 4000);
          if (rng.nextDouble() < 0.55) {
            final fix = spendScaled(g, 0.07, 18000);
            return 'The crack keeps moving — ${usd(fix)} for the real fix, '
                'plus the ${usd(c)} you wasted papering over it.';
          }
          return 'It was minor settling after all — ${usd(c)} of epoxy and '
              'monitoring. You dodged a big one.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'home_luxury_recall',
      emoji: '🚙',
      title: 'A recall on your luxury car',
      body: 'A safety recall on a component the manufacturer "may" cover. The '
          'loaner situation and the wait are the real cost.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Dealer service, white-glove', (g, rng) {
          final c = spend(g, rng, 0, 800);
          return 'The recall work is covered; you pay ${usd(c)} for the '
              'incidentals and a detail. Painless.';
        }),
        CrisisChoice('Ignore the recall notice', (g, rng) {
          if (rng.nextDouble() < 0.35) {
            final fix = spendScaled(g, 0.05, 9000);
            return 'The faulty part fails out of warranty — ${usd(fix)} you '
                'could have avoided by opening the mail.';
          }
          return 'Nothing breaks and the recall window quietly closes. You '
              'win the lazy lottery.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'home_pool_pump',
      emoji: '🏊',
      title: 'The pool turns green',
      body: 'The pump seized and the water went swamp overnight. The pool guy '
          'and the equipment shop both want their cut.',
      minNetWorth: 150000,
      eligible: (g) => g.properties.isNotEmpty,
      choices: [
        CrisisChoice('New pump and full service', (g, rng) {
          final c = spendScaled(g, 0.025, 3500);
          return 'New variable-speed pump and a chemical reset, ${usd(c)}. '
              'Crystal blue by the weekend.';
        }),
        CrisisChoice('Rebuild the pump yourself', (g, rng) {
          final c = spend(g, rng, 200, 600);
          if (rng.nextDouble() < 0.45) {
            final fix = spendScaled(g, 0.03, 4000);
            return 'You burn out the motor for good — ${usd(fix)} for the new '
                'pump and pro service anyway.';
          }
          return 'A seal kit and an impeller, ${usd(c)}. It hums back to life. '
              'YouTube delivers.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'home_art_flip',
      emoji: '🖼️',
      title: 'An estate-sale painting',
      body: 'A grimy landscape at an estate sale. The signature looks like it '
          'might be someone. The dealer in you is twitching.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Buy it and get it appraised', (g, rng) {
          final r = wager(g, rng, 6000, 0.4, 3.2);
          if (r > 0) {
            return 'The appraiser\'s eyebrows shoot up — it\'s the real deal. '
                'You flip it at auction for a ${usd(r)} windfall.';
          }
          return 'A skilled forgery, worth the frame. You\'re out ${usd(-r)} '
              'and a lesson in hubris.';
        }),
        CrisisChoice('Admire and walk away', (g, rng) =>
            'You leave it for the next dreamer and keep your powder dry.'),
      ],
    ),
    // ── minNetWorth: 750000 tier ────────────────────────────────────────
    CrisisEvent(
      id: 'home_estate_reroof',
      emoji: '🏰',
      title: 'The estate needs a new slate roof',
      body: 'The historic slate roof on your property is shedding tiles. '
          'Authentic slate is breathtaking — and breathtakingly expensive.',
      minNetWorth: 750000,
      eligible: (g) => g.properties.isNotEmpty,
      choices: [
        CrisisChoice('Restore it in genuine slate', (g, rng) {
          final c = spendScaled(g, 0.05, 60000);
          return 'Hand-laid slate by specialist roofers, ${usd(c)}. It\'ll '
              'outlive you and the appraisal loves it.';
        }),
        CrisisChoice('Synthetic look-alike', (g, rng) {
          final c = spendScaled(g, 0.03, 35000);
          if (rng.nextDouble() < 0.4) {
            final hit = spendScaled(g, 0.04, 45000);
            return 'The HOA and a buyer\'s inspector both balk at the fake — '
                '${usd(hit)} to redo it in real slate. Penny wise.';
          }
          return 'Composite slate nobody can tell apart, ${usd(c)}. Looks the '
              'part for half the price.';
        }),
      ],
    ),
  ];
}
