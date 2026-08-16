import 'dart:math';

import '../models/crisis.dart';
import '../state/game_controller.dart';

// Re-export the event types so themed event files only need to import this kit.
export '../models/crisis.dart';

/// Shared, **public** helper vocabulary for the crisis / decision event library.
///
/// The base events in `crises.dart` use that file's private helpers; the themed
/// expansion packs (`crises_*.dart`) all share THIS verified set so every event
/// speaks the same small, safe language. If a consequence can't be expressed
/// with one of these, it probably doesn't belong in an event.
///
/// Design rule (the mantra): every event is a real decision. Each meaningful
/// choice should carry a genuine upside AND a downside — a pro and a con.

/// Uniform random amount in [lo, hi].
double rnd(Random rng, num lo, num hi) => lo + rng.nextDouble() * (hi - lo);

/// Format a dollar figure, no cents.
String usd(double v) => '\$${v.toStringAsFixed(0)}';

/// A cost that scales with how wealthy you are (so it still bites the rich),
/// never cheaper than [floor].
double scaled(GameController g, double frac, double floor) {
  final v = g.netWorth.abs() * frac;
  return v < floor ? floor : v;
}

/// Add cash. Returns the amount gained (for the outcome string).
double gain(GameController g, Random rng, num lo, num hi) {
  final a = rnd(rng, lo, hi);
  g.cash += a;
  return a;
}

/// Clamp a raw crisis cost/stake so a single popup can sting but never gouge:
/// bounded at [GameController.crisisMaxNetWorthShare] of net worth (once you're
/// past ~$100k, applied even in overdraft) and [GameController.crisisMaxCashShare]
/// of cash on hand. The single chokepoint every themed-pack cost AND at-risk
/// wager flows through, mirroring the base events' Crises._scaled.
double capCost(GameController g, double amount) {
  var amt = amount;
  final nw = g.netWorth.abs();
  if (nw > 100000) {
    final ceiling = nw * g.crisisMaxNetWorthShare;
    if (amt > ceiling) amt = ceiling;
  }
  if (g.cash > 0) {
    final cashCap = g.cash * g.crisisMaxCashShare;
    if (amt > cashCap) amt = cashCap;
  }
  return amt;
}

/// Spend cash (may push you into overdraft, like any real bill). Returns the
/// amount spent. Capped so no single popup gouges a cash-light player.
double spend(GameController g, Random rng, num lo, num hi) {
  final a = capCost(g, rnd(rng, lo, hi));
  g.cash -= a;
  return a;
}

/// A net-worth-scaled cost, dampened by [GameController.crisisCostScale] and
/// capped. Returns the amount spent.
double spendScaled(GameController g, double frac, double floor) {
  var raw = g.netWorth.abs() * frac * g.crisisCostScale;
  if (raw < floor) raw = floor;
  final a = capCost(g, raw);
  g.cash -= a;
  return a;
}

/// Take on nasty high-interest debt (loan-shark / payday territory, 28%/yr).
void loanShark(GameController g, double amount) {
  g.debt += amount;
}

/// Add to (or, with a negative [amount], pay down) the cheaper, slow-
/// compounding student-loan balance (7.5%/yr). The balance never goes below 0.
void studentDebt(GameController g, double amount) {
  final v = g.studentLoan + amount;
  g.studentLoan = v < 0 ? 0 : v;
}

/// Go [months] with no salary at all (injury, sabbatical, suspension, a new
/// baby, jail...). The classic "free thing with a real cost".
void unpaidLeave(GameController g, int months, String reason) =>
    g.takeUnpaidLeave(months, reason);

/// A recurring monthly cost for [months] months (a lease, alimony, a gym
/// contract, a subscription trap).
void obligation(GameController g, String label, double monthly, int months) =>
    g.addObligation(label, monthly, months);

/// Drag your current degree out by [months]. No-op (returns false) if you're
/// not enrolled — gate these events with `eligible: inSchool`.
bool extendSchool(GameController g, int months) {
  if (!g.isStudying) return false;
  g.enrollMonthsLeft += months;
  return true;
}

/// Graduate sooner by [months] (always leaves at least 1 month). No-op if not
/// enrolled.
bool shortenSchool(GameController g, int months) {
  if (!g.isStudying) return false;
  final left = g.enrollMonthsLeft - months;
  g.enrollMonthsLeft = left < 1 ? 1 : left;
  return true;
}

/// A wager or "hot tip": risk [stake] (clamped to your cash). With probability
/// [winProb] you win stake × [payoutMult]; otherwise you lose the stake.
/// Returns the signed cash change (positive = won, negative = lost). The con is
/// always that "sure things" aren't.
double wager(GameController g, Random rng, double stake, double winProb,
    double payoutMult) {
  // Bound the at-risk amount the same way as costs, so an event-driven bet
  // can't wipe a cash-light player on a loss.
  final capped = capCost(g, stake);
  final s = capped > g.cash ? g.cash : capped;
  if (s <= 0) return 0;
  if (rng.nextDouble() < winProb) {
    final w = s * payoutMult;
    g.cash += w;
    return w;
  }
  g.cash -= s;
  return -s;
}

/// True while a degree is in progress — use directly as an event's `eligible`.
bool inSchool(GameController g) => g.isStudying;
