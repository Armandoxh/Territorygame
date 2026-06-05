import 'dart:math';

/// A type of property on the ladder (shack → studio → … → house).
class PropertyDef {
  final String id;
  final String name;
  final String tierLabel; // e.g. "Starter", "Family", "Luxury"
  final double basePrice;

  /// Mean MONTHLY appreciation (already in monthly terms; real estate grinds up
  /// slowly and steadily — lower than stocks).
  final double monthlyAppreciation;

  /// Monthly price volatility — small; housing is sticky.
  final double monthlyVol;

  final String blurb;

  const PropertyDef({
    required this.id,
    required this.name,
    required this.tierLabel,
    required this.basePrice,
    required this.monthlyAppreciation,
    required this.monthlyVol,
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
  final double monthlyPayment;
  final double annualRate;
  final int termMonths;
  final double purchasePrice;
  int monthsPaid;

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
    this.monthsPaid = 0,
    this.rentedOut = false,
    this.occupied = false,
  });

  /// Gross monthly rent if occupied: a fixed fraction of current value.
  double get monthlyRent => currentValue * 0.006;

  /// What you'd walk away with (before selling costs): value minus what you
  /// still owe. Can go negative if the home is "underwater".
  double get equity => currentValue - loanBalance;

  bool get isPaidOff => loanBalance <= 0.01;
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
