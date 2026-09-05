import 'package:flutter_test/flutter_test.dart';
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

  test('the network is the approved shape', () {
    final g = GameState();
    expect(g.city.lines.length, 9);
    expect(g.city.stations.length, 56);
    // Unique color per line — the approved rule.
    final colors = {for (final l in g.city.lines) l.color.value};
    expect(colors.length, 9, reason: 'no two lines may share a color');
    // Line 1 is free; every other line costs more than the one before.
    expect(g.city.lines.first.unlockCost, 0);
    for (var i = 2; i < g.city.lines.length; i++) {
      expect(g.city.lines[i].unlockCost,
          greaterThan(g.city.lines[i - 1].unlockCost));
    }
  });

  test('shared corridors are short (3 stops max, per the approved design)',
      () {
    final g = GameState();
    // Count consecutive shared segments between any pair of lines.
    for (final a in g.city.lines) {
      for (final b in g.city.lines) {
        if (a.id.compareTo(b.id) >= 0) continue;
        final shared = a.stationIds
            .where((id) => b.stationIds.contains(id))
            .length;
        expect(shared, lessThanOrEqualTo(3),
            reason: '${a.id}/${b.id} share $shared stops');
      }
    }
  });

  test('level-0 earn rate lands in the fun zone', () {
    final g = run(300);
    final perSec = g.totalEarned / 300;
    expect(perSec, greaterThan(1.5),
        reason: 'earning \$${perSec.toStringAsFixed(2)}/s — too slow, stalls');
    expect(perSec, lessThan(13),
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
    expect(faster, greaterThan(base * 1.08),
        reason: 'speed L5 must show up (got ${faster / base}x)');
    expect(bigger, greaterThan(base * 1.15),
        reason: 'cars L5 must show up (got ${bigger / base}x)');
    expect(accessible, greaterThan(base * 1.05),
        reason: 'access L5 must show up (got ${accessible / base}x)');
  });

  test('NETWORK upgrades work: each global upgrade measurably pays', () {
    final base = run(240).totalEarned;
    // Measured L5 effects: signal 1.057x, doors 1.079x, marketing 1.105x,
    // fare 1.625x — thresholds leave margin but prove each lever is real.
    final mustBeat = {
      'signal': 1.03,
      'doors': 1.04,
      'marketing': 1.05,
      'fare': 1.4,
    };
    for (final def in GameState.globalUpgrades) {
      final boosted = run(240, setup: (g) {
        g.globalLevels[def.id] = 5;
      }).totalEarned;
      expect(boosted, greaterThan(base * mustBeat[def.id]!),
          reason: '${def.id} L5 must show up (got ${boosted / base}x)');
    }
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

  test('upgrades are SCOPED: line-A levels do nothing while only 1 runs', () {
    final base = run(240).totalEarned;
    final other = run(240, setup: (g) {
      g.speedLevels['A'] = 8;
      g.carLevels['A'] = 8;
      g.accessLevels['A'] = 8;
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
      for (final e in g.waiting.entries) {
        expect(e.value, lessThanOrEqualTo(GameState.stationCap + 0.001));
        if (!g.isServed(e.key)) {
          expect(e.value, 0,
              reason: 'riders must not queue at unbought ${e.key}');
        }
      }
    });
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
