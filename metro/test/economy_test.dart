import 'package:flutter_test/flutter_test.dart';
import 'package:metro_magnate/state/game_state.dart';

/// The balance harness, from commit 1 (house rule by now). The sim is fully
/// deterministic — no RNG — so these replay exact worlds. Guards the idle
/// killers: earning too slow (stall), too fast (trivial), upgrades that don't
/// matter, and broken offline math.
void main() {
  /// Run a fresh world for [seconds] of sim time in 0.1s steps.
  GameState run(double seconds, {void Function(GameState)? each}) {
    final g = GameState();
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
    // First upgrade is $150: should arrive within roughly the first minute,
    // never instantly.
    expect(perSec, greaterThan(1.5),
        reason: 'earning \$${perSec.toStringAsFixed(2)}/s — too slow, stalls');
    expect(perSec, lessThan(10),
        reason: 'earning \$${perSec.toStringAsFixed(2)}/s — too fast, trivial');
  });

  test('the avgRate estimate tracks reality', () {
    final g = run(300);
    final actual = g.totalEarned / 300;
    expect(g.avgRate, closeTo(actual, actual * 0.5),
        reason: 'header/offline rate must be in the ballpark of true earnings');
  });

  test('maxed upgrades pay meaningfully more than level 0', () {
    final base = run(240).totalEarned;
    final g = GameState()
      ..speedLevel = GameState.levelMax
      ..capacityLevel = GameState.levelMax
      ..accessLevel = GameState.levelMax;
    for (var i = 0; i < 2400; i++) {
      g.tick(0.1);
    }
    expect(g.totalEarned, greaterThan(base * 1.8),
        reason: 'maxed system must clearly out-earn the starter system');
    expect(g.totalEarned, lessThan(base * 20),
        reason: 'upgrade power must stay bounded');
  });

  test('platforms cap — waiting riders never exceed the station cap', () {
    run(600, each: (g) {
      for (final w in g.waiting) {
        expect(w, lessThanOrEqualTo(GameState.stationCap + 0.001));
      }
    });
  });

  test('the train keeps serving stations forever (no stuck state)', () {
    final g = GameState();
    var boardings = 0;
    var lastSeq = 0;
    for (var i = 0; i < 6000; i++) {
      g.tick(0.1);
      if (g.boardSeq != lastSeq) {
        lastSeq = g.boardSeq;
        boardings++;
      }
    }
    // ~10 minutes of sim: the ping-pong train should make many stops.
    expect(boardings, greaterThan(50),
        reason: 'train made only $boardings stops in 10 minutes');
  });

  test('offline earnings: credited at half rate, capped at 8 hours', () {
    final played = run(300);
    final json = played.toJson(1000000);

    // Away for 1 hour.
    final g1 = GameState.fromJson(json);
    final credit1 = g1.applyOfflineEarnings(1000000 + 3600 * 1000);
    expect(credit1,
        closeTo(3600 * played.avgRate * GameState.offlineEfficiency, 1.0));

    // Away for 3 days — capped at 8h.
    final g2 = GameState.fromJson(json);
    final credit2 = g2.applyOfflineEarnings(1000000 + 3 * 86400 * 1000);
    expect(
        credit2,
        closeTo(
            GameState.maxOfflineSeconds *
                played.avgRate *
                GameState.offlineEfficiency,
            1.0));

    // Applying twice must not double-pay.
    expect(g2.applyOfflineEarnings(1000000 + 4 * 86400 * 1000), 0);
  });

  test('deterministic: two identical runs, identical worlds', () {
    final a = run(200);
    final b = run(200);
    expect(a.cash, b.cash);
    expect(a.totalRiders, b.totalRiders);
    expect(a.trainDistance, b.trainDistance);
  });
}
