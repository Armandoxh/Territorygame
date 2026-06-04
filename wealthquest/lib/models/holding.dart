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
  });

  /// A CD that hasn't matured yet can't be redeemed.
  bool get isLocked => kind == AssetKind.cd && !matured;
}
