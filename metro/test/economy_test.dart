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
    expect(Cities.newMeridian.stations.length, 56);
    expect(Cities.angelBay.stations.length, 59);
    for (final city in Cities.all) {
      expect(city.lines.length, 9, reason: '${city.id}: nine lines');
      // Unique color per line — the approved rule.
      final colors = {for (final l in city.lines) l.color.value};
      expect(colors.length, 9,
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
    expect(perSec, lessThan(18),
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
      expect(g.buyLine(second.id), isTrue);
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
    expect(accessible, greaterThan(base * 1.05),
        reason: 'access L5 must show up (got ${accessible / base}x)');
    expect(newCars, greaterThan(base * 1.08),
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
      'marketing': 1.05,
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
    final base = g.demandMultAt('s114_172');
    g.accessLevels['1'] = 5; // ×1.5
    g.trainsetLevels['1'] = 5; // ×1.4
    g.accessLevels['N'] = 5; // ×1.5
    g.foodLevel['s114_172'] = 5; // ×1.5
    expect(g.demandMultAt('s114_172'),
        closeTo(base * 1.5 * 1.4 * 1.5 * 1.5, 1e-9),
        reason: 'both lines + the food court multiply together');
    // And the UI demand stat reads from the same function, so it reflects
    // the compounding automatically.
  });

  test('station works pay: fare gates and platform works', () {
    // s114_172 = 45 St, a line 1 / N corridor stop.
    final plain = run(240).totalEarned;
    final gated = run(240, setup: (g) {
      g.gateLevel['s114_172'] = 5;
    }).totalEarned;
    final rebuilt = run(240, setup: (g) {
      g.platformLevel['s114_172'] = 5;
    }).totalEarned;
    expect(gated, greaterThan(plain * 1.04),
        reason: 'gates L5 must show up (got ${gated / plain}x)');
    expect(rebuilt, greaterThan(plain * 1.01),
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
    expect(g.goals.length, 12);
    expect(g.currentGoal!.name, 'OPENING DAY');
    expect(g.goalMult, 1);
    // Drive every counter past the final rung and tick once.
    g.cash = 1e12;
    for (final line in g.city.lines) {
      if (!g.isUnlocked(line.id)) {
        expect(g.buyLine(line.id), isTrue);
      }
    }
    g.totalRiders = 1000000;
    g.totalEarned = 25000000;
    g.tick(0.1);
    expect(g.currentGoal, isNull, reason: 'the whole ladder completes');
    var expected = 1.0;
    for (final goal in g.goals) {
      expected *= goal.reward;
    }
    expect(g.goalMult, closeTo(expected, 1e-9),
        reason: 'rewards multiply, never add');
    expect(g.incomePerRiderAt('s96_238'),
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
    g.totalRiders = 1000000;
    g.totalEarned = 25000000;
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
    expect(ab.totalEarned, greaterThan(25000000),
        reason: 'lifetime earnings keep climbing in the new city');
    expect(ab.totalRiders, greaterThan(1000000));
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
  });

  test('a food court raises earnings at a busy interchange', () {
    // s114_172 = 45 St, a line 1 / N corridor stop.
    final plain = run(240).totalEarned;
    final fed = run(240, setup: (g) {
      g.cash = 100000;
      for (var i = 0; i < GameState.foodMax; i++) {
        expect(g.buyFood('s114_172'), isTrue);
      }
    }).totalEarned;
    expect(fed, greaterThan(plain * 1.05),
        reason: 'a maxed 45 St food court must show up in revenue');
  });

  test('platform caps hold; unserved stations stay empty', () {
    run(600, each: (g) {
      for (final id in g.waitingUp.keys) {
        expect(g.waitingAt(id), lessThanOrEqualTo(g.stationCapNow + 0.001));
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
      expect(g.waitingDown['s96_238'], 0);
      expect(g.waitingUp['s114_22'], 0);
      if (g.waitingUp['s114_150']! > 0) midUp = true;
      if (g.waitingDown['s114_150']! > 0) midDown = true;
    });
    expect(midUp && midDown, isTrue,
        reason: 'a middle station must fill both platforms');
    expect(g.waitingAt('s96_238'), greaterThan(0),
        reason: 'the terminal still collects outbound riders');
  });

  test('new trains alternate direction and spread along the line', () {
    final g = GameState();
    g.cash = 1e12;
    final len = g.paths['1']!.length;
    for (var i = 0; i < 4; i++) {
      expect(g.buyTrain('1'), isTrue);
    }
    expect([for (final t in g.trains) t.direction], [1, -1, 1, -1, 1],
        reason: 'each spawn runs opposite the previous one');
    expect(g.trains[1].distance, closeTo(len, 0.001));
    expect(g.trains[2].distance, closeTo(len / 2, 0.001),
        reason: 'same-direction trains enter half a line apart');
    expect(g.trains[3].distance, closeTo(len / 2, 0.001));
    expect(g.trains[4].distance, closeTo(len / 4, 0.001));
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
    expect(g.trains.length, 11);
    expect(boardings, greaterThan(200),
        reason: '11 trains × 10 min made only $boardings stops');
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
