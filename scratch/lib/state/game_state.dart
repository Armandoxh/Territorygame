import 'dart:math';

import 'package:flutter/foundation.dart';

import '../data/tickets.dart';

/// The whole game state for v0.1: cash, the ticket in hand, two upgrade
/// lines, and lifetime stats. Deliberately tiny — the mantra is to nail one
/// aspect at a time, and v0.1 exists to prove the scratch loop feels great.
class GameState extends ChangeNotifier {
  GameState({int? seed})
      : _rng = Random(seed ?? DateTime.now().millisecondsSinceEpoch);

  final Random _rng;

  /// Start with enough for a few tickets — the first scratch should be ~10
  /// seconds away from first launch.
  double cash = 10;

  /// The unscratched ticket in hand (outcome already decided — see
  /// TicketInstance). One at a time in v0.1.
  TicketInstance? current;

  // ---- Lifetime stats (the seed of the future share card) ----
  int ticketsScratched = 0;
  double totalSpent = 0;
  double totalWon = 0;
  double biggestWin = 0;
  int freeTicketsFound = 0;

  // ---- Upgrades ----
  /// "Lucky Fingers": each level shifts odds from blank into small prizes.
  int luckLevel = 0;
  static const int luckMax = 8;

  /// "Bigger Prizes": each level multiplies every payout by +15%.
  int payoutLevel = 0;
  static const int payoutMax = 8;

  double get payoutMult => 1 + 0.15 * payoutLevel;

  double luckCost(int level) => 10 * pow(1.9, level).toDouble();
  double payoutCost(int level) => 20 * pow(2.0, level).toDouble();

  double get nextLuckCost => luckCost(luckLevel);
  double get nextPayoutCost => payoutCost(payoutLevel);

  TicketDef get ticket => Tickets.lucky7s;

  /// Down on your luck? There's always a ticket on the ground. The softlock
  /// guard: with no cash and no ticket, play can always continue.
  bool get canFindFreeTicket => current == null && cash < ticket.cost;

  bool get canBuy => current == null && cash >= ticket.cost;

  /// Buy a ticket: pay, roll the (pre-decided) outcome, hold it for scratching.
  bool buyTicket() {
    if (!canBuy) return false;
    cash -= ticket.cost;
    totalSpent += ticket.cost;
    current = TicketFactory.roll(ticket, _rng,
        luckLevel: luckLevel, payoutMult: payoutMult);
    notifyListeners();
    return true;
  }

  /// The pity ticket — free, same odds. Slow, but it means the game can never
  /// strand a broke player (the #1 incremental-genre killer).
  bool findFreeTicket() {
    if (!canFindFreeTicket) return false;
    freeTicketsFound += 1;
    current = TicketFactory.roll(ticket, _rng,
        luckLevel: luckLevel, payoutMult: payoutMult);
    notifyListeners();
    return true;
  }

  /// Called by the UI once the ticket is fully revealed: bank the result.
  void settleCurrent() {
    final t = current;
    if (t == null) return;
    cash += t.payout;
    totalWon += t.payout;
    if (t.payout > biggestWin) biggestWin = t.payout;
    ticketsScratched += 1;
    current = null;
    notifyListeners();
  }

  bool buyLuck() {
    if (luckLevel >= luckMax || cash < nextLuckCost) return false;
    cash -= nextLuckCost;
    luckLevel += 1;
    notifyListeners();
    return true;
  }

  bool buyPayout() {
    if (payoutLevel >= payoutMax || cash < nextPayoutCost) return false;
    cash -= nextPayoutCost;
    payoutLevel += 1;
    notifyListeners();
    return true;
  }

  // ---- Persistence ----
  static const int saveVersion = 1;

  Map<String, dynamic> toJson() => {
        'v': saveVersion,
        'cash': cash,
        'current': current?.toJson(),
        'ticketsScratched': ticketsScratched,
        'totalSpent': totalSpent,
        'totalWon': totalWon,
        'biggestWin': biggestWin,
        'freeTicketsFound': freeTicketsFound,
        'luckLevel': luckLevel,
        'payoutLevel': payoutLevel,
      };

  static GameState fromJson(Map<String, dynamic> j) {
    final g = GameState();
    g.cash = (j['cash'] as num).toDouble();
    final cur = j['current'];
    g.current = cur == null
        ? null
        : TicketInstance.fromJson(cur as Map<String, dynamic>);
    g.ticketsScratched = j['ticketsScratched'] as int;
    g.totalSpent = (j['totalSpent'] as num).toDouble();
    g.totalWon = (j['totalWon'] as num).toDouble();
    g.biggestWin = (j['biggestWin'] as num).toDouble();
    g.freeTicketsFound = (j['freeTicketsFound'] as int?) ?? 0;
    g.luckLevel = j['luckLevel'] as int;
    g.payoutLevel = j['payoutLevel'] as int;
    return g;
  }
}
