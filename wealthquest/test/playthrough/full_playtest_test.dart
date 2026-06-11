import 'package:flutter_test/flutter_test.dart';
import 'package:wealthquest/data/businesses.dart';
import 'package:wealthquest/data/catalog.dart';
import 'package:wealthquest/data/life.dart';
import 'package:wealthquest/data/properties.dart';
import 'package:wealthquest/models/asset.dart';

import 'life_agent.dart';

// ---------------------------------------------------------------------------
// Strategies. Each plays one FULL life (18 → death), taking actions over time.
// ---------------------------------------------------------------------------

void _buyAbove(LifeAgent a, AssetDef def, double buffer) {
  final spare = a.g.cash - buffer;
  if (spare > 500) a.act('buy:${def.categoryId}', () => a.g.buy(def, spare));
}

void _bestCareer(LifeAgent a, {bool topPay = true}) {
  final t = a.g.availableTracks;
  if (t.isNotEmpty) {
    a.act('joinTrack', () => a.g.joinTrack(topPay ? t.last : t.first));
  }
}

AssetDef _byId(String id) =>
    Catalog.assets.firstWhere((x) => x.id == id, orElse: () => Catalog.assets.first);

AssetDef _index(LifeAgent a) => a.g.unlockedAssets('funds').first;

/// Plays the game *competently*: work first, build a 6-month buffer, insure,
/// contribute to the match, then invest only the surplus. This is the control
/// for "is the game winnable with skill?" — its bankruptcy rate should be low.
void competent(LifeAgent a) {
  _bestCareer(a); // join the best track now; auto-promotions climb the rungs
  a.act('chooseHousing', () => a.g.chooseHousing('roommates'));
  a.advance(36); // build savings before taking on any fixed cost
  final idx = _index(a);
  var setUp = false;
  while (!a.g.isDead && a.g.ageYears < 110) {
    // Only take on insurance/401k once your paycheck can actually carry them.
    if (!setUp && a.g.job.pay >= 3500) {
      a.act('insure-health', () => a.g.toggleInsurance('health'));
      a.act('insure-auto', () => a.g.toggleInsurance('auto'));
      a.act('401k', () => a.g.setRetirementContribPct(0.08));
      setUp = true;
    }
    if (setUp) _buyAbove(a, idx, a.g.dailyExpenses * 6 + 3000);
    a.advance(6);
  }
}

void doNothing(LifeAgent a) => a.runToDeath();

void fireMonk(LifeAgent a) {
  _bestCareer(a);
  a.act('chooseHousing', () => a.g.chooseHousing('live_family'));
  a.act('chooseTransport', () => a.g.chooseTransport('bike'));
  a.act('insure-health', () => a.g.toggleInsurance('health'));
  a.act('401k', () => a.g.setRetirementContribPct(0.15));
  final idx = _index(a);
  while (!a.g.isDead && a.g.ageYears < 110) {
    _buyAbove(a, idx, a.g.dailyExpenses * 3 + 1500);
    a.advance(6);
  }
}

void indexer(LifeAgent a, {bool insured = true}) {
  _bestCareer(a);
  a.advance(36);
  if (insured) {
    a.act('insure-health', () => a.g.toggleInsurance('health'));
    a.act('insure-auto', () => a.g.toggleInsurance('auto'));
    a.act('insure-home', () => a.g.toggleInsurance('home'));
  }
  a.act('401k', () => a.g.setRetirementContribPct(0.10));
  a.act('chooseHousing', () => a.g.chooseHousing('one_bed'));
  final idx = _index(a);
  while (!a.g.isDead && a.g.ageYears < 110) {
    _buyAbove(a, idx, a.g.dailyExpenses * 5 + 4000);
    a.advance(6);
  }
}

void landlord(LifeAgent a) {
  _bestCareer(a);
  a.advance(36);
  a.act('insure-health', () => a.g.toggleInsurance('health'));
  a.act('chooseHousing', () => a.g.chooseHousing('roommates'));
  while (!a.g.isDead && a.g.ageYears < 110) {
    if (a.g.cash > 35000 && a.g.properties.length < 6) {
      final def = Properties.ladder.firstWhere(
          (p) => a.g.propertyPriceOf(p.id) * 0.20 < a.g.cash * 0.7,
          orElse: () => Properties.ladder.first);
      a.act('buyProperty', () => a.g.buyProperty(def, Properties.mortgages.first, 0.20));
      if (a.g.properties.isNotEmpty) {
        a.act('toggleRental', () => a.g.toggleRental(a.g.properties.last));
      }
    }
    a.advance(6);
  }
}

void cryptoDegen(LifeAgent a) {
  _bestCareer(a);
  a.act('chooseTransport', () => a.g.chooseTransport('transit'));
  while (!a.g.isDead && a.g.ageYears < 110) {
    _buyAbove(a, _byId('btq'), 1500);
    a.advance(6);
  }
}

void baller(LifeAgent a) {
  _bestCareer(a);
  a.act('chooseHousing', () => a.g.chooseHousing('luxury'));
  a.act('chooseTransport', () => a.g.chooseTransport('luxury_car'));
  final idx = _index(a);
  while (!a.g.isDead && a.g.ageYears < 110) {
    if (!a.g.hasPartner) {
      a.act('date', () => a.g.goOnDate());
    } else {
      a.act('marry', () => a.g.proposeMarriage());
      if (a.g.children < 2) a.act('child', () => a.g.haveChild());
    }
    _buyAbove(a, idx, 8000);
    a.advance(6);
  }
}

void reckless(LifeAgent a) {
  _bestCareer(a, topPay: false);
  while (!a.g.isDead && a.g.ageYears < 110) {
    if (a.g.cash > 5000) {
      a.act('buyBusiness', () => a.g.buyBusiness(Businesses.all.last));
    }
    if (a.g.sportsSlate.isNotEmpty && a.g.cash > 1000) {
      a.act('bet', () => a.g.placeBet(a.g.sportsSlate.first, true, a.g.cash * 0.6));
    }
    a.advance(6);
  }
}

/// Touches every system for max coverage.
void explorer(LifeAgent a) {
  a.act('enroll', () => a.g.enroll(Catalog.degrees.first));
  a.advance(40);
  _bestCareer(a);
  a.act('401k', () => a.g.setRetirementContribPct(0.05));
  for (final id in ['health', 'auto', 'home', 'life']) {
    a.act('insure', () => a.g.toggleInsurance(id));
  }
  for (final c in Catalog.categories) {
    final list = a.g.unlockedAssets(c.id);
    if (list.isNotEmpty && a.g.cash > 4000) {
      a.act('buy:${c.id}', () => a.g.buy(list.first, 3000));
    }
  }
  if (a.g.sportsSlate.isNotEmpty) {
    a.act('bet', () => a.g.placeBet(a.g.sportsSlate.first, true, 200));
  }
  if (a.g.featuredParlays.isNotEmpty) {
    a.act('featured', () => a.g.placeFeatured(a.g.featuredParlays.first, 100));
  }
  for (final e in LifeData.events) {
    if (a.g.standingTier >= e.minTier && a.g.cash > e.cost) {
      a.act('event', () => a.g.attendLifeEvent(e));
    }
    a.advance(1);
  }
  a.act('date', () => a.g.goOnDate());
  a.act('chooseHousing', () => a.g.chooseHousing('two_bed'));
  if (a.g.cash > 30000) {
    a.act('property', () => a.g.buyProperty(
        Properties.ladder.first, Properties.mortgages.first, 0.2));
  }
  if (a.g.cash > 8000) {
    a.act('business', () => a.g.buyBusiness(Businesses.all.first));
  }
  a.runToDeath();
}

// ---------------------------------------------------------------------------

class Res {
  final List<double> finalNW = [];
  final List<double> dd = [];
  final List<bool> bankrupt = [];
  final List<bool> million = [];
  final List<bool> ruined = []; // ended underwater
  final List<int> deathAge = [];
  final List<int> score = [];
  final List<int> millionAge = [];
  final Set<String> covered = {};
  final List<String> bugs = [];
}

void main() {
  test('SHARP PLAYTEST: strategies × full lives — invariants, balance, fun', () {
    const seeds = [
      1, 2, 3, 5, 7, 11, 13, 17, 21, 29, 33, 42, 55, 64, 77, 88, 99, 123, 256,
      404, 512, 777, 1234, 2024
    ];
    final strategies = <String, void Function(LifeAgent)>{
      'Do-nothing (control)': doNothing,
      'Competent (skilled)': competent,
      'FIRE monk (frugal)': fireMonk,
      'Index (insured)': (a) => indexer(a, insured: true),
      'Index (UNINSURED)': (a) => indexer(a, insured: false),
      'Landlord (leverage)': landlord,
      'Crypto degen (all-in)': cryptoDegen,
      'Baller (lifestyle)': baller,
      'Reckless (YOLO)': reckless,
      'Explorer (everything)': explorer,
    };

    final results = <String, Res>{};
    for (final entry in strategies.entries) {
      final r = Res();
      for (final seed in seeds) {
        final a = LifeAgent(seed);
        entry.value(a);
        r.finalNW.add(a.g.netWorth);
        r.dd.add(a.maxDrawdown);
        r.bankrupt.add(a.g.bankruptcies > 0);
        r.million.add(a.millionAge != null);
        r.ruined.add(a.g.netWorth < 0);
        r.deathAge.add(a.deathAge ?? a.g.ageYears);
        r.score.add(a.g.score);
        if (a.millionAge != null) r.millionAge.add(a.millionAge!);
        r.covered.addAll(a.covered);
        r.bugs.addAll(a.bugs);
      }
      results[entry.key] = r;
    }

    // ---- Determinism: same strategy + seed, twice, must match exactly. ----
    final detBugs = <String>[];
    for (final seed in [3, 42, 777]) {
      final a1 = LifeAgent(seed);
      competent(a1);
      final a2 = LifeAgent(seed);
      competent(a2);
      if ((a1.g.netWorth - a2.g.netWorth).abs() > 1.0 ||
          a1.g.score != a2.g.score ||
          a1.g.bankruptcies != a2.g.bankruptcies ||
          (a1.deathAge ?? 0) != (a2.deathAge ?? 0)) {
        detBugs.add('seed $seed: rerun diverged '
            '(${a1.g.netWorth.toStringAsFixed(0)} vs ${a2.g.netWorth.toStringAsFixed(0)})');
      }
    }

    final b = StringBuffer()
      ..writeln('\n================== SHARP PLAYTEST ==================')
      ..writeln('${seeds.length} seeds × ${strategies.length} strategies, '
          'each a full life (18 → death).\n')
      ..writeln('STRATEGY                     med.networth   p90.networth  '
          '\$1M%  bankrupt  ruined  med.age  med.score  med.\$1M@  med.maxDD');
    final medians = <String, double>{};
    for (final e in results.entries) {
      final r = e.value;
      final m = median(r.finalNW);
      medians[e.key] = m;
      b.writeln('  ${e.key.padRight(26)} '
          '${usd(m).padLeft(11)}  '
          '${usd(percentile(r.finalNW, 0.9)).padLeft(12)}  '
          '${pctTrue(r.million).toStringAsFixed(0).padLeft(4)}%  '
          '${pctTrue(r.bankrupt).toStringAsFixed(0).padLeft(7)}%  '
          '${pctTrue(r.ruined).toStringAsFixed(0).padLeft(5)}%  '
          '${median(r.deathAge.map((x) => x.toDouble()).toList()).toStringAsFixed(0).padLeft(6)}  '
          '${median(r.score.map((x) => x.toDouble()).toList()).toStringAsFixed(0).padLeft(8)}  '
          '${(r.millionAge.isEmpty ? 0 : median(r.millionAge.map((x) => x.toDouble()).toList())).toStringAsFixed(0).padLeft(7)}  '
          '${(median(r.dd) * 100).toStringAsFixed(0).padLeft(7)}%');
    }

    // ---- Balance scorecard ----
    final allBugs = [...results.values.expand((r) => r.bugs), ...detBugs];
    final allCovered = results.values.expand((r) => r.covered).toSet();
    final positiveMedians = (medians.values.where((v) => v > 1000).toList()
      ..sort())
        .reversed
        .toList();
    final dominantRatio = positiveMedians.length >= 2
        ? positiveMedians[0] / positiveMedians[1]
        : double.infinity;
    final spreadRatio =
        positiveMedians.isEmpty ? 0 : positiveMedians[0] / median(positiveMedians);
    final cryptoMed = medians['Crypto degen (all-in)'] ?? 0;
    final cryptoP90 = percentile(results['Crypto degen (all-in)']!.finalNW, 0.9);
    // Compare crypto to the BEST non-crypto median (the strongest safe play),
    // not a conservatively-played index — that's the fair "is it a gamble?" bar.
    final bestSafe = medians.entries
        .where((e) => !e.key.contains('Crypto') && e.value > 1000)
        .map((e) => e.value)
        .fold(1.0, (a, c) => c > a ? c : a);
    final cryptoRatio = cryptoMed / bestSafe;
    final cryptoTail = cryptoP90 / bestSafe;
    final insRuin = pctTrue(results['Index (insured)']!.ruined);
    final uninsRuin = pctTrue(results['Index (UNINSURED)']!.ruined);
    final competentBankrupt = pctTrue(results['Competent (skilled)']!.bankrupt);
    final competentRuined = pctTrue(results['Competent (skilled)']!.ruined);
    final allDeath = results.values
        .expand((r) => r.deathAge)
        .map((x) => x.toDouble())
        .toList();
    final medDeath = median(allDeath);

    String grade(bool ok) => ok ? 'PASS' : '⚠ FAIL';
    b
      ..writeln('\n--- BALANCE SCORECARD ---')
      ..writeln('[invariants] no bugs/violations (${allBugs.length})        '
          '${grade(allBugs.isEmpty)}')
      ..writeln('[determinism] reruns identical (${detBugs.length} diverged) '
          '${grade(detBugs.isEmpty)}')
      ..writeln('[lifespan] median death age 76–86: ${medDeath.toStringAsFixed(0)}            '
          '${grade(medDeath >= 76 && medDeath <= 86)}')
      ..writeln('[crypto gamble] median 0.4–1.2x best-safe: ${cryptoRatio.toStringAsFixed(2)}x  '
          '(p90 tail ${cryptoTail.toStringAsFixed(1)}x)  '
          '${grade(cryptoRatio >= 0.4 && cryptoRatio <= 1.2 && cryptoTail >= 2.0)}')
      ..writeln('[no dominant] top median ≤ 3.5x the 2nd: ${dominantRatio.toStringAsFixed(2)}x   '
          '${grade(dominantRatio <= 3.5)}')
      ..writeln('[depth] strategies diverge (top ÷ median): ${spreadRatio.toStringAsFixed(1)}x  '
          '${grade(spreadRatio >= 3)}')
      ..writeln('[insurance] cuts ruin: insured ${insRuin.toStringAsFixed(0)}% < '
          'uninsured ${uninsRuin.toStringAsFixed(0)}%    '
          '${grade(uninsRuin >= insRuin)}')
      ..writeln('[skill rewarded] competent bankrupt ≤ 35%: '
          '${competentBankrupt.toStringAsFixed(0)}% (ruined ${competentRuined.toStringAsFixed(0)}%)  '
          '${grade(competentBankrupt <= 35)}')
      ..writeln('[coverage] systems exercised: ${allCovered.length}            '
          '${grade(allCovered.length >= 20)}')
      ..writeln('\nBUGS (${allBugs.length}):');
    for (final x in allBugs.take(30)) {
      b.writeln('  ❌ $x');
    }
    b.writeln('===================================================\n');

    // ignore: avoid_print
    print(b.toString());

    // Hard guards (balance flags are informational; correctness is not).
    expect(allBugs, isEmpty, reason: 'invariant/determinism violations');
    expect(allCovered.length, greaterThanOrEqualTo(20));
    expect(medDeath, greaterThan(72));
  }, timeout: const Timeout(Duration(minutes: 8)));
}
