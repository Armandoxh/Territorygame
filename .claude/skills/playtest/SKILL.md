---
name: playtest
description: Agentic full-life playthrough of WealthQuest. Drives the GameController engine month-by-month from age 18→60 (504 months), exercising EVERY feature (careers/education, investing, real estate, businesses, commodities, betting, retirement/401k, taxes, family, housing/transport, events/standing, crises, overdraft/margin, prestige), then reports bugs, crashes, dead-ends/softlocks, and balance flags. Use when the user asks to "play through", "playtest", "agentize the playthrough", or test the whole game. Sub-skills (playtest-career, playtest-wealth, playtest-life, playtest-resilience) deep-dive one area; this one sweeps everything in one life.
---

# /playtest — full-life agentic playthrough (age 18 → 60)

You are a play-testing agent. You "play" WealthQuest by driving the
`GameController` engine — the exact same logic every screen calls — from
age 18 to 60, touching every feature, and reporting what works, what
breaks, and what feels off. Flutter isn't installed locally, so the
playthrough runs as a Dart test inside the `wealthquest-sim` GitHub
Actions workflow; you write the driver, run it, read the log, and
report.

## Time model

- One `advanceDay()` (or one step of `advanceMonths(n)`) = **one in-game
  month**. `Catalog.startAge` = 18, `Catalog.stepsPerYear` = 12.
- Age 18 → 60 is **42 years = 504 months**. `g.ageYears` reports current
  age; loop until it reaches the target.

## Run procedure (do this each time the skill is invoked)

1. **Guard against container resets.** The ephemeral container sometimes
   reverts the working tree to an old snapshot. Before anything:
   ```
   git fetch origin claude/new-mobile-game-repo-JDskF
   git reset --hard origin/claude/new-mobile-game-repo-JDskF
   ```
   Confirm `wealthquest/lib/version.dart` shows the latest build.
2. **Verify the API hasn't drifted.** Open
   `wealthquest/lib/state/game_controller.dart` and confirm the method
   signatures in the cheat-sheet below still match. Fix the driver if they
   changed.
3. **Write the harness** to `wealthquest/test/playthrough/life_agent.dart`
   (template below) and the driver to
   `wealthquest/test/playthrough/full_life_playthrough_test.dart`
   (script below).
4. **Run it.** Commit and push (this triggers `wealthquest-sim.yml`),
   OR trigger that workflow via `workflow_dispatch`. Bump `kBuildNumber`
   only if you also changed `lib/` — a test-only change still triggers the
   sim workflow on push.
5. **Read the result.** Poll the `wealthquest-sim` run; fetch the job log
   with the GitHub MCP tools. The driver `print`s a structured report
   (see "Report format"). Surface it.
6. **Report to the user** (see "Report format"). Keep the playthrough
   tests in the repo — they're useful regression coverage — unless the
   user asks to remove them.

## Engine API cheat-sheet (verified at build 100)

State (getters): `g.cash`, `g.netWorth`, `g.ageYears`, `g.day`,
`g.holdings`, `g.properties`, `g.businesses`, `g.retirementBalance`,
`g.currentTrack`, `g.job`, `g.eduLevel`, `g.studentLoan`, `g.debt`,
`g.canRetire`, `g.standingTier`, `g.totalStanding`, `g.relationship`,
`g.children`, `g.housingChoiceId`, `g.transportChoiceId`,
`g.dailyExpenses`, `g.pendingCrisis`, `g.sportsSlate`,
`g.featuredParlays`, `g.attendedEventThisMonth`.

Data lists: `Catalog.assets`, `Catalog.categories`, `Catalog.jobs`,
`Catalog.degrees`, `Catalog.careerTracks`, `Catalog.assetsInCategory(id)`;
`Properties.ladder`, `Properties.mortgages`; `Businesses.all`;
`LifeData.events`, `LifeData.housing`, `LifeData.transport`.

Actions (most return `String?` = error message, null = success):
- Careers/edu: `takeJob(JobDef)`, `joinTrack(CareerTrack)`,
  `enroll(DegreeDef)`, `qualifiesForTrack(t)`, `meetsEducation(j)`.
- Investing: `buy(AssetDef, amount)`, `sell(Holding, amount, {max})`,
  `short(AssetDef, amount)`, `coverShort(Holding)`.
- Real estate: `buyProperty(PropertyDef, MortgageType, downFraction)`,
  `sellProperty(h)`, `renovate(h, budget)`, `toggleRental(h)`,
  `payDownMortgage(h, amount, {max})`, `refinance(h)`.
- Businesses: `buyBusiness(BusinessDef)`, `expandBusiness(h, budget)`,
  `toggleManager(h)`, `sellBusiness(h)`.
- Retirement: `setRetirementContribPct(pct)`,
  `withdrawRetirement(amount, {max})`.
- Betting: `placeBet(SportsEvent, home, stake)`,
  `placeFeatured(FeaturedParlay, stake)`, `placeParlay(legs, stake)`.
- Life: `goOnDate()`, `proposeMarriage()`, `haveChild()`,
  `chooseHousing(id?)`, `chooseTransport(id?)`,
  `attendLifeEvent(LifeEvent)`.
- Crises: `resolveCrisis(g.pendingCrisis!.choices.first)`.
- Time: `advanceDay()` → `DayResult`; `advanceMonths(n)` →
  `({DayResult result, int months})` (stops early on a crisis or margin
  call); `clearOverdraftStreak()` after surviving a margin call.

`DayResult` fields: `income, expenses, dividends, interest, rent,
mortgage, tax, businessIncome, overdraftFee, marginCall, crisis,
cashAfter, netWorthAfter, events`.

## Harness template — `test/playthrough/life_agent.dart`

```dart
import 'package:wealthquest/state/game_controller.dart';

/// Drives a single life and tracks feature coverage + issues. Auto-resolves
/// crises and survives margin calls so the life always reaches the target age.
class LifeAgent {
  final GameController g;
  final Set<String> covered = {};
  final List<String> bugs = [];
  final List<String> notes = [];
  LifeAgent({int seed = 1}) : g = GameController(seed: seed);

  void mark(String feature) => covered.add(feature);
  void bug(String m) => bugs.add('age ${g.ageYears}: $m');
  void note(String m) => notes.add('age ${g.ageYears}: $m');

  /// Try an action; record a bug if it throws, note the error string if any.
  void act(String feature, String? Function() action) {
    try {
      final err = action();
      mark(feature);
      if (err != null) note('$feature blocked: $err');
    } catch (e, st) {
      bug('$feature THREW: $e\n$st');
    }
  }

  /// Advance [months], resolving crises and surviving margin calls.
  void advance(int months) {
    var left = months;
    var guard = 0;
    while (left > 0 && guard++ < months + 50) {
      final out = g.advanceMonths(left);
      left -= out.months;
      if (out.result.crisis && g.pendingCrisis != null) {
        mark('crisis');
        g.resolveCrisis(g.pendingCrisis!.choices.first);
      }
      if (out.result.marginCall) {
        mark('marginCall');
        for (final h in [...g.holdings]) {
          if (g.cash >= 0) break;
          if (!h.isLocked) g.sell(h, 0, max: true);
        }
        g.clearOverdraftStreak();
      }
      if (out.months == 0 && g.pendingCrisis == null) break; // safety
    }
    // Invariants that must hold every life:
    if (!g.netWorth.isFinite) bug('netWorth went non-finite');
  }

  void advanceToAge(int age) {
    while (g.ageYears < age && g.day < 700) {
      advance(1);
    }
  }

  String report(String title) {
    final b = StringBuffer()
      ..writeln('\n===== PLAYTHROUGH: $title =====')
      ..writeln('Ended age ${g.ageYears} · net worth '
          '\$${g.netWorth.toStringAsFixed(0)} · cash '
          '\$${g.cash.toStringAsFixed(0)}')
      ..writeln('Covered (${covered.length}): ${covered.toList()..sort()}')
      ..writeln('BUGS (${bugs.length}):');
    for (final x in bugs) b.writeln('  ❌ $x');
    b.writeln('NOTES (${notes.length}):');
    for (final x in notes.take(40)) b.writeln('  · $x');
    b.writeln('=================================\n');
    return b.toString();
  }
}
```

## Driver script — `test/playthrough/full_life_playthrough_test.dart`

Walk one life 18→60, touching everything. Sketch (adapt to current API):

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:wealthquest/data/catalog.dart';
import 'package:wealthquest/data/properties.dart';
import 'package:wealthquest/data/businesses.dart';
import 'package:wealthquest/data/life.dart';
import 'life_agent.dart';

void main() {
  test('FULL LIFE 18→60 touches every system', () {
    final a = LifeAgent(seed: 7);
    final g = a.g;

    // 18–22: education + a career track, frugal lifestyle, start investing.
    a.act('enroll', () => g.enroll(Catalog.degrees.firstWhere((d)=>d.level>=2)));
    a.act('joinTrack', () => g.joinTrack(Catalog.careerTracks[2]));
    a.act('chooseHousing', () => null..also(()=>g.chooseHousing('roommates')));
    a.act('chooseTransport', () => null..also(()=>g.chooseTransport('transit')));
    a.act('setRetirementContribPct', () => null..also(()=>g.setRetirementContribPct(0.05)));
    a.advanceToAge(23);

    // 23–30: invest across EVERY category (incl. a short), buy a rental,
    // start a business, place a bet, go on dates.
    for (final c in Catalog.categories) {
      final asset = g.unlockedAssets(c.id).first;
      a.act('buy:${c.id}', () => g.buy(asset, 3000));
    }
    a.act('short', () => g.short(Catalog.assets.firstWhere((x)=>x.kind.name=='stock'), 2000));
    a.act('buyProperty', () => g.buyProperty(Properties.ladder.first, Properties.mortgages.first, 0.20));
    if (g.properties.isNotEmpty) a.act('toggleRental', () => null..also(()=>g.toggleRental(g.properties.first)));
    if (g.properties.isNotEmpty) a.act('renovate', () => g.renovate(g.properties.first, 5000));
    a.act('buyBusiness', () => g.buyBusiness(Businesses.all.first));
    if (g.businesses.isNotEmpty) a.act('toggleManager', () => null..also(()=>g.toggleManager(g.businesses.first)));
    if (g.sportsSlate.isNotEmpty) a.act('placeBet', () => g.placeBet(g.sportsSlate.first, true, 200));
    a.act('goOnDate', () => g.goOnDate());
    a.act('goOnDate', () => g.goOnDate());
    a.act('goOnDate', () => g.goOnDate());
    a.advanceToAge(31);

    // 31–45: marry, kids, trade up lifestyle, attend events, expand business,
    // sell an asset, contribute more to 401k.
    a.act('proposeMarriage', () => g.proposeMarriage());
    a.act('haveChild', () => g.haveChild());
    a.act('chooseHousing-up', () => null..also(()=>g.chooseHousing('two_bed')));
    for (final e in LifeData.events) { if (g.standingTier >= e.minTier) { a.act('attend:${e.id}', () => g.attendLifeEvent(e)); a.advance(1); } }
    if (g.businesses.isNotEmpty) a.act('expandBusiness', () => g.expandBusiness(g.businesses.first, 10000));
    if (g.holdings.isNotEmpty) a.act('sell', () => g.sell(g.holdings.first, 0, max:true));
    a.advanceToAge(46);

    // 46–60: coast to retirement eligibility; test an early 401k withdrawal,
    // a margin-call recovery, and prestige if eligible.
    a.act('withdrawRetirement', () => g.withdrawRetirement(1000));
    a.advanceToAge(60);
    a.note('canRetire=${g.canRetire}');

    // ignore: avoid_print
    print(a.report('FULL LIFE'));

    // Coverage + sanity assertions (tune the count as systems grow):
    expect(a.bugs, isEmpty, reason: a.bugs.join('\n'));
    expect(a.covered.length, greaterThan(15));
    expect(g.ageYears, greaterThanOrEqualTo(60));
  });
}
```

> The `..also(...)` is shorthand — in real Dart just call the void method
> and return `null` from the closure, e.g.
> `a.act('chooseHousing', () { g.chooseHousing('roommates'); return null; });`
> Write it cleanly when you generate the file.

## Report format (what you tell the user)

After the run, give a tight report:
- **Result:** ended age, net worth, cash; pass/fail.
- **Coverage:** which systems were exercised (and any not reachable).
- **🐛 Bugs:** anything that threw, or an invariant that broke (non-finite
  net worth, cash-flow drift, a softlock where no legal action advances the
  game).
- **⚠ Balance flags:** features that are trivially dominant or useless, a
  strategy that runaway-wins, a dead-end where the player can't recover.
- **Recommendation:** the single highest-value fix or tune.

Be honest: if a system couldn't be reached or a number looks broken, say
so with the evidence from the log.
