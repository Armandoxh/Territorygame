import 'crisis_kit.dart';

/// Tech & digital life expansion pack. Every choice is a real tradeoff.
class TechCrises {
  TechCrises._();

  static final List<CrisisEvent> all = [
    // ---- base tier (no minNetWorth) -------------------------------------
    CrisisEvent(
      id: 'tech_cracked_screen',
      emoji: '📱',
      title: 'You cracked your phone screen',
      body: 'A spiderweb of cracks now lives between you and every text. '
          'Fix the screen, replace the whole phone, or live with it.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Repair the screen', (g, rng) {
          final cost = spend(g, rng, 120, 320);
          return 'Good as new for ${usd(cost)} — cheaper than panic-buying.';
        }),
        CrisisChoice('Upgrade to the latest model', (g, rng) {
          final cost = spend(g, rng, 800, 1300);
          return 'Shiny new slab in hand — ${usd(cost)} you didn\'t have to spend.';
        }),
        CrisisChoice('Tape it and tough it out', (g, rng) {
          if (rng.nextDouble() < 0.35) {
            final cut = spend(g, rng, 30, 90);
            return 'A shard nicks your thumb — ${usd(cut)} on bandages and a '
                'screen protector. Vanity has a price.';
          }
          return 'You live the cracked-screen life. Free, mildly embarrassing.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'tech_sub_audit',
      emoji: '🧾',
      title: 'Subscription audit',
      body: 'You finally open the bank statement and count the little monthly '
          'charges. The average person bleeds ~\$30/mo to forgotten ones.',
      maxNetWorth: 400000,
      choices: [
        CrisisChoice('Cancel the dead weight', (g, rng) {
          final saved = spend(g, rng, 8, 25);
          return 'You axe a few zombie subs — ${usd(saved)} in last charges, '
              'then peace. The wins are in what you DON\'T pay next month.';
        }),
        CrisisChoice('Keep them, you\'ll use them eventually', (g, rng) {
          obligation(g, 'forgotten subscriptions', rnd(rng, 18, 38), 12);
          return 'You close the tab. The streaming services you never watch '
              'thank you for a full year.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'tech_sell_old_gadgets',
      emoji: '📦',
      title: 'A drawer full of dead gadgets',
      body: 'Old phones, a tablet, a smartwatch, three chargers for devices '
          'you no longer own. You could sell the lot.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('List them online', (g, rng) {
          final got = gain(g, rng, 120, 600);
          return 'Sold to strangers across town — ${usd(got)} for clutter.';
        }),
        CrisisChoice('Trade them in at the store', (g, rng) {
          final got = gain(g, rng, 40, 180);
          return 'The kiosk lowballs you, but it\'s instant — ${usd(got)}, no '
              'haggling, no shipping.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'tech_data_breach',
      emoji: '🔓',
      title: 'Your data leaked in a breach',
      body: 'A site you used got hacked and your email, password, and card are '
          'on a dark-web dump. Pay for monitoring or hope for the best.',
      choices: [
        CrisisChoice('Buy credit monitoring', (g, rng) {
          final cost = spend(g, rng, 60, 200);
          return 'A year of alerts and lock-downs for ${usd(cost)}. Boring, '
              'and probably worth it.';
        }),
        CrisisChoice('Just change your passwords and risk it', (g, rng) {
          if (rng.nextDouble() < 0.25) {
            final loss = spend(g, rng, 400, 2500);
            return 'Someone opens a card in your name — ${usd(loss)} and weeks '
                'of phone calls to undo it.';
          }
          return 'You dodge it. New passwords, no damage, no fee.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'tech_old_crypto_wallet',
      emoji: '🪙',
      title: 'You found an old crypto wallet',
      body: 'Cleaning out a hard drive, you find a wallet from years ago. It '
          'might be worth a fortune — if you can remember the password.',
      choices: [
        CrisisChoice('Hire a recovery service', (g, rng) {
          final fee = spend(g, rng, 300, 1200);
          if (rng.nextDouble() < 0.30) {
            final stash = gain(g, rng, 8000, 40000);
            return 'They crack it — ${usd(stash)} in forgotten coins, minus the '
                '${usd(fee)} fee. You feel like a genius.';
          }
          return 'No seed phrase, no luck. ${usd(fee)} gone and the coins stay '
              'locked forever.';
        }),
        CrisisChoice('Try to remember it yourself', (g, rng) {
          if (rng.nextDouble() < 0.12) {
            final stash = gain(g, rng, 5000, 25000);
            return 'On the eighth guess it opens — ${usd(stash)} appears. Pure '
                'luck.';
          }
          return 'Twelve wrong guesses later the wallet wipes itself. The coins '
              'are gone. Free, and infuriating.';
        }),
        CrisisChoice('Toss the drive, move on', (g, rng) =>
            'You decide your sanity is worth more than a maybe-fortune. The '
            'drive goes in the bin.'),
      ],
    ),
    CrisisEvent(
      id: 'tech_ransomware',
      emoji: '💀',
      title: 'Ransomware locked your laptop',
      body: 'A scary message demands payment to unlock your files — including '
          'work you never backed up. Pay the ransom or wipe and start over.',
      choices: [
        CrisisChoice('Pay the ransom', (g, rng) {
          final pay = spend(g, rng, 400, 1500);
          if (rng.nextDouble() < 0.55) {
            return 'They actually unlock it — ${usd(pay)} and your files are '
                'back. Criminals with a refund policy.';
          }
          return 'You pay ${usd(pay)} and they vanish. Locked and broke.';
        }),
        CrisisChoice('Wipe it and rebuild', (g, rng) {
          final lost = spend(g, rng, 100, 400);
          return 'Clean install for ${usd(lost)} in tools and time. The files '
              'are gone but you owe no crook a cent.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'tech_side_app',
      emoji: '💻',
      title: 'You have an app idea',
      body: 'A weekend idea won\'t leave your head. You could build it — most '
          'side apps go nowhere, but the one that sticks pays for itself.',
      choices: [
        CrisisChoice('Build and ship it', (g, rng) {
          final cost = spend(g, rng, 1000, 4000);
          if (rng.nextDouble() < 0.30) {
            final rev = gain(g, rng, 6000, 18000);
            return 'It catches on — ${usd(rev)} in revenue against ${usd(cost)} '
                'spent. You\'re an indie hacker now.';
          }
          return 'Crickets. ${usd(cost)} on hosting and ads, and a lesson.';
        }),
        CrisisChoice('Just buy the domain and dream', (g, rng) {
          final cost = spend(g, rng, 12, 60);
          return 'You park a ${usd(cost)} domain and tell yourself you\'ll get '
              'to it. The dream lives, cheaply.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'tech_gadget_preorder',
      emoji: '🥽',
      title: 'A hyped gadget pre-order',
      body: 'A flashy startup is taking pre-orders for a device that\'ll change '
          'everything. It ships "soon" — if it ships at all.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Pre-order it', (g, rng) {
          final out = wager(g, rng, rnd(rng, 300, 900), 0.45, 1.4);
          if (out > 0) {
            return 'It ships and it\'s great — you flip your spare unit for a '
                '${usd(out)} gain over what you paid.';
          }
          return 'The company ghosts its backers. ${usd(-out)} into the void.';
        }),
        CrisisChoice('Wait for reviews', (g, rng) =>
            'You keep your wallet shut and let early adopters beta-test for you. '
            'Patience: free.'),
      ],
    ),
    CrisisEvent(
      id: 'tech_kickstarter',
      emoji: '🚀',
      title: 'A Kickstarter you love',
      body: 'A clever campaign hits your feed and the prototype looks magical. '
          'Crowdfunding is a bet, not a store.',
      maxNetWorth: 250000,
      choices: [
        CrisisChoice('Back it at a high tier', (g, rng) {
          final out = wager(g, rng, rnd(rng, 150, 500), 0.50, 1.6);
          if (out > 0) {
            return 'It delivers AND becomes collectible — your reward sells on '
                'for a ${usd(out)} gain. Lucky backer.';
          }
          return 'The project implodes mid-production. ${usd(-out)}, no reward, '
              'just sad email updates.';
        }),
        CrisisChoice('Back it at the cheapest tier', (g, rng) {
          final cost = spend(g, rng, 15, 45);
          return 'You chip in ${usd(cost)} for the warm fuzzy feeling and a '
              'sticker. Low stakes, low regret.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'tech_cloud_storage',
      emoji: '☁️',
      title: 'Your cloud storage is full',
      body: 'You\'re out of space and every app is nagging you. Pay for the '
          'bigger plan, or spend an evening cleaning house.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Upgrade the plan', (g, rng) {
          obligation(g, 'cloud storage', rnd(rng, 3, 12), 24);
          return 'Two more years of cloud bills, but you never think about '
              'space again. Convenience, monthly.';
        }),
        CrisisChoice('Delete and download to a drive', (g, rng) {
          final cost = spend(g, rng, 40, 120);
          return 'A ${usd(cost)} external drive and a tedious night later, you '
              'owe nobody a subscription.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'tech_viral_tweet',
      emoji: '🐦',
      title: 'A post of yours went viral',
      body: 'Millions of views overnight. People are sliding into your DMs '
          'about ads and a course. Strike while it\'s hot — or stay clean.',
      choices: [
        CrisisChoice('Monetize the moment', (g, rng) {
          if (rng.nextDouble() < 0.45) {
            final got = gain(g, rng, 500, 4000);
            return 'You sling a few sponsored links and a quick guide — '
                '${usd(got)} before the algorithm forgets you.';
          }
          final cost = spend(g, rng, 50, 300);
          return 'Followers call you a sellout and bounce. ${usd(cost)} on a '
              'landing page nobody bought from.';
        }),
        CrisisChoice('Enjoy it and log off', (g, rng) =>
            'You screenshot it for the grandkids and go touch grass. Fame is '
            'fleeting; your dignity is intact.'),
      ],
    ),
    CrisisEvent(
      id: 'tech_learn_automation',
      emoji: '⚙️',
      title: 'A tedious task you could automate',
      body: 'You spend hours each week on the same boring chore. A weekend of '
          'learning to script it could pay off — or just eat your weekend.',
      choices: [
        CrisisChoice('Learn it and build the script', (g, rng) {
          final cost = spend(g, rng, 20, 120);
          if (rng.nextDouble() < 0.55) {
            final saved = gain(g, rng, 300, 1500);
            return 'It works — the time saved turns into ${usd(saved)} of side '
                'work, minus ${usd(cost)} on a tutorial.';
          }
          return 'You break more than you fix and crawl back to doing it by '
              'hand. ${usd(cost)} and a weekend, gone.';
        }),
        CrisisChoice('Keep doing it the slow way', (g, rng) =>
            'You stick with the manual grind. No cost, no learning, same chore '
            'next week.'),
      ],
    ),
    CrisisEvent(
      id: 'tech_vpn_security',
      emoji: '🛡️',
      title: 'A scary security pop-up',
      body: 'After a sketchy public-wifi session you\'re spooked. A polished '
          'security suite promises to keep you safe — for a recurring fee.',
      maxNetWorth: 300000,
      choices: [
        CrisisChoice('Subscribe to the security suite', (g, rng) {
          obligation(g, 'VPN + security suite', rnd(rng, 5, 14), 12);
          return 'A year of antivirus and VPN. Mostly peace of mind, partly a '
              'tax on your anxiety.';
        }),
        CrisisChoice('Use the free tools and good habits', (g, rng) {
          if (rng.nextDouble() < 0.18) {
            final loss = spend(g, rng, 200, 1000);
            return 'A phishing link gets you anyway — ${usd(loss)} and a hard '
                'lesson about free.';
          }
          return 'Strong passwords and a free VPN do the job. Zero dollars, '
              'zero incidents.';
        }),
      ],
    ),
    // ---- minNetWorth: 30000 ---------------------------------------------
    CrisisEvent(
      id: 'tech_ai_tool_sub',
      emoji: '🤖',
      title: 'An AI tool that boosts your side income',
      body: 'A pro AI subscription could genuinely speed up your freelance '
          'work. It\'s pricey monthly, but the output might more than cover it.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Subscribe and lean in', (g, rng) {
          obligation(g, 'AI pro subscription', rnd(rng, 20, 60), 12);
          final earned = gain(g, rng, 1500, 6000);
          return 'You ship twice as fast — ${usd(earned)} in extra side work '
              'this year easily beats the monthly fee.';
        }),
        CrisisChoice('Stick with the free tier', (g, rng) {
          if (rng.nextDouble() < 0.40) {
            final missed = spend(g, rng, 200, 800);
            return 'You turn down a gig you couldn\'t deliver in time — about '
                '${usd(missed)} left on the table. No fee, but a ceiling.';
          }
          return 'The free tier covers your needs. No subscription, no FOMO.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'tech_smart_home',
      emoji: '🏠',
      title: 'Smart-home splurge',
      body: 'Smart bulbs, locks, a doorbell cam, a voice assistant in every '
          'room. The full kit isn\'t cheap and half of it you\'ll never use.',
      minNetWorth: 30000,
      maxNetWorth: 400000,
      choices: [
        CrisisChoice('Outfit the whole house', (g, rng) {
          final cost = spend(g, rng, 1500, 5000);
          return 'Your lights obey your voice for ${usd(cost)}. The novelty '
              'wears off in three weeks; the gadgets stay.';
        }),
        CrisisChoice('Just get a smart thermostat', (g, rng) {
          final cost = spend(g, rng, 150, 350);
          return 'One sensible ${usd(cost)} upgrade that might even trim the '
              'energy bill. Restraint pays.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'tech_laptop_dies',
      emoji: '🔌',
      title: 'Your work laptop died',
      body: 'It won\'t power on the morning of a deadline. Rush a new one, get '
          'it repaired, or limp along on a borrowed machine.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Buy a new one today', (g, rng) {
          final cost = spend(g, rng, 1200, 2800);
          return 'You\'re back online in an hour for ${usd(cost)}. Deadlines '
              'don\'t wait for sales.';
        }),
        CrisisChoice('Pay for an emergency repair', (g, rng) {
          final cost = spend(g, rng, 200, 700);
          if (rng.nextDouble() < 0.60) {
            return 'A swollen battery, swapped for ${usd(cost)}. Saved a '
                'fortune.';
          }
          final more = spend(g, rng, 1000, 2200);
          return 'The board\'s fried — ${usd(cost)} wasted, then ${usd(more)} '
              'on a new machine anyway.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'tech_domain_offer',
      emoji: '🌐',
      title: 'Someone wants to buy your domain',
      body: 'A startup emails an offer for that clever domain you registered on '
          'a whim years ago. Take the cash, or hold out for more.',
      minNetWorth: 30000,
      choices: [
        CrisisChoice('Sell at their offer', (g, rng) {
          final got = gain(g, rng, 800, 6000);
          return 'You sign it over for ${usd(got)} — a tidy return on a '
              '\$12 whim.';
        }),
        CrisisChoice('Counter and hold out', (g, rng) {
          if (rng.nextDouble() < 0.35) {
            final got = gain(g, rng, 4000, 20000);
            return 'They blink first — ${usd(got)} for a name you forgot you '
                'owned. Greed, vindicated.';
          }
          final fee = spend(g, rng, 12, 40);
          return 'They walk, and nobody else calls. You pay ${usd(fee)} to '
              'renew it and wait some more.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'tech_flip_electronics',
      emoji: '🔁',
      title: 'A clearance pallet of electronics',
      body: 'A liquidation lot of returned gadgets is going cheap. Flip them '
          'online for a profit — if enough of them actually work.',
      minNetWorth: 30000,
      maxNetWorth: 400000,
      choices: [
        CrisisChoice('Buy the pallet and flip it', (g, rng) {
          final cost = spend(g, rng, 800, 2500);
          if (rng.nextDouble() < 0.50) {
            final sales = gain(g, rng, 1500, 5000);
            return 'Most units worked — ${usd(sales)} in sales against '
                '${usd(cost)} spent. A weekend well hustled.';
          }
          return 'Half the lot is e-waste and returns eat the rest. ${usd(cost)} '
              'and a garage full of bricks.';
        }),
        CrisisChoice('Pass — too risky', (g, rng) =>
            'You leave the mystery pallet to braver resellers. No profit, no '
            'pile of broken tablets.'),
      ],
    ),
    CrisisEvent(
      id: 'tech_extended_warranty',
      emoji: '🧷',
      title: 'The checkout warranty upsell',
      body: 'You\'re buying a pricey gadget and the clerk pushes the extended '
          'warranty hard. It\'s mostly profit for the store — mostly.',
      minNetWorth: 30000,
      maxNetWorth: 400000,
      choices: [
        CrisisChoice('Add the warranty', (g, rng) {
          final cost = spend(g, rng, 80, 300);
          if (rng.nextDouble() < 0.25) {
            final saved = gain(g, rng, 300, 900);
            return 'It breaks in month nine and they replace it free — '
                '${usd(saved)} value for your ${usd(cost)}. Smug.';
          }
          return 'The gadget never breaks. ${usd(cost)} of insurance you never '
              'used, as designed.';
        }),
        CrisisChoice('Decline it', (g, rng) {
          if (rng.nextDouble() < 0.20) {
            final repair = spend(g, rng, 150, 600);
            return 'Naturally it dies just out of warranty — ${usd(repair)} to '
                'fix. The clerk would\'ve loved this.';
          }
          return 'It works fine for years. You kept the warranty money and the '
              'odds were on your side.';
        }),
      ],
    ),
    // ---- minNetWorth: 150000 --------------------------------------------
    CrisisEvent(
      id: 'tech_seed_round',
      emoji: '📈',
      title: 'An angel check into a friend\'s startup',
      body: 'A friend\'s startup is raising a seed round and wants you in. Most '
          'seed-stage companies die — but the rare winner returns many-fold.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Write the check', (g, rng) {
          final out = wager(g, rng, scaled(g, 0.04, 8000), 0.30, 3.5);
          if (out > 0) {
            return 'They get acquired — your stake returns ${usd(out)}. You '
                'tell this story at every dinner now.';
          }
          return 'It folds in eighteen months. ${usd(-out)} written off as '
              '"experience".';
        }),
        CrisisChoice('Offer advice instead of money', (g, rng) =>
            'You give them your time and your network, not your cash. Your '
            'balance — and the friendship — survive either outcome.'),
      ],
    ),
    CrisisEvent(
      id: 'tech_home_server',
      emoji: '🖥️',
      title: 'Build a home server lab',
      body: 'You\'re itching to build a rack of servers to self-host '
          'everything. It\'s a real skill-builder and a real money pit.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Build the full rack', (g, rng) {
          final cost = spendScaled(g, 0.03, 4000);
          obligation(g, 'home lab power & cooling', rnd(rng, 20, 60), 12);
          return 'A blinking ${usd(cost)} cathedral of hardware, plus a year of '
              'power bills. Your hobby has a heartbeat now.';
        }),
        CrisisChoice('Rent a cheap cloud box instead', (g, rng) {
          obligation(g, 'cloud server', rnd(rng, 10, 30), 12);
          return 'You spin up a tiny cloud server for pocket change a month. '
              'Less cool, far less cash up front.';
        }),
      ],
    ),
    CrisisEvent(
      id: 'tech_nft_drop',
      emoji: '🖼️',
      title: 'An exclusive NFT drop',
      body: 'A hyped collection is minting and your group chat swears it\'s the '
          'next big thing. The floor could moon — or evaporate by morning.',
      minNetWorth: 150000,
      maxNetWorth: 400000,
      choices: [
        CrisisChoice('Mint a few', (g, rng) {
          final out = wager(g, rng, scaled(g, 0.02, 3000), 0.35, 2.5);
          if (out > 0) {
            return 'You flip them at the peak — ${usd(out)} gain. You will '
                'never shut up about it.';
          }
          return 'The hype dies and the floor caves. ${usd(-out)} of '
              'jpegs nobody wants.';
        }),
        CrisisChoice('Sit this hype cycle out', (g, rng) =>
            'You watch the chart from the sidelines. No gains, no liquidation, '
            'no profile-picture regret.'),
      ],
    ),
    CrisisEvent(
      id: 'tech_smart_renovation',
      emoji: '💡',
      title: 'Wire the house with high-end automation',
      body: 'A pro installer pitches a fully automated smart home — lighting, '
          'climate, security, the works. Slick, but a serious bill.',
      minNetWorth: 150000,
      choices: [
        CrisisChoice('Do the full install', (g, rng) {
          final cost = spendScaled(g, 0.05, 6000);
          if (rng.nextDouble() < 0.35) {
            final bump = gain(g, rng, 3000, 12000);
            return 'It actually lifts your home\'s appeal — ${usd(cost)} spent, '
                'but buyers later value it at +${usd(bump)}. Rare win.';
          }
          return 'It\'s gorgeous and gimmicky. ${usd(cost)} that the next owner '
              'will probably rip right out.';
        }),
        CrisisChoice('DIY a modest setup', (g, rng) {
          final cost = spend(g, rng, 400, 1500);
          return 'A weekend and ${usd(cost)} gets you 80% of the magic. The '
              'installer\'s markup stays in your pocket.';
        }),
      ],
    ),
    // ---- minNetWorth: 750000 --------------------------------------------
    CrisisEvent(
      id: 'tech_buy_saas',
      emoji: '🏦',
      title: 'Acquire a small SaaS business',
      body: 'A profitable little SaaS app is for sale by a burned-out founder. '
          'Steady recurring revenue — or a churning liability you inherit.',
      minNetWorth: 750000,
      choices: [
        CrisisChoice('Buy it and run it', (g, rng) {
          final price = spendScaled(g, 0.08, 60000);
          if (rng.nextDouble() < 0.45) {
            final ret = gain(g, rng, 40000, 150000);
            return 'The subscribers stick — ${usd(ret)} flows in over the year '
                'against ${usd(price)} paid. You own a money machine.';
          }
          obligation(g, 'SaaS hosting & support', rnd(rng, 800, 2500), 12);
          return 'Churn spikes the moment you take over. ${usd(price)} spent '
              'and now you\'re paying to keep the lights on.';
        }),
        CrisisChoice('Pass and keep your powder dry', (g, rng) =>
            'You decide you don\'t want to inherit someone else\'s tech debt. '
            'Cash stays put, sanity intact.'),
      ],
    ),
  ];
}
