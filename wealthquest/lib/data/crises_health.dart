import 'crisis_kit.dart';

/// Health & body expansion pack. Every choice is a real tradeoff (a pro and a con).
class HealthCrises {
  HealthCrises._();

  static final List<CrisisEvent> all = [
    // ── Base tier (no minNetWorth) ──────────────────────────────────────────
    CrisisEvent(
      id: 'health_broken_wrist',
      emoji: '🦴',
      title: 'You snapped your wrist',
      body: 'A nasty fall on the ice. The urgent-care doc says it needs setting '
          '— properly, or it heals crooked.',
      maxNetWorth: 350000,
      choices: [
        CrisisChoice('Surgery and a real cast', (g, rng) {
          final c = spend(g, rng, 2500, 6000);
          unpaidLeave(g, 2, 'Recovering from wrist surgery');
          return 'Set properly for ${usd(c)} — but two months one-handed and '
              'off work.';
        }),
        CrisisChoice('Brace it and tough it out', (g, rng) {
          final c = spend(g, rng, 200, 500);
          if (rng.nextDouble() < 0.45) {
            final more = spend(g, rng, 3000, 7000);
            unpaidLeave(g, 3, 'Re-breaking a badly-healed wrist');
            return 'It healed wrong. Re-broken and re-set for another '
                '${usd(more)}, and three months off.';
          }
          return 'Risky, but it knit fine. ${usd(c)} and a drugstore brace.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'health_root_canal',
      emoji: '🦷',
      title: 'That toothache is a root canal',
      body: 'The dentist found a deep infection. You can do the root canal and '
          'crown now, or just yank the tooth for cheap.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Root canal + crown', (g, rng) {
          final c = spend(g, rng, 1600, 3200);
          return 'You keep the tooth — ${usd(c)} for a root canal and crown.';
        }),
        CrisisChoice('Just pull it', (g, rng) {
          final c = spend(g, rng, 200, 500);
          if (rng.nextDouble() < 0.4) {
            final more = spend(g, rng, 1500, 4000);
            return 'The gap shifts your bite; ${usd(more)} on an implant later. '
                'So much for saving the ${usd(c)}.';
          }
          return 'Gone for ${usd(c)}. You\'ll chew on the other side forever.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'health_glasses',
      emoji: '👓',
      title: 'You can\'t read the menu anymore',
      body: 'The squinting has gotten embarrassing. An eye exam confirms you '
          'need correction.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Nice glasses, done right', (g, rng) {
          final c = spend(g, rng, 250, 600);
          return 'You can see again — ${usd(c)} for frames and good lenses.';
        }),
        CrisisChoice('Cheap online pair', (g, rng) {
          final c = spend(g, rng, 30, 90);
          if (rng.nextDouble() < 0.4) {
            final more = spend(g, rng, 200, 500);
            return 'Wrong prescription and constant headaches; ${usd(more)} to '
                'redo them properly.';
          }
          return 'They actually work great. ${usd(c)} well spent.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'health_back_pain',
      emoji: '🪑',
      title: 'Your back is wrecked from your desk',
      body: 'Years of a terrible chair have caught up with you. A proper '
          'ergonomic setup is pricey; PT is another route.',
      choices: [
        CrisisChoice('Buy a real ergonomic setup', (g, rng) {
          final c = spend(g, rng, 600, 1500);
          return 'Standing desk and a good chair for ${usd(c)} — your spine '
              'thanks you.';
        }),
        CrisisChoice('Course of physical therapy', (g, rng) {
          obligation(g, 'Physical therapy sessions', rnd(rng, 120, 250), 3);
          return 'Three months of PT copays — slower, but it treats the cause.';
        }),
        CrisisChoice('Pop ibuprofen and ignore it', (g, rng) {
          final c = spend(g, rng, 20, 60);
          if (rng.nextDouble() < 0.5) {
            final more = spend(g, rng, 1000, 3000);
            unpaidLeave(g, 1, 'A blown-out back');
            return 'Your back gives out entirely; ${usd(more)} and a month flat '
                'on the floor.';
          }
          return 'It eases up on its own. ${usd(c)} of painkillers.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'health_food_poisoning',
      emoji: '🤢',
      title: 'That gas-station sushi fights back',
      body: 'It is 2 a.m. and you cannot stop being sick. The ER is open and '
          'expensive; your couch is free and miserable.',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('Go to the ER', (g, rng) {
          final c = spend(g, rng, 800, 2500);
          return 'IV fluids and anti-nausea meds — ${usd(c)}, but you stop '
              'dying.';
        }),
        CrisisChoice('Ride it out at home', (g, rng) {
          final c = spend(g, rng, 15, 50);
          if (rng.nextDouble() < 0.35) {
            final more = spend(g, rng, 1500, 4000);
            unpaidLeave(g, 1, 'Hospitalized for dehydration');
            return 'You got dangerously dehydrated; ${usd(more)} hospital bill '
                'and a week off.';
          }
          return 'Worst night of your life, but ${usd(c)} of electrolytes did '
              'it.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'health_concerning_mole',
      emoji: '🔬',
      title: 'A mole that wasn\'t there before',
      body: 'It changed shape over the summer. The dermatologist has a slot '
          'next week — or you could wait and see.',
      choices: [
        CrisisChoice('Get it checked and biopsied', (g, rng) {
          final c = spend(g, rng, 300, 900);
          return 'Benign, thankfully — ${usd(c)} for the biopsy and real peace '
              'of mind.';
        }),
        CrisisChoice('Wait and watch it', (g, rng) {
          if (rng.nextDouble() < 0.3) {
            final c = spend(g, rng, 4000, 9000);
            unpaidLeave(g, 2, 'Treating a caught-late skin cancer');
            return 'It was the bad kind. Caught late: ${usd(c)} and two months '
                'of treatment.';
          }
          return 'Months later it\'s unchanged. You got lucky this time.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'health_gym_membership',
      emoji: '🏋️',
      title: 'New year, new gym membership?',
      body: 'The fancy gym wants a year commitment. You\'ll either get fit — or '
          'fund their lobby fountain.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Sign the annual contract', (g, rng) {
          obligation(g, 'Gym membership', rnd(rng, 40, 90), 12);
          if (rng.nextDouble() < 0.4) {
            return 'You actually go. Strongest and healthiest you\'ve felt in '
                'years.';
          }
          return 'You went in January. The dues keep coming anyway.';
        }),
        CrisisChoice('Just run outside for free', (g, rng) {
          final c = spend(g, rng, 80, 200);
          return 'Decent shoes for ${usd(c)} and the open road. No contract.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'health_therapy',
      emoji: '🛋️',
      title: 'You could really use a therapist',
      body: 'The stress has been crushing lately. Weekly sessions add up, but '
          'so does burning out at work.',
      choices: [
        CrisisChoice('Start weekly therapy', (g, rng) {
          obligation(g, 'Therapy sessions', rnd(rng, 150, 300), 6);
          if (rng.nextDouble() < 0.6) {
            final saved = gain(g, rng, 1000, 3000);
            return 'Half a year of work pays off — clearer head, and you dodge '
                'a costly burnout (${usd(saved)} you\'d have lost).';
          }
          return 'It\'s slow going, but you\'re steadier. Worth the monthly '
              'cost.';
        }),
        CrisisChoice('Push it down and grind', (g, rng) {
          if (rng.nextDouble() < 0.45) {
            final c = spend(g, rng, 1500, 4000);
            unpaidLeave(g, 1, 'A full-blown burnout');
            return 'You hit a wall. ${usd(c)} in fallout and a month away to '
                'recover.';
          }
          return 'You white-knuckle through it. For now.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'health_clinical_trial',
      emoji: '🧪',
      title: 'A paid clinical trial',
      body: 'A research lab will pay you well to test a new medication. Easy '
          'money — with a small chance of side effects.',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('Sign up — easy cash', (g, rng) {
          final pay = gain(g, rng, 1200, 3500);
          if (rng.nextDouble() < 0.25) {
            final c = spend(g, rng, 1500, 4000);
            unpaidLeave(g, 1, 'Recovering from trial side effects');
            return 'You banked ${usd(pay)} but the side effects hit — ${usd(c)} '
                'in care and a month off.';
          }
          return 'Smooth sailing. You pocket ${usd(pay)} for a few blood draws.';
        }),
        CrisisChoice('No thanks, not a guinea pig', (g, rng) =>
            'You keep your veins to yourself.'),
      ],
    ),
    CrisisEvent(
      id: 'health_quit_smoking',
      emoji: '🚭',
      title: 'Time to quit smoking',
      body: 'The cough won\'t quit, so maybe you should. A structured cessation '
          'program costs money up front; cold turkey is free but brutal.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Join a cessation program', (g, rng) {
          final c = spend(g, rng, 300, 800);
          if (rng.nextDouble() < 0.65) {
            final saved = gain(g, rng, 1000, 2500);
            return 'You actually quit! ${usd(c)} up front, and ${usd(saved)} you '
                'won\'t burn on cigarettes.';
          }
          return 'It didn\'t stick this round. ${usd(c)} spent, patch still on.';
        }),
        CrisisChoice('Cold turkey, no help', (g, rng) {
          if (rng.nextDouble() < 0.55) {
            return 'White-knuckle, but you quit for free. Iron will.';
          }
          final c = spend(g, rng, 100, 300);
          return 'You caved by week two. ${usd(c)} on a fresh carton.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'health_insurance_plan',
      emoji: '📋',
      title: 'Open enrollment: pick a plan',
      body: 'Cheap premium with a scary deductible, or a pricey premium that '
          'covers you fully? You can\'t predict next year\'s health.',
      choices: [
        CrisisChoice('Cheap premium, high deductible', (g, rng) {
          obligation(g, 'Health premium (cheap plan)', rnd(rng, 120, 200), 12);
          if (rng.nextDouble() < 0.4) {
            final c = spend(g, rng, 3000, 7000);
            return 'You low premiums all year — then a big bill hits the '
                'deductible: ${usd(c)} out of pocket.';
          }
          return 'A healthy year. The low premium was the right bet.';
        }),
        CrisisChoice('Pricey premium, full coverage', (g, rng) {
          obligation(g, 'Health premium (gold plan)', rnd(rng, 350, 550), 12);
          return 'You pay more monthly, but a surprise bill won\'t wreck you.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'health_marathon',
      emoji: '🏃',
      title: 'You signed up for a marathon',
      body: 'Months of training, a steep entry fee, and a real shot at hurting '
          'yourself. Or you could quietly defer.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Pay the fee and run it', (g, rng) {
          final c = spend(g, rng, 150, 400);
          if (rng.nextDouble() < 0.3) {
            final more = spend(g, rng, 800, 2500);
            unpaidLeave(g, 1, 'Recovering from a running injury');
            return 'You blow out a knee at mile 19. ${usd(c)} entry plus '
                '${usd(more)} in PT and a month off.';
          }
          return 'You finish! ${usd(c)} for a medal and the best high of your '
              'life.';
        }),
        CrisisChoice('Defer to next year', (g, rng) {
          final c = spend(g, rng, 40, 100);
          return 'A ${usd(c)} deferral fee and your knees live to run another '
              'day.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'health_second_opinion',
      emoji: '🩻',
      title: 'A surgeon recommends surgery',
      body: 'It\'s a big, invasive operation. A second opinion costs more and '
          'delays things — but might spare you the knife.',
      choices: [
        CrisisChoice('Get a second opinion first', (g, rng) {
          final c = spend(g, rng, 300, 700);
          if (rng.nextDouble() < 0.5) {
            return 'The second doc says skip surgery — ${usd(c)} just saved you '
                'an operation.';
          }
          final more = spend(g, rng, 2000, 5000);
          unpaidLeave(g, 1, 'Recovering from surgery');
          return 'Both agree you need it. ${usd(c)} for the opinion plus '
              '${usd(more)} for the surgery anyway.';
        }),
        CrisisChoice('Just trust the first surgeon', (g, rng) {
          final c = spend(g, rng, 2000, 5000);
          unpaidLeave(g, 1, 'Recovering from surgery');
          return 'Straight to the OR — ${usd(c)} and a month off. Hope it was '
              'needed.';
        }),
      ],
    ),

    // ── minNetWorth: 30000 tier ─────────────────────────────────────────────
    CrisisEvent(
      id: 'health_lasik',
      emoji: '👁️',
      title: 'LASIK could free you from glasses',
      body: 'Pay once and ditch glasses forever — or keep buying frames and '
          'contacts for years.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Get the laser surgery', (g, rng) {
          final c = spend(g, rng, 3000, 5000);
          if (rng.nextDouble() < 0.85) {
            return '20/20 for ${usd(c)}. You wake up and just... see.';
          }
          final more = spend(g, rng, 800, 2000);
          return 'Mild halos and dry eye; a ${usd(more)} touch-up needed on top '
              'of the ${usd(c)}.';
        }),
        CrisisChoice('Keep buying glasses', (g, rng) {
          obligation(g, 'Contacts & lens refresh', rnd(rng, 30, 70), 12);
          return 'You stick with frames — cheaper monthly, forever.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'health_ongoing_meds',
      emoji: '💊',
      title: 'A new chronic prescription',
      body: 'The doctor puts you on a long-term medication. The brand-name '
          'version works best; the generic is far cheaper but hit or miss.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Brand name, no fuss', (g, rng) {
          obligation(g, 'Brand-name medication', rnd(rng, 120, 280), 12);
          return 'It works perfectly — you just pay a premium every month.';
        }),
        CrisisChoice('Try the generic', (g, rng) {
          obligation(g, 'Generic medication', rnd(rng, 20, 60), 12);
          if (rng.nextDouble() < 0.35) {
            final c = spend(g, rng, 600, 1800);
            return 'The generic doesn\'t agree with you; ${usd(c)} sorting out '
                'side effects before you switch back.';
          }
          return 'The generic works just fine. Big savings each month.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'health_wisdom_teeth',
      emoji: '🦷',
      title: 'Your wisdom teeth have to go',
      body: 'All four are impacted. You can be fully sedated in comfort, or '
          'just local anesthetic to save a bundle.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Full sedation, the works', (g, rng) {
          final c = spend(g, rng, 1500, 3500);
          unpaidLeave(g, 1, 'Recovering from oral surgery');
          return 'You snooze through it for ${usd(c)} and recover for a few '
              'weeks.';
        }),
        CrisisChoice('Local anesthetic only', (g, rng) {
          final c = spend(g, rng, 600, 1400);
          if (rng.nextDouble() < 0.35) {
            final more = spend(g, rng, 400, 1200);
            return 'You get a dry socket. ${usd(c)} plus ${usd(more)} in '
                'follow-up agony.';
          }
          return 'Grim but quick — ${usd(c)} and you felt every crack.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'health_sleep_apnea',
      emoji: '😴',
      title: 'You stop breathing in your sleep',
      body: 'A sleep study confirms apnea. A CPAP machine is a real expense but '
          'transforms your energy; ignoring it strains your heart.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Buy the CPAP setup', (g, rng) {
          final c = spend(g, rng, 800, 2000);
          obligation(g, 'CPAP supplies', rnd(rng, 20, 50), 6);
          return 'You sleep like the dead (the good way) for ${usd(c)} plus '
              'supplies.';
        }),
        CrisisChoice('Just sleep on your side', (g, rng) {
          if (rng.nextDouble() < 0.4) {
            final c = spend(g, rng, 2500, 6000);
            unpaidLeave(g, 1, 'Heart trouble from untreated apnea');
            return 'Years of bad sleep strain your heart; ${usd(c)} and a month '
                'of cardiac follow-up.';
          }
          return 'You manage, sort of. The snoring is somebody else\'s problem.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'health_wellness_retreat',
      emoji: '🧘',
      title: 'A week-long wellness retreat',
      body: 'A pricey reset: yoga, silence, green juice. It could genuinely '
          'recharge you, or just be expensive napping.',
      minNetWorth: 30000,
      maxNetWorth: 400000,
      choices: [
        CrisisChoice('Book the retreat', (g, rng) {
          final c = spend(g, rng, 1500, 4000);
          if (rng.nextDouble() < 0.5) {
            final boost = gain(g, rng, 1000, 3000);
            return 'You come back sharp and refreshed — ${usd(c)} spent, and a '
                '${usd(boost)} idea you finally had time to chase.';
          }
          return 'Lovely, but ${usd(c)} for a tan and some incense. Back to the '
              'grind.';
        }),
        CrisisChoice('Take a quiet staycation', (g, rng) {
          final c = spend(g, rng, 100, 400);
          return 'You unplug at home for ${usd(c)}. Almost as good, way cheaper.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'health_knee_replacement',
      emoji: '🦵',
      title: 'Your knee is bone-on-bone',
      body: 'The orthopedist says it\'s time for a replacement. Do it now and '
          'recover, or keep limping and managing the pain.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Get the replacement', (g, rng) {
          final c = spend(g, rng, 4000, 9000);
          unpaidLeave(g, 2, 'Recovering from knee replacement');
          return 'New knee for ${usd(c)} and two months of rehab — but you walk '
              'pain-free.';
        }),
        CrisisChoice('Manage it with shots and braces', (g, rng) {
          obligation(g, 'Cortisone shots & braces', rnd(rng, 100, 250), 6);
          if (rng.nextDouble() < 0.45) {
            final c = spend(g, rng, 4000, 9000);
            unpaidLeave(g, 2, 'Emergency knee surgery');
            return 'The knee finally fails entirely; ${usd(c)} and the surgery '
                'you delayed, now urgent.';
          }
          return 'You buy time with injections. It holds — for now.';
        }),
      ],
    ),

    // ── minNetWorth: 150000 tier ────────────────────────────────────────────
    CrisisEvent(
      id: 'health_ivf',
      emoji: '🍼',
      title: 'Starting a family needs help',
      body: 'IVF is your path forward. One cycle is a fortune with no guarantee; '
          'a multi-cycle package costs more but improves the odds.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('One cycle and hope', (g, rng) {
          final c = spend(g, rng, 15000, 25000);
          if (rng.nextDouble() < 0.4) {
            return 'It works first try! ${usd(c)} and the best news of your '
                'life.';
          }
          return 'No luck this round. ${usd(c)} gone, and a hard decision ahead.';
        }),
        CrisisChoice('Multi-cycle package', (g, rng) {
          final c = spendScaled(g, 0.18, 35000);
          if (rng.nextDouble() < 0.75) {
            return 'Two cycles in, it works. ${usd(c)} for the package, but '
                'far better odds paid off.';
          }
          return 'Even the package didn\'t take. ${usd(c)} and heartbreak.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'health_executive_physical',
      emoji: '🩺',
      title: 'A full executive health workup',
      body: 'A concierge clinic offers a head-to-toe scan and panel. It catches '
          'things early — and finds expensive things to chase.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Do the full workup', (g, rng) {
          final c = spendScaled(g, 0.02, 3000);
          if (rng.nextDouble() < 0.4) {
            final more = spend(g, rng, 2000, 6000);
            return 'They find an early issue — ${usd(c)} for the scan plus '
                '${usd(more)} to fix it, caught just in time.';
          }
          return 'Clean bill of health for ${usd(c)}. Pricey peace of mind.';
        }),
        CrisisChoice('Stick with the basic checkup', (g, rng) {
          final c = spend(g, rng, 150, 400);
          return 'You do the standard annual for ${usd(c)} and call it good.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'health_elective_cosmetic',
      emoji: '💉',
      title: 'An elective cosmetic procedure',
      body: 'You\'ve thought about it for years. A reputable surgeon is costly; '
          'a discount clinic abroad is tempting and risky.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Top surgeon, do it right', (g, rng) {
          final c = spendScaled(g, 0.05, 8000);
          unpaidLeave(g, 1, 'Recovering from a procedure');
          return 'Flawless work for ${usd(c)} and a month of downtime. You feel '
              'great.';
        }),
        CrisisChoice('Bargain clinic abroad', (g, rng) {
          final c = spend(g, rng, 3000, 6000);
          if (rng.nextDouble() < 0.4) {
            final more = spendScaled(g, 0.06, 10000);
            unpaidLeave(g, 2, 'Fixing a botched procedure');
            return 'It got botched. ${usd(c)} wasted plus ${usd(more)} and two '
                'months to have it corrected back home.';
          }
          return 'Great result for ${usd(c)} and a nice vacation. You gambled '
              'and won.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'health_back_surgery',
      emoji: '🏥',
      title: 'A herniated disc, finally',
      body: 'The sciatica is unbearable. Spinal surgery could end it for good, '
          'or you could try a long, conservative course of treatment.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Have the spinal surgery', (g, rng) {
          final c = spendScaled(g, 0.06, 12000);
          unpaidLeave(g, 3, 'Recovering from spinal surgery');
          return 'A real fix for ${usd(c)} — but three months flat on your back '
              'recovering.';
        }),
        CrisisChoice('Try injections and PT first', (g, rng) {
          obligation(g, 'Injections & physical therapy', rnd(rng, 300, 600), 6);
          if (rng.nextDouble() < 0.5) {
            return 'Slow and steady wins — the disc settles without the knife.';
          }
          final c = spendScaled(g, 0.06, 12000);
          unpaidLeave(g, 3, 'Recovering from spinal surgery');
          return 'No luck; you need the surgery anyway. ${usd(c)} and three '
              'months down, after all that.';
        }),
      ],
    ),

    // ── minNetWorth: 750000 tier ────────────────────────────────────────────
    CrisisEvent(
      id: 'health_longevity_clinic',
      emoji: '🧬',
      title: 'A longevity clinic\'s elite program',
      body: 'For the very wealthy: full genomic sequencing, hormone tuning, the '
          'works. The science is thin but the brochure is gorgeous.',
      minNetWorth: 750000,
      choices: [
        CrisisChoice('Enroll in the program', (g, rng) {
          final c = spendScaled(g, 0.04, 50000);
          if (rng.nextDouble() < 0.45) {
            final more = spend(g, rng, 5000, 20000);
            return 'They flag a real, early problem — ${usd(c)} for the program '
                'plus ${usd(more)} to treat it. Possibly life-saving.';
          }
          return 'You feel marginally more optimized for ${usd(c)}. Mostly '
              'expensive vitamins.';
        }),
        CrisisChoice('Just eat well and sleep', (g, rng) {
          final c = spend(g, rng, 500, 2000);
          return 'A good trainer and real groceries for ${usd(c)}. Boring, '
              'effective.';
        }),
      ],
    ),
  ];
}
