import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:scratch_empire/data/tickets.dart';
import 'package:scratch_empire/state/game_state.dart';

/// The balance harness, from commit 1 this time (WealthQuest taught us what
/// it's worth). Guards the three ways an incremental dies: EV drifting
/// negative (stall), EV running away (trivial), and the broke-player
/// softlock.
void main() {
  test('every ticket is EV-positive but not a money printer (level 0)', () {
    for (final def in Tickets.all) {
      final ev = def.baseEv;
      expect(ev, greaterThan(def.cost * 1.05),
          reason: '${def.id}: EV \$$ev must beat cost — the climb never stalls');
      expect(ev, lessThan(def.cost * 1.35),
          reason: '${def.id}: EV \$$ev too generous — progression is trivial');
    }
  });

  test('empirical EV matches the prize table (200k tickets)', () {
    final rng = Random(42);
    final def = Tickets.lucky7s;
    var paid = 0.0;
    const n = 200000;
    for (var i = 0; i < n; i++) {
      paid += TicketFactory.roll(def, rng).payout;
    }
    final ev = paid / n;
    expect(ev, closeTo(def.baseEv, 0.06),
        reason: 'roll() must pay what the table promises');
  });

  test('upgrades raise EV without breaking the ceiling', () {
    final rng = Random(7);
    final def = Tickets.lucky7s;
    var paid = 0.0;
    const n = 200000;
    for (var i = 0; i < n; i++) {
      paid += TicketFactory
          .roll(def, rng, luckLevel: GameState.luckMax, payoutMult: 2.2)
          .payout;
    }
    final ev = paid / n;
    expect(ev, greaterThan(def.baseEv),
        reason: 'maxed upgrades must beat base EV');
    expect(ev, lessThan(def.cost * 4),
        reason: 'maxed EV must stay bounded (~\$4 per \$1 ticket)');
  });

  test('grid layout: winners match exactly 3, losers never match 3', () {
    final rng = Random(3);
    for (var i = 0; i < 5000; i++) {
      final t = TicketFactory.roll(Tickets.lucky7s, rng);
      final counts = <String, int>{};
      for (final c in t.cells) {
        counts[c] = (counts[c] ?? 0) + 1;
      }
      expect(t.cells.length, 9);
      if (t.isWinner) {
        expect(counts[t.winSymbol], 3,
            reason: 'winner must show its symbol exactly 3 times');
        counts.remove(t.winSymbol);
      }
      for (final e in counts.entries) {
        expect(e.value, lessThan(3),
            reason: 'non-winning symbol ${e.key} appeared 3+ times');
      }
    }
  });

  test('softlock-proof: a broke player can always keep playing', () {
    final g = GameState(seed: 11);
    g.cash = 0;
    // Grind pity tickets only; positive EV must eventually refill the wallet.
    for (var i = 0; i < 500 && g.cash < g.ticket.cost; i++) {
      expect(g.canFindFreeTicket, isTrue,
          reason: 'broke with no ticket → the free ticket MUST be offered');
      g.findFreeTicket();
      g.settleCurrent();
    }
    expect(g.cash, greaterThanOrEqualTo(g.ticket.cost),
        reason: '500 free tickets at positive EV must reach a buy');
  });

  test('progression pacing: a greedy player levels up at a fun rate', () {
    // Play 1,500 tickets buying every affordable upgrade. Wide bounds — this
    // guards against catastrophe (no progress / instant max), not taste.
    final g = GameState(seed: 99);
    for (var i = 0; i < 1500; i++) {
      if (g.canBuy) {
        g.buyTicket();
      } else if (g.canFindFreeTicket) {
        g.findFreeTicket();
      }
      g.settleCurrent();
      while (g.buyLuck() || g.buyPayout()) {}
    }
    final levels = g.luckLevel + g.payoutLevel;
    expect(levels, greaterThanOrEqualTo(6),
        reason: '1,500 tickets must buy real progress (got $levels levels)');
    expect(levels, lessThan(GameState.luckMax + GameState.payoutMax),
        reason: 'maxing everything in 1,500 tickets = curve too cheap');
    expect(g.ticketsScratched, 1500);
  });

  test('deterministic per seed', () {
    double run(int seed) {
      final g = GameState(seed: seed);
      for (var i = 0; i < 300; i++) {
        if (g.canBuy) {
          g.buyTicket();
        } else if (g.canFindFreeTicket) {
          g.findFreeTicket();
        }
        g.settleCurrent();
      }
      return g.cash + g.totalWon;
    }

    expect(run(5), run(5), reason: 'same seed, same life');
  });
}
