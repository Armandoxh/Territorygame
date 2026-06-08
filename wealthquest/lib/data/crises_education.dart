import 'crisis_kit.dart';

/// EDUCATION & SKILLS expansion pack. Many of these only fire while you're
/// enrolled (`eligible: inSchool`) and lean on the school-length levers
/// (`extendSchool` / `shortenSchool`). Every choice is a real tradeoff.
class EducationCrises {
  EducationCrises._();

  static final List<CrisisEvent> all = [
    CrisisEvent(
      id: 'edu_fail_class',
      emoji: '📕',
      title: 'You failed a core class',
      body: 'One bad semester and a required course slipped through your '
          'fingers. You can\'t graduate without it.',
      eligible: inSchool,
      choices: [
        CrisisChoice('Retake it next term', (g, rng) {
          final fee = spend(g, rng, 400, 900);
          extendSchool(g, 4);
          return 'Re-enrolled for ${usd(fee)} — graduation slips four months.';
        }),
        CrisisChoice('Appeal the grade', (g, rng) {
          final fee = spend(g, rng, 100, 250);
          if (rng.nextDouble() < 0.45) {
            return 'The professor relents — ${usd(fee)} in fees, no delay.';
          }
          extendSchool(g, 4);
          return 'Appeal denied. ${usd(fee)} wasted and you retake it anyway.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'edu_paid_internship',
      emoji: '🧑‍💻',
      title: 'A paid internship — but it overlaps your classes',
      body: 'A real company wants you part-time. Great money and a résumé '
          'line, but you\'ll have to drop a course to fit it in.',
      eligible: inSchool,
      choices: [
        CrisisChoice('Take it, drop a course', (g, rng) {
          final pay = gain(g, rng, 2500, 5000);
          extendSchool(g, 5);
          return 'You bank ${usd(pay)} and learn a ton — but graduation slips '
              'five months.';
        }),
        CrisisChoice('Stay on track', (g, rng) =>
            'You keep your timeline and let the internship go.'),
      ],
    ),
    CrisisEvent(
      id: 'edu_summer_overload',
      emoji: '☀️',
      title: 'Summer classes could speed things up',
      body: 'Pile on a summer term and you\'ll finish your degree early — for '
          'extra tuition and a brutal schedule.',
      eligible: inSchool,
      choices: [
        CrisisChoice('Overload and accelerate', (g, rng) {
          final tuition = rnd(rng, 4000, 8000);
          studentDebt(g, tuition);
          shortenSchool(g, 4);
          return 'Borrowed ${usd(tuition)} more, but you graduate four months '
              'sooner.';
        }),
        CrisisChoice('Take the summer off', (g, rng) {
          final fun = spend(g, rng, 200, 700);
          return 'You actually rest — ${usd(fun)} on a real summer.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'edu_study_abroad',
      emoji: '✈️',
      title: 'A semester abroad opens up',
      body: 'A once-in-a-lifetime exchange in another country. Unforgettable — '
          'and the credits don\'t all transfer cleanly.',
      eligible: inSchool,
      choices: [
        CrisisChoice('Go — see the world', (g, rng) {
          final cost = spend(g, rng, 3000, 7000);
          extendSchool(g, 5);
          return 'The trip of a lifetime for ${usd(cost)}; graduation slips a '
              'semester.';
        }),
        CrisisChoice('Stay home and save', (g, rng) =>
            'You keep your money and your timeline.'),
      ],
    ),
    CrisisEvent(
      id: 'edu_merit_scholarship',
      emoji: '🏅',
      title: 'A merit scholarship — with strings',
      body: 'The department will knock down your loans if you carry a heavier '
          'course load and keep your grades up.',
      eligible: inSchool,
      choices: [
        CrisisChoice('Take the load', (g, rng) {
          studentDebt(g, -rnd(rng, 3000, 6000)); // scholarship pays down loans
          if (rng.nextDouble() < 0.7) {
            shortenSchool(g, 3);
            return 'You crush it — loans cut and you finish a bit early.';
          }
          extendSchool(g, 3);
          return 'The load breaks you; loans are cut but a class gets retaken.';
        }),
        CrisisChoice('Decline, keep it sane', (g, rng) =>
            'You pass on the scholarship to protect your sanity.'),
      ],
    ),
    CrisisEvent(
      id: 'edu_dropout_startup',
      emoji: '🚀',
      title: 'A startup wants you to drop out',
      body: 'A founder you met offers real equity money if you leave school and '
          'join now. The catch: you\'d defer your degree for a year.',
      eligible: inSchool,
      choices: [
        CrisisChoice('Defer and join', (g, rng) {
          final pay = gain(g, rng, 6000, 14000);
          extendSchool(g, 12);
          return 'You pocket ${usd(pay)} — but your degree waits a full year.';
        }),
        CrisisChoice('Finish your degree first', (g, rng) =>
            'You thank them and stay the course.'),
      ],
    ),
    CrisisEvent(
      id: 'edu_research_stipend',
      emoji: '🔬',
      title: 'A research assistant slot',
      body: 'A professor offers you a paid RA position. The stipend is nice and '
          'the experience is gold — but the hours eat your study time.',
      eligible: inSchool,
      choices: [
        CrisisChoice('Take the position', (g, rng) {
          final stipend = gain(g, rng, 1800, 4000);
          extendSchool(g, 3);
          return 'A ${usd(stipend)} stipend and a glowing reference; you slow '
              'down by a term.';
        }),
        CrisisChoice('Focus on graduating', (g, rng) =>
            'You keep your head down and your timeline.'),
      ],
    ),
    CrisisEvent(
      id: 'edu_burnout',
      emoji: '🥱',
      title: 'You\'re burning out',
      body: 'The all-nighters have caught up with you. You can power through or '
          'take a break before something breaks.',
      eligible: inSchool,
      choices: [
        CrisisChoice('Take a semester off', (g, rng) {
          extendSchool(g, 6);
          return 'You rest and reset — graduation slips half a year, but '
              'you\'re human again.';
        }),
        CrisisChoice('Push through on caffeine', (g, rng) {
          final cost = spend(g, rng, 150, 500);
          if (rng.nextDouble() < 0.5) {
            return 'You grind it out — ${usd(cost)} on energy drinks and tutors.';
          }
          extendSchool(g, 4);
          return 'You crash mid-term anyway; ${usd(cost)} spent and a class slips.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'edu_bootcamp',
      emoji: '💻',
      title: 'A coding bootcamp pitch',
      body: '"12 weeks to a six-figure job," the ad promises. The tuition is '
          'steep and the outcomes... vary.',
      choices: [
        CrisisChoice('Enroll and grind', (g, rng) {
          final cost = spend(g, rng, 8000, 15000);
          if (rng.nextDouble() < 0.5) {
            final back = gain(g, rng, 12000, 25000);
            return 'It paid off — a new job nets you ${usd(back)}.';
          }
          return 'You finish the cert but the jobs never come. ${usd(cost)} '
              'spent.';
        }),
        CrisisChoice('Learn free online instead', (g, rng) {
          final small = spend(g, rng, 50, 200);
          return 'You scrape together ${usd(small)} of courses and self-teach.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'edu_pro_cert',
      emoji: '📜',
      title: 'A professional certification',
      body: 'A credential in your field could mean a raise — if you pass the '
          'notoriously hard exam.',
      choices: [
        CrisisChoice('Pay the fee and sit it', (g, rng) {
          final fee = rnd(rng, 600, 1500);
          g.cash -= fee;
          if (rng.nextDouble() < 0.6) {
            final bonus = gain(g, rng, 2500, 5000);
            return 'Passed! ${usd(fee)} fee, but a ${usd(bonus)} raise bump '
                'follows.';
          }
          return 'Failed by a hair — ${usd(fee)} gone, try again next year.';
        }),
        CrisisChoice('Skip it for now', (g, rng) =>
            'You decide the timing isn\'t right.'),
      ],
    ),
    CrisisEvent(
      id: 'edu_textbook_gouge',
      emoji: '📚',
      title: 'Textbook sticker shock',
      body: 'The campus store wants a fortune for this semester\'s books.',
      eligible: inSchool,
      choices: [
        CrisisChoice('Buy new, no hassle', (g, rng) {
          final cost = spend(g, rng, 400, 900);
          return 'You shell out ${usd(cost)} for shrink-wrapped peace of mind.';
        }),
        CrisisChoice('Hunt for sketchy PDFs', (g, rng) {
          final saved = spend(g, rng, 30, 120);
          if (rng.nextDouble() < 0.3) {
            final fine = spend(g, rng, 300, 700);
            return 'A copyright notice costs you ${usd(fine)} — so much for '
                'saving.';
          }
          return 'You find them all online for ${usd(saved)}. Nice.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'edu_tutoring_gig',
      emoji: '🧮',
      title: 'You could tutor for cash',
      body: 'Struggling underclassmen will pay for your help — but evenings '
          'spent teaching are evenings not studying.',
      eligible: inSchool,
      choices: [
        CrisisChoice('Hang out a shingle', (g, rng) {
          final earned = gain(g, rng, 800, 2200);
          extendSchool(g, 2);
          return 'You earn ${usd(earned)} tutoring; your own work slips a bit.';
        }),
        CrisisChoice('Protect your study time', (g, rng) =>
            'You keep your evenings for your own classes.'),
      ],
    ),
    CrisisEvent(
      id: 'edu_loan_refi',
      emoji: '🏦',
      title: 'A student-loan refinance offer',
      body: 'A lender offers to refinance your loans at a better rate — if you '
          'pay an upfront origination fee.',
      eligible: (g) => g.studentLoan > 5000,
      choices: [
        CrisisChoice('Refinance', (g, rng) {
          final fee = spend(g, rng, 300, 800);
          studentDebt(g, -rnd(rng, 2000, 6000));
          return 'A ${usd(fee)} fee, but your balance drops nicely.';
        }),
        CrisisChoice('Read the fine print, pass', (g, rng) =>
            'It smelled off. You keep your current loan.'),
      ],
    ),
    CrisisEvent(
      id: 'edu_group_project',
      emoji: '🧑‍🤝‍🧑',
      title: 'Your group project is a disaster',
      body: 'Your teammates have vanished and the deadline looms. Carry them, '
          'or let it sink?',
      eligible: inSchool,
      choices: [
        CrisisChoice('Pull all-nighters and carry it', (g, rng) {
          final cost = spend(g, rng, 50, 200);
          return 'You do everyone\'s work for ${usd(cost)} in coffee — and the '
              'A.';
        }),
        CrisisChoice('Do only your part', (g, rng) {
          if (rng.nextDouble() < 0.5) {
            extendSchool(g, 4);
            return 'The project tanks and you have to retake the class.';
          }
          return 'Somehow it scrapes a pass. You kept your weekend.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'edu_conference',
      emoji: '🎟️',
      title: 'An industry conference is in town',
      body: 'Big names, big networking. The ticket isn\'t cheap, and skipping '
          'class to attend is a gamble.',
      choices: [
        CrisisChoice('Buy a ticket and network', (g, rng) {
          final ticket = spend(g, rng, 300, 900);
          if (rng.nextDouble() < 0.45) {
            final gig = gain(g, rng, 1500, 4000);
            return 'You meet the right person — a ${usd(gig)} gig comes of it.';
          }
          return 'Good talks, free pens, but nothing came of the ${usd(ticket)}.';
        }),
        CrisisChoice('Watch the livestream for free', (g, rng) =>
            'You catch the keynotes from your couch.'),
      ],
    ),
    CrisisEvent(
      id: 'edu_language',
      emoji: '🗣️',
      title: 'Learn a second language?',
      body: 'A pricey app subscription promises fluency. It could open doors — '
          'or gather dust like every other resolution.',
      choices: [
        CrisisChoice('Commit to a year', (g, rng) {
          obligation(g, 'Language app subscription', rnd(rng, 25, 60), 12);
          if (rng.nextDouble() < 0.4) {
            final gig = gain(g, rng, 1500, 4000);
            return 'You stick with it and land ${usd(gig)} of translation work.';
          }
          return 'You\'re paying monthly... and on lesson three since March.';
        }),
        CrisisChoice('Maybe later', (g, rng) =>
            'You bookmark it with the other someday plans.'),
      ],
    ),
    CrisisEvent(
      id: 'edu_mentor',
      emoji: '🧓',
      title: 'A mentor offers to coach you',
      body: 'A seasoned pro will mentor you one-on-one — for a not-small monthly '
          'retainer.',
      choices: [
        CrisisChoice('Hire the mentor', (g, rng) {
          obligation(g, 'Career mentor retainer', rnd(rng, 150, 400), 6);
          final boost = gain(g, rng, 1000, 3000);
          return 'Their connections already paid off — ${usd(boost)} in new '
              'work.';
        }),
        CrisisChoice('Figure it out yourself', (g, rng) =>
            'You bet on grit over guidance.'),
      ],
    ),
    CrisisEvent(
      id: 'edu_youtube_finance',
      emoji: '📺',
      title: 'A finance guru\'s "free" masterclass',
      body: 'A slick YouTuber swears their paid course reveals a "guaranteed" '
          'investing edge.',
      choices: [
        CrisisChoice('Buy the course', (g, rng) {
          final price = spend(g, rng, 500, 1500);
          if (rng.nextDouble() < 0.3) {
            final w = gain(g, rng, 1500, 5000);
            return 'One genuinely good tip nets you ${usd(w)}. Huh.';
          }
          return 'It was repackaged free advice. ${usd(price)} gone.';
        }),
        CrisisChoice('Watch the free videos', (g, rng) =>
            'You learn the basics without paying the upsell.'),
      ],
    ),
    CrisisEvent(
      id: 'edu_night_school',
      emoji: '🌙',
      title: 'Night classes while you work',
      body: 'You could chip away at a credential in the evenings. It costs money '
          'and your free time, but builds toward something.',
      choices: [
        CrisisChoice('Enroll part-time', (g, rng) {
          studentDebt(g, rnd(rng, 3000, 7000));
          obligation(g, 'Night-class commute & fees', rnd(rng, 80, 200), 8);
          return 'You\'re building skills — on borrowed money and borrowed '
              'evenings.';
        }),
        CrisisChoice('Not right now', (g, rng) =>
            'You keep your evenings free.'),
      ],
    ),
    CrisisEvent(
      id: 'edu_alumni_donation',
      emoji: '🎓',
      title: 'Your alma mater calls for a donation',
      body: 'They never stop. A gift feels good and keeps you in the network — '
          'but it\'s money out the door.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Give generously', (g, rng) {
          final gift = spendScaled(g, 0.004, 500);
          if (rng.nextDouble() < 0.5) {
            final intro = gain(g, rng, 1000, 4000);
            return 'You donate ${usd(gift)}; an alumni intro lands ${usd(intro)} '
                'of business.';
          }
          return 'You give ${usd(gift)} and get a warm fuzzy and a tote bag.';
        }),
        CrisisChoice('Politely decline', (g, rng) =>
            'You let it go to voicemail.'),
      ],
    ),
  ];
}
