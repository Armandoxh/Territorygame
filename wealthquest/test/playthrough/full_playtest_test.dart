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

void _buySpare(LifeAgent a, AssetDef def, double buffer) {
  final spare = a.g.cash - buffer;
  if (spare > 500) a.act('buy:${def.categoryId}', () => a.g.buy(def, spare));
}

void _bestCareer(LifeAgent a, {bool topPay = true}) {
  final t = a.g.availableTracks;
  if (t.isNotEmpty) a.act('joinTrack', () => a.g.joinTrack(topPay ? t.last : t.first));
}

AssetDef _byId(String id) =>
    Catalog.assets.firstWhere((x) => x.id == id, orElse: () => Catalog.assets.first);

void cryptoDegen(LifeAgent a) {
  a.act('chooseTransport', () => a.g.chooseTransport('transit'));
  _bestCareer(a);
  while (!a.g.isDead && a.g.ageYears < 110) {
    _buySpare(a, _byId('btq'), 1500);
    a.advance(6);
  }
}

void indexer(LifeAgent a, {bool insured = true}) {
  a.act('enroll', () => a.g.enroll(Catalog.degrees.first));
  a.advance(40);
  _bestCareer(a);
  a.act('401k', () => a.g.setRetirementContribPct(0.10));
  if (insured) {
    a.act('insure-health', () => a.g.toggleInsurance('health'));
    a.act('insure-auto', () => a.g.toggleInsurance('auto'));
    a.act('insure-home', () => a.g.toggleInsurance('home'));
  }
  a.act('chooseHousing', () => a.g.chooseHousing('one_bed'));
  final idx = a.g.unlockedAssets('funds').first;
  while (!a.g.isDead && a.g.ageYears < 110) {
    _buySpare(a, idx, 6000);
    a.advance(6);
  }
}

void landlord(LifeAgent a) {
  _bestCareer(a);
  a.act('insure-health', () => a.g.toggleInsurance('health'));
  a.act('chooseHousing', () => a.g.chooseHousing('roommates'));
  while (!a.g.isDead && a.g.ageYears < 110) {
    if (a.g.cash > 30000 && a.g.properties.length < 6) {
      final def = Properties.ladder.firstWhere(
          (p) => a.g.propertyPriceOf(p.id) * 0.20 < a.g.cash * 0.8,
          orElse: () => Properties.ladder.first);
      a.act('buyProperty', () => a.g.buyProperty(def, Properties.mortgages.first, 0.20));
      if (a.g.properties.isNotEmpty) {
        a.act('toggleRental', () => a.g.toggleRental(a.g.properties.last));
      }
    }
    a.advance(6);
  }
}

void fireMonk(LifeAgent a) {
  _bestCareer(a);
  a.act('chooseHousing', () => a.g.chooseHousing('live_family'));
  a.act('chooseTransport', () => a.g.chooseTransport('bike'));
  a.act('insure-health', () => a.g.toggleInsurance('health'));
  a.act('401k', () => a.g.setRetirementContribPct(0.15));
  final idx = a.g.unlockedAssets('funds').first;
  while (!a.g.isDead && a.g.ageYears < 110) {
    _buySpare(a, idx, 2500);
    a.advance(6);
  }
}

void baller(LifeAgent a) {
  _bestCareer(a);
  a.act('chooseHousing', () => a.g.chooseHousing('luxury'));
  a.act('chooseTransport', () => a.g.chooseTransport('luxury_car'));
  while (!a.g.isDead && a.g.ageYears < 110) {
    if (!a.g.hasPartner) {
      a.act('date', () => a.g.goOnDate());
    } else {
      a.act('marry', () => a.g.proposeMarriage());
      if (a.g.children < 2) a.act('child', () => a.g.haveChild());
    }
    final idx = a.g.unlockedAssets('funds').first;
    _buySpare(a, idx, 8000);
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
  a.act('chooseTransport', () => a.g.chooseTransport('sedan'));
  if (a.g.cash > 30000) {
    a.act('property', () => a.g.buyProperty(
        Properties.ladder.first, Properties.mortgages.first, 0.2));
  }
  if (a.g.cash > 8000) {
    a.act('business', () => a.g.buyBusiness(Businesses.all.first));
  }
  a.runToDeath();
}

void doNothing(LifeAgent a) => a.runToDeath();

// ---------------------------------------------------------------------------

class Result {
  final List<double> finalNW = [];
  final List<double> peak = [];
  final List<double> dd = [];
  final List<bool> bankrupt = [];
  final List<bool> reachedMillion = [];
  final List<int> deathAge = [];
  final List<int> score = [];
  final Set<String> covered = {};
  final List<String> bugs = [];
}

void main() {
  test('FULL PLAYTEST: 8 strategies × full lives — outcomes, coverage, fun', () {
    const seeds = [1, 2, 3, 7, 11, 13, 21, 42, 99, 123, 777, 2024];
    final strategies = <String, void Function(LifeAgent)>{
      'Do-nothing (control)': doNothing,
      'FIRE monk (frugal+index)': fireMonk,
      'Index investor (insured)': (a) => indexer(a, insured: true),
      'Index investor (UNINSURED)': (a) => indexer(a, insured: false),
      'Landlord (leverage)': landlord,
      'Crypto degen (all-in)': cryptoDegen,
      'Baller (lifestyle+family)': baller,
      'Reckless (over-leverage)': reckless,
      'Explorer (everything)': explorer,
    };

    final results = <String, Result>{};
    for (final entry in strategies.entries) {
      final r = Result();
      for (final seed in seeds) {
        final a = LifeAgent(seed);
        entry.value(a);
        r.finalNW.add(a.g.netWorth);
        r.peak.add(a.peak);
        r.dd.add(a.maxDrawdown);
        r.bankrupt.add(a.g.bankruptcies > 0);
        r.reachedMillion.add(a.peak >= 1000000);
        r.deathAge.add(a.deathAge ?? a.g.ageYears);
        r.score.add(a.g.score);
        r.covered.addAll(a.covered);
        r.bugs.addAll(a.bugs);
      }
      results[entry.key] = r;
    }

    final b = StringBuffer()
      ..writeln('\n================= FULL PLAYTEST REPORT =================')
      ..writeln('${seeds.length} seeds × ${strategies.length} strategies, '
          'each a full life (18 → death).\n')
      ..writeln('STRATEGY                         med.networth  '
          'reach\$1M  bankrupt  med.age  med.score  med.maxDD');
    final medians = <String, double>{};
    for (final e in results.entries) {
      final r = e.value;
      final mNW = median(r.finalNW);
      medians[e.key] = mNW;
      b.writeln('  ${e.key.padRight(30)} '
          '${usd(mNW).padLeft(11)}  '
          '${pctTrue(r.reachedMillion).toStringAsFixed(0).padLeft(6)}%  '
          '${pctTrue(r.bankrupt).toStringAsFixed(0).padLeft(7)}%  '
          '${median(r.deathAge.map((x) => x.toDouble()).toList()).toStringAsFixed(0).padLeft(6)}  '
          '${median(r.score.map((x) => x.toDouble()).toList()).toStringAsFixed(0).padLeft(8)}  '
          '${(median(r.dd) * 100).toStringAsFixed(0).padLeft(7)}%');
    }

    // ---- FUN analysis ----
    final allBugs = results.values.expand((r) => r.bugs).toList();
    final allCovered = results.values.expand((r) => r.covered).toSet();
    final realStrats = medians.entries
        .where((e) => !e.key.contains('control'))
        .map((e) => e.value)
        .toList();
    final spread = realStrats.reduce((a, c) => a > c ? a : c) /
        (realStrats.reduce((a, c) => a < c ? a : c).clamp(1, double.infinity));
    final crypto = medians['Crypto degen (all-in)'] ?? 0;
    final index = medians['Index investor (insured)'] ?? 1;
    final insBank = pctTrue(results['Index investor (insured)']!.bankrupt);
    final uninsBank = pctTrue(results['Index investor (UNINSURED)']!.bankrupt);
    final insNW = median(results['Index investor (insured)']!.finalNW);
    final uninsNW = median(results['Index investor (UNINSURED)']!.finalNW);
    final allDeathAges = results.values
        .expand((r) => r.deathAge)
        .map((x) => x.toDouble())
        .toList();

    b
      ..writeln('\n--- FUN / BALANCE READ ---')
      ..writeln('Strategy spread (best median ÷ worst median): '
          '${spread.toStringAsFixed(1)}x  '
          '(higher = strategy choice matters more = more depth)')
      ..writeln('Crypto-degen median vs index median: '
          '${(crypto / index).toStringAsFixed(2)}x  '
          '(want ~0.7–1.5x: a gamble, not a free win)')
      ..writeln('Insurance A/B (index): insured bankrupt ${insBank.toStringAsFixed(0)}% '
          '· uninsured bankrupt ${uninsBank.toStringAsFixed(0)}%  | '
          'median NW insured ${usd(insNW)} vs uninsured ${usd(uninsNW)}')
      ..writeln('Median age at death (all runs): '
          '${median(allDeathAges).toStringAsFixed(0)}  (the clock)')
      ..writeln('Systems covered (${allCovered.length}): '
          '${(allCovered.toList()..sort()).join(', ')}')
      ..writeln('BUGS: ${allBugs.length}');
    for (final x in allBugs.take(25)) {
      b.writeln('  ❌ $x');
    }
    b.writeln('========================================================\n');

    // ignore: avoid_print
    print(b.toString());

    expect(allBugs, isEmpty, reason: 'agent hit ${allBugs.length} bug(s)');
    expect(allCovered.length, greaterThan(18), reason: 'coverage too thin');
    // Lives should end of old age, not in their 50s: median death age sane.
    expect(median(allDeathAges), greaterThan(72),
        reason: 'median death age ${median(allDeathAges)} — health clock too harsh');
  });
}
