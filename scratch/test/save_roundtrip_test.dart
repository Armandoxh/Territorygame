import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:scratch_empire/state/game_state.dart';

/// Save-system guard (pure encode→decode, no storage plugin): a played-in
/// game must come back intact, including an unscratched ticket in hand so a
/// refresh can never reroll it.
void main() {
  test('save round-trips a played-in game', () {
    final g = GameState(seed: 21);
    for (var i = 0; i < 120; i++) {
      if (g.canBuy) {
        g.buyTicket();
      } else if (g.canFindFreeTicket) {
        g.findFreeTicket();
      }
      g.settleCurrent();
      g.buyLuck();
      g.buyPayout();
    }
    g.buyTicket(); // leave a live ticket in hand

    final r = GameState.fromJson(
        jsonDecode(jsonEncode(g.toJson())) as Map<String, dynamic>);

    expect(r.cash, closeTo(g.cash, 0.001));
    expect(r.ticketsScratched, g.ticketsScratched);
    expect(r.totalWon, closeTo(g.totalWon, 0.001));
    expect(r.biggestWin, closeTo(g.biggestWin, 0.001));
    expect(r.luckLevel, g.luckLevel);
    expect(r.payoutLevel, g.payoutLevel);
    expect(r.current, isNotNull);
    expect(r.current!.cells, g.current!.cells,
        reason: 'the ticket in hand must survive exactly — no rerolls');
    expect(r.current!.payout, closeTo(g.current!.payout, 0.001));
    expect(r.current!.winSymbol, g.current!.winSymbol);
  });

  test('a fresh game serializes cleanly', () {
    final g = GameState(seed: 1);
    final r = GameState.fromJson(
        jsonDecode(jsonEncode(g.toJson())) as Map<String, dynamic>);
    expect(r.cash, closeTo(g.cash, 0.001));
    expect(r.current, isNull);
  });
}
