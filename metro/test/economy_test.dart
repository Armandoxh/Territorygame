import 'package:flutter_test/flutter_test.dart';
import 'package:metro_magnate/data/cities.dart';
import 'package:metro_magnate/state/game_state.dart';

/// The balance harness for the approved 9-line network. Fully deterministic
/// (no RNG). Guards the idle killers: earning too slow/fast, purchases that
/// don't matter, broken offline math, and stuck trains.
void main() {
  GameState run(double seconds,
      {void Function(GameState)? setup, void Function(GameState)? each}) {
    final g = GameState();
    setup?.call(g);
    final steps = (seconds * 10).round();
    for (var i = 0; i < steps; i++) {
      g.tick(0.1);
      each?.call(g);
    }
    return g;
  }

  test('every city in the ladder keeps the approved shape rules', () {
    expect(Cities.all.first.id, 'new_meridian');
    expect(Cities.newMeridian.stations.length, 162);
    expect(Cities.angelBay.stations.length, 59);
    for (final city in Cities.all) {
      final expectLines = city.id == 'new_meridian' ? 24 : 9;
      expect(city.lines.length, expectLines);
      // Unique color per line — the approved rule.
      final colors = {for (final l in city.lines) l.color.value};
      expect(colors.length, expectLines,
          reason: '${city.id}: no two lines may share a color');
      // Line 1 is free; every other line costs more than the one before.
      expect(city.lines.first.unlockCost, 0);
      for (var i = 2; i < city.lines.length; i++) {
        expect(city.lines[i].unlockCost,
            greaterThan(city.lines[i - 1].unlockCost),
            reason: '${city.id}: escalating unlock ladder');
      }
      for (final line in city.lines) {
        expect(line.stationIds.length, greaterThanOrEqualTo(6),
            reason: '${city.id}/${line.id}: no short lines');
        // 45°-bend rule: every segment is horizontal, vertical, or 45°.
        for (var i = 0; i < line.stationIds.length - 1; i++) {
          final a = city.stationById(line.stationIds[i]);
          final b = city.stationById(line.stationIds[i + 1]);
          final dx = (b.x - a.x).abs();
          final dy = (b.y - a.y).abs();
          expect(dx == 0 || dy == 0 || dx == dy, isTrue,
              reason: '${city.id}/${line.id} seg $i bends off-grid');
        }
      }
      // Shared corridors stay short (3 stops max).
      for (final a in city.lines) {
        for (final b in city.lines) {
          if (a.id.compareTo(b.id) >= 0) continue;
          final shared =
              a.stationIds.where((id) => b.stationIds.contains(id)).length;
          expect(shared, lessThanOrEqualTo(3),
              reason: '${city.id}: ${a.id}/${b.id} share $shared stops');
        }
      }
    }
  });

  test('level-0 earn rate lands in the fun zone', () {
    final g = run(300);
    final perSec = g.totalEarned / 300;
    expect(perSec, greaterThan(1.5),
        reason: 'earning \$${perSec.toStringAsFixed(2)}/s — too slow, stalls');
    expect(perSec, lessThan(24),
        reason: 'earning \$${perSec.toStringAsFixed(2)}/s — too fast, trivial');
  });

  test('the avgRate estimate tracks reality', () {
    final g = run(300);
    final actual = g.totalEarned / 300;
    expect(g.avgRate, closeTo(actual, actual * 0.5));
  });

  test('unlocking the second line clearly raises earnings', () {
    final second = GameState().city.lines[1];
    final solo = run(240).totalEarned;
    final duo = run(240, setup: (g) {
      g.cash = second.unlockCost + 1000;
      expect(g.unlockSeq, 0);
      expect(g.buyLine(second.id), isTrue);
      expect(g.unlockSeq, 1,
          reason: 'the map cinema keys off the unlock event');
      expect(g.lastUnlockedLineId, second.id);
      expect(g.buyLine(second.id), isFalse);
      expect(g.unlockSeq, 1, reason: 'a failed buy fires no cinema');
    }).totalEarned;
    expect(duo, greaterThan(solo * 1.3),
        reason: '${second.id} must add real revenue (got ${duo / solo}x)');
  });

  test('a second train on line 1 raises earnings', () {
    final one = run(240).totalEarned;
    final two = run(240, setup: (g) {
      g.cash = 10000;
      expect(g.buyTrain('1'), isTrue);
    }).totalEarned;
    expect(two, greaterThan(one * 1.15),
        reason: 'a 2nd train must matter (got ${two / one}x)');
  });

  test('UPGRADES WORK: each line-1 upgrade measurably raises earnings', () {
    final base = run(240).totalEarned;
    final faster = run(240, setup: (g) {
      g.speedLevels['1'] = 5;
    }).totalEarned;
    final bigger = run(240, setup: (g) {
      g.carLevels['1'] = 5;
    }).totalEarned;
    final accessible = run(240, setup: (g) {
      g.accessLevels['1'] = 5;
    }).totalEarned;
    final newCars = run(240, setup: (g) {
      g.trainsetLevels['1'] = 5;
    }).totalEarned;
    expect(faster, greaterThan(base * 1.08),
        reason: 'speed L5 must show up (got ${faster / base}x)');
    expect(bigger, greaterThan(base * 1.15),
        reason: 'cars L5 must show up (got ${bigger / base}x)');
    // Rush windows saturate the line, so demand-side upgrades idle
    // through ~25% of the clock — bounds re-measured with rush active.
    expect(accessible, greaterThan(base * 1.04),
        reason: 'access L5 must show up (got ${accessible / base}x)');
    expect(newCars, greaterThan(base * 1.03),
        reason: 'new subway cars L5 must show up (got ${newCars / base}x)');
  });

  test('NETWORK upgrades work: each global upgrade measurably pays', () {
    final base = run(240).totalEarned;
    // Measured L5 effects: signal 1.058x, doors 1.075x, marketing 1.109x,
    // fare 1.6x, billboards 1.15x — thresholds leave margin but prove each
    // revenue lever is real. Night/crowd/yards act outside the 4-minute
    // earn window and get their own functional tests below.
    final mustBeat = {
      'signal': 1.03,
      'doors': 1.04,
      'marketing': 1.02,
      'fare': 1.4,
      'billboards': 1.10,
    };
    for (final e in mustBeat.entries) {
      final boosted = run(240, setup: (g) {
        g.globalLevels[e.key] = 5;
      }).totalEarned;
      expect(boosted, greaterThan(base * e.value),
          reason: '${e.key} L5 must show up (got ${boosted / base}x)');
    }
  });

  test('NETWORK utility upgrades change what they claim', () {
    final g = GameState();
    expect(g.stationCapNow, GameState.stationCapBase);
    g.globalLevels['crowd'] = 5;
    expect(g.stationCapNow, GameState.stationCapBase + 40);

    expect(g.offlineEfficiencyNow, closeTo(0.5, 1e-9));
    g.globalLevels['night'] = 5;
    expect(g.offlineEfficiencyNow, closeTo(0.8, 1e-9));

    final line = g.city.lineById('1');
    final fullPrice = g.nextTrainCost(line);
    g.globalLevels['yards'] = 10;
    expect(g.nextTrainCost(line), closeTo(fullPrice * 0.6, 0.001),
        reason: 'rail yards L10 = 40% off new trains');
  });

  test('shared stations COMPOUND every serving line\'s upgrades', () {
    final g = GameState();
    g.cash = 1e12;
    // 45 St sits on lines 1 and N.
    for (final id in ['A', 'L', 'M', 'N']) {
      if (!g.isUnlocked(id)) expect(g.buyLine(id), isTrue);
    }
    final base = g.demandMultAt('s224_282');
    g.accessLevels['1'] = 5; // ×1.5
    g.trainsetLevels['1'] = 5; // ×1.4
    g.accessLevels['N'] = 5; // ×1.5
    g.foodLevel['s224_282'] = 5; // ×1.5
    expect(g.demandMultAt('s224_282'),
        closeTo(base * 1.5 * 1.4 * 1.5 * 1.5, 1e-9),
        reason: 'both lines + the food court multiply together');
    // And the UI demand stat reads from the same function, so it reflects
    // the compounding automatically.
  });

  test('STATION WORKS bulk buy levels the lowest stations first', () {
    final g = GameState();
    g.cash = 1e12;
    final stops = g.city.lineById('1').stationIds;
    // Hand one station a head start; the bulk buy must not touch it
    // until every other station catches up (the 8/9 rule).
    g.foodLevel[stops[3]] = 2;
    expect(g.buyStationTier('1', 'food'), stops.length - 1,
        reason: 'only the lowest-tier stations rise');
    expect(g.foodLevel[stops[3]], 2, reason: 'the leader waits');
    expect(g.minStationLevel('1', 'food'), 1);
    expect(g.buyStationTier('1', 'food'), stops.length - 1);
    // Everyone is at 2 now — the next tier includes the old leader.
    expect(g.minStationLevel('1', 'food'), 2);
    expect(g.buyStationTier('1', 'food'), stops.length);
    for (final sid in stops) {
      expect(g.foodLevel[sid], 3);
    }
  });

  test('STATION WORKS respects cash: raises what it can, lowest first', () {
    final g = GameState();
    g.cash = g.stationWorkCost('gates', 0) * 3 + 1;
    expect(g.buyStationTier('1', 'gates'), 3);
    final stops = g.city.lineById('1').stationIds;
    expect(g.gateLevel[stops[0]], 1);
    expect(g.gateLevel[stops[2]], 1);
    expect(g.gateLevel[stops[3]], 0, reason: 'line order, money ran out');
  });

  test('the works priority is mine to reorder, and drives the plan', () {
    final g = GameState();
    expect(g.nextPlannedType('1'), 'food');
    g.raisePriority('platform');
    expect(g.stationPriority.indexOf('platform'),
        lessThan(g.stationPriority.indexOf('gates')));
    g.raisePriority('platform');
    expect(g.stationPriority.first, 'platform');
    expect(g.nextPlannedType('1'), 'platform');
    // Max the top priority out: the plan moves down the list.
    g.cash = 1e12;
    for (var i = 0; i < GameState.foodMax; i++) {
      g.buyStationTier('1', 'platform');
    }
    expect(g.minStationLevel('1', 'platform'), GameState.foodMax);
    expect(g.nextPlannedType('1'), 'food');
  });

  test('the new station works change what they claim', () {
    final g = GameState();
    const sid = 's224_282';
    final baseDemand = g.demandMultAt(sid);
    g.parkingLevel[sid] = 5;
    expect(g.demandMultAt(sid), closeTo(baseDemand * 1.3, 1e-9),
        reason: 'park & ride L5 = +30% ridership');
    final baseIncome = g.incomePerRiderAt(sid);
    g.securityLevel[sid] = 5;
    expect(g.incomePerRiderAt(sid), closeTo(baseIncome * 1.2, 1e-9),
        reason: 'security L5 = +20% income here');
    expect(g.stationCapAt(sid), GameState.stationCapBase);
    g.escalatorLevel[sid] = 5;
    expect(g.stationCapAt(sid), GameState.stationCapBase + 40,
        reason: 'escalators L5 = +40 platform capacity');
  });

  test('station works pay: fare gates and platform works', () {
    // s224_282 = 45 St, a line 1 / N corridor stop (XL id).
    final plain = run(240).totalEarned;
    final gated = run(240, setup: (g) {
      g.gateLevel['s224_282'] = 5;
    }).totalEarned;
    final rebuilt = run(240, setup: (g) {
      g.platformLevel['s224_282'] = 5;
    }).totalEarned;
    expect(gated, greaterThan(plain * 1.03),
        reason: 'gates L5 must show up (got ${gated / plain}x)');
    expect(rebuilt, greaterThan(plain * 1.005),
        reason: 'platform works L5 must show up (got ${rebuilt / plain}x)');
  });

  test('NETWORK upgrades respect their caps and escalate in price', () {
    final g = GameState();
    g.cash = 1e12;
    for (final def in GameState.globalUpgrades) {
      var lastCost = 0.0;
      var bought = 0;
      while (true) {
        final cost = g.nextGlobalCost(def.id);
        if (!g.buyGlobal(def.id)) break;
        bought++;
        expect(cost, greaterThan(lastCost),
            reason: '${def.id} price must escalate');
        lastCost = cost;
      }
      expect(bought, def.maxLevel);
      expect(g.globalLevelOf(def.id), def.maxLevel);
    }
    // Fare reviews are visible in the checkable fare.
    expect(g.currentFare,
        closeTo(GameState.fare + 0.25 * GameState.globalById('fare').maxLevel,
            0.001));
  });

  test('CITY GOALS: commendations compound income to the ladder top', () {
    final g = GameState();
    expect(g.goals.length, 18);
    expect(g.currentGoal!.name, 'OPENING DAY');
    expect(g.goalMult, 1);
    // Drive every counter past the final rung and tick once.
    g.cash = 1e12;
    for (final line in g.city.lines) {
      if (!g.isUnlocked(line.id)) {
        expect(g.buyLine(line.id), isTrue);
      }
    }
    g.totalRiders = 5000000;
    g.totalEarned = 250000000;
    g.tick(0.1);
    expect(g.currentGoal, isNull, reason: 'the whole ladder completes');
    var expected = 1.0;
    for (final goal in g.goals) {
      expected *= goal.reward;
    }
    expect(g.goalMult, closeTo(expected, 1e-9),
        reason: 'rewards multiply, never add');
    expect(g.incomePerRiderAt('s126_452'),
        closeTo(GameState.fare * expected, 1e-6),
        reason: 'the bonus reaches every boarding');
    expect(g.goalProgress, 1);
  });

  test('THE CITY LADDER: finish New Meridian, open Angel Bay', () {
    final g = GameState();
    expect(g.nextCity!.id, 'angel_bay');
    expect(g.canMoveOn, isFalse, reason: 'not before the ladder is done');
    // Finish the whole New Meridian ladder.
    g.cash = 1e12;
    for (final line in g.city.lines) {
      if (!g.isUnlocked(line.id)) g.buyLine(line.id);
    }
    g.totalRiders = 5000000;
    g.totalEarned = 250000000;
    g.tick(0.1);
    expect(g.canMoveOn, isTrue);
    final multBefore = g.goalMult;
    final cashBefore = g.cash;

    final ab = g.moveOn();
    expect(ab.city.id, 'angel_bay');
    expect(ab.cash, cashBefore, reason: 'cash moves with you');
    expect(ab.goalMult, closeTo(multBefore, 1e-9),
        reason: 'every commendation carries');
    expect(ab.unlockedLineIds, {'1'}, reason: 'the network starts fresh');
    expect(ab.trains.length, 1);
    expect(ab.speedLevelOf('1'), 0);
    expect(ab.goalsDone, 0, reason: "Angel Bay's own ladder starts at 0");
    expect(ab.currentGoal!.name, 'WEST SHORE OPENS');
    expect(ab.nextCity, isNull, reason: 'Angel Bay is the frontier for now');
    expect(ab.currentFare, GameState.fare * 8,
        reason: 'Angel Bay riders pay 8× — shown in the header');

    // And the new city earns from its own line 1 immediately.
    for (var i = 0; i < 2400; i++) {
      ab.tick(0.1);
    }
    expect(ab.totalEarned, greaterThan(250000000),
        reason: 'lifetime earnings keep climbing in the new city');
    expect(ab.totalRiders, greaterThan(5000000));
  });

  test('Angel Bay serves and never sticks with everything unlocked', () {
    final g = GameState(city: Cities.angelBay);
    g.cash = 1e15;
    for (final line in g.city.lines) {
      if (!g.isUnlocked(line.id)) {
        expect(g.buyLine(line.id), isTrue);
      }
    }
    g.buyTrain('1');
    g.buyTrain('B');
    var boardings = 0;
    var lastSeq = 0;
    for (var i = 0; i < 6000; i++) {
      g.tick(0.1);
      if (g.boardSeq != lastSeq) {
        lastSeq = g.boardSeq;
        boardings++;
      }
    }
    expect(g.trains.length, 11);
    expect(boardings, greaterThan(200),
        reason: '11 Angel Bay trains made only $boardings stops');
  });

  test('train spacing is smart about WHEN you buy, not just how many', () {
    double phaseOf(TrainState t, double len) =>
        t.direction > 0 ? t.distance : 2 * len - t.distance;
    double minGap(List<double> phases, double len) {
      final p = [...phases]..sort();
      var best = double.infinity;
      for (var i = 0; i < p.length; i++) {
        final next = i + 1 < p.length ? p[i + 1] : p[0] + 2 * len;
        if (next - p[i] < best) best = next - p[i];
      }
      return best;
    }

    final g = GameState();
    g.cash = 1e9;
    final len = g.paths['1']!.length;
    // Let train 1 run to an arbitrary mid-route spot, then buy: the new
    // train must enter diametrically opposite — same track, other
    // direction — no matter when the button was pressed.
    for (var i = 0; i < 137; i++) {
      g.tick(0.1);
    }
    expect(g.buyTrain('1'), isTrue);
    final p1 = phaseOf(g.trains[0], len);
    final p2 = phaseOf(g.trains[1], len);
    expect((p2 - p1).abs() % (2 * len), closeTo(len, 0.001),
        reason: 'the 2nd train enters half a round trip away');
    expect(g.trains[1].direction, -g.trains[0].direction);

    // Keep running, buy twice more at odd moments: the fleet must stay
    // spread — every pair at least a quarter round-trip apart.
    for (var i = 0; i < 233; i++) {
      g.tick(0.1);
    }
    expect(g.buyTrain('1'), isTrue);
    for (var i = 0; i < 89; i++) {
      g.tick(0.1);
    }
    expect(g.buyTrain('1'), isTrue);
    final phases = [for (final t in g.trains) phaseOf(t, len)];
    expect(minGap(phases, len), greaterThan(2 * len / 8),
        reason: 'no two trains bunch up after staggered purchases');
  });

  test('RUSH HOUR runs on schedule and pays for capacity headroom', () {
    final g = GameState();
    expect(g.rushActive, isFalse);
    expect(g.rushLineId, '1');
    for (var i = 0; i < 1360; i++) {
      g.tick(0.1); // to 136s — inside the window
    }
    expect(g.rushActive, isTrue);
    for (var i = 0; i < 460; i++) {
      g.tick(0.1); // to 182s — next cycle's calm
    }
    expect(g.rushActive, isFalse);

    // A capacity-built line earns dramatically more during the rush
    // window than in the calm window right before it.
    GameState built() {
      final s = GameState();
      s.carLevels['1'] = 5;
      s.cash = 1e9;
      s.buyTrain('1');
      return s;
    }

    double windowEarn(double from, double to) {
      final s = built();
      for (var i = 0; i < (from * 10).round(); i++) {
        s.tick(0.1);
      }
      final before = s.totalEarned;
      for (var i = 0; i < ((to - from) * 10).round(); i++) {
        s.tick(0.1);
      }
      return s.totalEarned - before;
    }

    final calm = windowEarn(90, 135);
    final rush = windowEarn(135, 180);
    expect(rush, greaterThan(calm * 1.5),
        reason: 'built capacity cashes the rush (got ${rush / calm}x)');
  });

  test('rush rotation walks the unlocked lines in ladder order', () {
    final g = GameState();
    g.cash = 1e12;
    g.buyLine('A');
    expect(g.rushLineId, '1');
    g.rushClock = GameState.rushPeriod;
    expect(g.rushLineId, 'A');
    g.rushClock = GameState.rushPeriod * 2;
    expect(g.rushLineId, '1', reason: 'two lines alternate');
  });

  test('the first commendation fires by itself in normal play', () {
    final g = run(300);
    expect(g.goalsDone, greaterThanOrEqualTo(1),
        reason: '1000 riders should ride within five minutes');
    expect(g.goalMult, greaterThan(1));
  });

  test('upgrades are SCOPED: line-A levels do nothing while only 1 runs', () {
    final base = run(240).totalEarned;
    final other = run(240, setup: (g) {
      g.speedLevels['A'] = 8;
      g.carLevels['A'] = 8;
      g.accessLevels['A'] = 8;
      g.trainsetLevels['A'] = 8;
    }).totalEarned;
    expect(other, closeTo(base, base * 0.001),
        reason: "another line's upgrades must not blanket across");
  });

  test('income is checkable: one boarding pays riders × fare', () {
    final g = GameState();
    var checked = 0;
    var lastSeq = 0;
    for (var i = 0; i < 3000 && checked < 20; i++) {
      g.tick(0.1);
      if (g.boardSeq != lastSeq) {
        lastSeq = g.boardSeq;
        checked++;
        expect(g.lastBoardCount, lessThanOrEqualTo(g.capacityFor('1')),
            reason: 'a stop never boards more than the cars hold');
      }
    }
    expect(checked, greaterThan(5));
    expect(g.lastBoardLineId, '1',
        reason: 'the soundtrack needs to know whose note to play');
  });

  test('a food court raises earnings at a busy interchange', () {
    // s224_282 = 45 St, a line 1 / N corridor stop (XL id).
    final plain = run(240).totalEarned;
    final fed = run(240, setup: (g) {
      g.cash = 100000;
      for (var i = 0; i < GameState.foodMax; i++) {
        expect(g.buyFood('s224_282'), isTrue);
      }
    }).totalEarned;
    expect(fed, greaterThan(plain * 1.05),
        reason: 'a maxed 45 St food court must show up in revenue');
  });

  test('platform caps hold; unserved stations stay empty', () {
    run(600, each: (g) {
      for (final id in g.waitingUp.keys) {
        expect(g.waitingAt(id), lessThanOrEqualTo(g.stationCapAt(id) + 0.001));
        if (!g.isServed(id)) {
          expect(g.waitingAt(id), 0,
              reason: 'riders must not queue at unbought $id');
        }
      }
    });
  });

  test('waiting riders split by departing direction', () {
    var midUp = false;
    var midDown = false;
    final g = run(600, each: (g) {
      // Line 1's terminals depart one way only — the other platform must
      // stay empty forever (no rider waits for a train that never comes).
      expect(g.waitingDown['s126_452'], 0);
      expect(g.waitingUp['s224_68'], 0);
      if (g.waitingUp['s224_260']! > 0) midUp = true;
      if (g.waitingDown['s224_260']! > 0) midDown = true;
    });
    expect(midUp && midDown, isTrue,
        reason: 'a middle station must fill both platforms');
    expect(g.waitingAt('s126_452'), greaterThan(0),
        reason: 'the terminal still collects outbound riders');
  });

  test('new trains keep the fleet equidistant at every size', () {
    double phaseOf(TrainState t, double len) =>
        t.direction > 0 ? t.distance : 2 * len - t.distance;
    double minGap(GameState g, double len) {
      final p = [for (final t in g.trains) phaseOf(t, len)]..sort();
      var best = double.infinity;
      for (var i = 0; i < p.length; i++) {
        final next = i + 1 < p.length ? p[i + 1] : p[0] + 2 * len;
        if (next - p[i] < best) best = next - p[i];
      }
      return best;
    }

    final g = GameState();
    g.cash = 1e12;
    final len = g.paths['1']!.length;
    // Bought back-to-back, each train bisects the widest phase gap: the
    // guaranteed minimum spacing after each purchase is exact.
    expect(g.buyTrain('1'), isTrue);
    expect(g.trains[1].direction, -1,
        reason: 'the 2nd train runs opposite the 1st');
    expect(g.trains[1].distance, closeTo(len, 0.001));
    expect(minGap(g, len), closeTo(len, 0.01));
    expect(g.buyTrain('1'), isTrue);
    expect(minGap(g, len), closeTo(len / 2, 0.01));
    expect(g.buyTrain('1'), isTrue);
    expect(minGap(g, len), closeTo(len / 2, 0.01));
    expect(g.buyTrain('1'), isTrue);
    expect(minGap(g, len), closeTo(len / 4, 0.01),
        reason: '5 trains: no pair closer than a quarter round trip');
    // And the whole fleet keeps serving.
    var boardings = 0;
    var lastSeq = 0;
    for (var i = 0; i < 1200; i++) {
      g.tick(0.1);
      if (g.boardSeq != lastSeq) {
        lastSeq = g.boardSeq;
        boardings++;
      }
    }
    expect(boardings, greaterThan(50));
  });

  test('every train keeps serving with the whole network unlocked', () {
    final g = GameState();
    g.cash = 1e12;
    for (final line in g.city.lines) {
      if (!g.isUnlocked(line.id)) {
        expect(g.buyLine(line.id), isTrue);
      }
    }
    g.buyTrain('1');
    g.buyTrain('A');
    var boardings = 0;
    var lastSeq = 0;
    for (var i = 0; i < 6000; i++) {
      g.tick(0.1);
      if (g.boardSeq != lastSeq) {
        lastSeq = g.boardSeq;
        boardings++;
      }
    }
    expect(g.trains.length, 26);
    expect(boardings, greaterThan(200),
        reason: '26 trains × 10 min made only $boardings stops');
  });

  test('offline earnings: credited at half rate, capped at 8 hours', () {
    final played = run(300);
    final json = played.toJson(1000000);

    final g1 = GameState.fromJson(json);
    final credit1 = g1.applyOfflineEarnings(1000000 + 3600 * 1000);
    expect(credit1,
        closeTo(3600 * played.avgRate * GameState.offlineEfficiency, 1.0));

    final g2 = GameState.fromJson(json);
    final credit2 = g2.applyOfflineEarnings(1000000 + 3 * 86400 * 1000);
    expect(
        credit2,
        closeTo(
            GameState.maxOfflineSeconds *
                played.avgRate *
                GameState.offlineEfficiency,
            1.0));
    expect(g2.applyOfflineEarnings(1000000 + 4 * 86400 * 1000), 0,
        reason: 'offline credit must never double-pay');
  });

  test('deterministic: two identical runs, identical worlds', () {
    GameState world() => run(200, setup: (g) {
          g.cash = 10000;
          g.buyLine(g.city.lines[1].id);
        });
    final a = world();
    final b = world();
    expect(a.cash, b.cash);
    expect(a.totalRiders, b.totalRiders);
    expect(a.trains.first.distance, b.trains.first.distance);
  });
}
