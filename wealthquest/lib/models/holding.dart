import 'asset.dart';

/// A live position the player owns. One per CD (each has its own maturity);
/// savings and price-based assets merge into a single holding per asset.
class Holding {
  final int id;
  final String assetId;
  final AssetKind kind;

  /// Number of shares for price-based assets.
  double shares;

  /// Current dollar balance (including accrued interest) for interest-bearing
  /// assets.
  double balance;

  /// Total dollars invested — basis for profit/loss and accrued-interest math.
  double costBasis;

  final int openedDay;

  /// Absolute day index at which a CD matures. 0 for non-CDs.
  final int maturityDay;

  bool matured;

  /// True if this position is hard-locked until [maturityDay] (CDs, private
  /// credit, hedge funds). Penalty-lock funds set this false.
  final bool hardLock;

  /// True for a short position (a bet the price falls). [shares] is the size
  /// borrowed, [costBasis] is the cash margin posted, [entryPrice] is the price
  /// it was opened at.
  final bool isShort;
  final double entryPrice;

  Holding({
    required this.id,
    required this.assetId,
    required this.kind,
    this.shares = 0,
    this.balance = 0,
    this.costBasis = 0,
    required this.openedDay,
    this.maturityDay = 0,
    this.matured = false,
    this.hardLock = false,
    this.isShort = false,
    this.entryPrice = 0,
  });

  /// A hard-locked position that hasn't matured can't be redeemed yet.
  bool get isLocked => hardLock && !matured;
}
