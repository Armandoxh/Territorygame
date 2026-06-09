import 'dart:math';

/// Broad real-estate categories, each with its own risk/reward feel.
enum PropertyCategory { house, apartment, business, land, other }

/// A type of property you can buy.
class PropertyDef {
  final String id;
  final String name;
  final String tierLabel; // e.g. "Starter", "Family", "Luxury"
  final PropertyCategory category;
  final double basePrice;

  /// Mean MONTHLY appreciation (already in monthly terms; real estate grinds up
  /// slowly and steadily — lower than stocks).
  final double monthlyAppreciation;

  /// Monthly price volatility — small for homes, large for raw land.
  final double monthlyVol;

  /// Monthly gross rent as a fraction of current value (when occupied).
  final double rentYield;

  /// Chance a listed unit has a paying tenant in any given month.
  final double occupancy;

  /// Whether the type can be rented out / renovated (land can't, etc.).
  final bool rentable;
  final bool renovatable;

  /// Extra monthly rent per $1 of cumulative renovation invested.
  final double renoYield;

  final String blurb;

  const PropertyDef({
    required this.id,
    required this.name,
    required this.tierLabel,
    required this.category,
    required this.basePrice,
    required this.monthlyAppreciation,
    required this.monthlyVol,
    this.rentYield = 0.005,
    this.occupancy = 0.75,
    this.rentable = true,
    this.renovatable = true,
    this.renoYield = 0.003,
    this.blurb = '',
  });
}

/// A financing option: rate + term. Down payment is chosen by the player at
/// purchase time.
class MortgageType {
  final String id;
  final String name; // "30-Year Fixed"
  final double annualRate;
  final int termMonths;
  final String blurb;

  const MortgageType({
    required this.id,
    required this.name,
    required this.annualRate,
    required this.termMonths,
    this.blurb = '',
  });
}

/// A property the player owns, with its mortgage.
class PropertyHolding {
  final int id;
  final String defId;
  double currentValue;
  double loanBalance;
  double monthlyPayment;
  double annualRate;
  int termMonths;
  final double purchasePrice;
  int monthsPaid;

  /// A made-up street address, so a portfolio of identical "Suburban Houses"
  /// reads as distinct homes ("412 Maple Ave") rather than a wall of dupes.
  final String address;

  /// Cumulative cash poured into renovations. Drives diminishing returns on
  /// further value-add — you can't gold-plate a shack forever.
  double renovationInvested;

  /// Economics snapshotted from the def at purchase, so rent doesn't depend on
  /// the catalog and a category's pros/cons travel with the holding.
  final double rentYield;
  final double renoYield;
  final bool rentable;
  final double occupancy;

  /// Whether you're listing this home for rent (landlord mode).
  bool rentedOut;

  /// Whether a tenant is in place this month (re-rolled each month while
  /// [rentedOut]). Drives whether rent comes in.
  bool occupied;

  PropertyHolding({
    required this.id,
    required this.defId,
    required this.currentValue,
    required this.loanBalance,
    required this.monthlyPayment,
    required this.annualRate,
    required this.termMonths,
    required this.purchasePrice,
    this.address = '',
    this.monthsPaid = 0,
    this.renovationInvested = 0,
    this.rentYield = 0.005,
    this.renoYield = 0.003,
    this.rentable = true,
    this.occupancy = 0.75,
    this.rentedOut = false,
    this.occupied = false,
  });

  /// Gross monthly rent if occupied: the type's yield on current value PLUS a
  /// premium for renovation — a fixed-up home commands above-market rent.
  /// Non-rentable types (raw land) earn nothing while you hold them.
  double get monthlyRent => rentable
      ? currentValue * rentYield + renovationInvested * renoYield
      : 0;

  /// What you'd walk away with (before selling costs): value minus what you
  /// still owe. Can go negative if the home is "underwater".
  double get equity => currentValue - loanBalance;

  bool get isPaidOff => loanBalance <= 0.01;

  /// A deep copy, for what-if lookahead in the balance harness.
  PropertyHolding clone() => PropertyHolding(
        id: id,
        defId: defId,
        currentValue: currentValue,
        loanBalance: loanBalance,
        monthlyPayment: monthlyPayment,
        annualRate: annualRate,
        termMonths: termMonths,
        purchasePrice: purchasePrice,
        address: address,
        monthsPaid: monthsPaid,
        renovationInvested: renovationInvested,
        rentYield: rentYield,
        renoYield: renoYield,
        rentable: rentable,
        occupancy: occupancy,
        rentedOut: rentedOut,
        occupied: occupied,
      );
}

/// Standard fixed-rate amortization: the level monthly payment that pays a
/// [loan] off over [termMonths] at [annualRate].
double mortgageMonthlyPayment(double loan, double annualRate, int termMonths) {
  if (loan <= 0 || termMonths <= 0) return 0;
  final r = annualRate / 12.0;
  if (r <= 0) return loan / termMonths;
  final f = pow(1 + r, termMonths).toDouble();
  return loan * r * f / (f - 1);
}
