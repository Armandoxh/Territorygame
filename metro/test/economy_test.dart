import 'package:flutter_test/flutter_test.dart';
import 'package:metro_magnate/state/game_state.dart';

/// The balance harness for the multi-line system. The sim is fully
/// deterministic — no RNG — so these replay exact worlds. Guards the idle
/// killers: earning too slow/fast, purchases that don't matter, broken
/// offline math, and stuck trains.
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

  test('level-0 earn rate lands in the fun zone', () {
    final g = run(300);
    final perSec = g.totalEarned / 300;
    expect(perSec, greaterThan(1.5),
        reason: 'earning \$${perSec.toStringAsFixed(2)}/s — too slow, stalls');
    expect(perSec, lessThan(10),
        reason: 'earning \$${perSec.toStringAsFixed(2)}/s — too fast, trivial');
  });

  test('the avgRate estimate tracks reality', () {
    final g = run(300);
    final actual = g.totalEarned / 300;
    expect(g.avgRate, closeTo(actual, actual * 0.5));
  });

  test('unlocking a second line clearly raises earnings', () {
    final solo = run(240).totalEarned;
    final duo = run(240, setup: (g) {
      g.cash = 10000;
      expect(g.buyLine('lineA'), isTrue);
    }).totalEarned;
    expect(duo, greaterThan(solo * 1.5),
        reason: 'line A must add real revenue (got ${duo / solo}x)');
  });

  test('a second train on the line raises earnings', () {
    final one = run(240).totalEarned;
    final two = run(240, setup: (g) {
      g.cash = 10000;
      expect(g.buyTrain('line1'), isTrue);
    }).totalEarned;
    expect(two, greaterThan(one * 1.15),
        reason: 'a 2nd train must matter (got ${two / one}x)');
  });

  test('a food court raises earnings at its station', () {
    final plain = run(240).totalEarned;
    final fed = run(240, setup: (g) {
      g.cash = 100000;
      for (var i = 0; i < GameState.foodMax; i++) {
        expect(g.buyFood('union'), isTrue);
      }
    }).totalEarned;
    expect(fed, greaterThan(plain * 1.1),
        reason: 'a maxed Union Sq food court must show up in revenue');
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

  test('every train keeps serving, all lines unlocked (no stuck state)', () {
    final g = GameState();
    g.cash = 1e9;
    g.buyLine('lineA');
    g.buyLine('line7');
    g.buyTrain('line1');
    g.buyTrain('lineA');
    var boardings = 0;
    var lastSeq = 0;
    for (var i = 0; i < 6000; i++) {
      g.tick(0.1);
      if (g.boardSeq != lastSeq) {
        lastSeq = g.boardSeq;
        boardings++;
      }
    }
    expect(boardings, greaterThan(120),
        reason: '5 trains × 10 min made only $boardings stops');
    expect(g.trains.length, 5);
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
          g.cash = 6000;
          g.buyLine('lineA');
        });
    final a = world();
    final b = world();
    expect(a.cash, b.cash);
    expect(a.totalRiders, b.totalRiders);
    expect(a.trains.first.distance, b.trains.first.distance);
  });
}
