import 'dart:math';

import '../models/property.dart';

/// The property ladder and the mortgage menu. Tunables live here.
class Properties {
  Properties._();

  // Made-up address parts, so every home gets a distinct street address.
  static const List<String> _streets = [
    'Maple', 'Oak', 'Cedar', 'Pine', 'Elm', 'Birch', 'Willow', 'Sunset',
    'Lakeview', 'Hillcrest', 'Park', 'Washington', 'Madison', 'Lincoln',
    'Highland', 'Riverside', 'Meadow', 'Brookside', 'Aspen', 'Magnolia',
    'Juniper', 'Chestnut', 'Spruce', 'Forest', 'Crescent', 'Orchard',
    'Bayview', 'Ridgeline', 'Cobblestone', 'Harbor', 'Marigold', 'Sycamore',
  ];
  static const List<String> _suffixes = [
    'St', 'Ave', 'Rd', 'Ln', 'Dr', 'Ct', 'Blvd', 'Way', 'Pl', 'Ter',
  ];

  /// A fictional street address like "412 Maple Ave".
  static String randomAddress(Random rng) {
    final number = 100 + rng.nextInt(9800);
    final street = _streets[rng.nextInt(_streets.length)];
    final suffix = _suffixes[rng.nextInt(_suffixes.length)];
    return '$number $street $suffix';
  }

  /// The ladder: rung up from a shack to a luxury home. Appreciation is
  /// monthly and modest (~3–4.5%/yr); the magic is leverage + the mortgage.
  static const List<PropertyDef> ladder = [
    PropertyDef(
      id: 'shack',
      name: 'Fixer-Upper Shack',
      tierLabel: 'Starter',
      basePrice: 45000,
      monthlyAppreciation: 0.0026, // ~3.2%/yr
      monthlyVol: 0.010,
      blurb: 'A roof and four walls. Cheap to get on the ladder.',
    ),
    PropertyDef(
      id: 'studio',
      name: 'Studio Apartment',
      tierLabel: 'Starter',
      basePrice: 120000,
      monthlyAppreciation: 0.0028,
      monthlyVol: 0.011,
      blurb: 'One room that does everything. Your first real place.',
    ),
    PropertyDef(
      id: 'one_br',
      name: '1-Bedroom Condo',
      tierLabel: 'Step up',
      basePrice: 215000,
      monthlyAppreciation: 0.0030,
      monthlyVol: 0.012,
      blurb: 'A bedroom with a door. Luxury.',
    ),
    PropertyDef(
      id: 'two_br',
      name: '2-Bedroom House',
      tierLabel: 'Step up',
      basePrice: 360000,
      monthlyAppreciation: 0.0031,
      monthlyVol: 0.013,
      blurb: 'Room for a roommate, an office, or a kid.',
    ),
    PropertyDef(
      id: 'house',
      name: 'Suburban House',
      tierLabel: 'Family',
      basePrice: 560000,
      monthlyAppreciation: 0.0033,
      monthlyVol: 0.013,
      blurb: 'Yard, garage, the whole deal.',
    ),
    PropertyDef(
      id: 'luxury',
      name: 'Luxury Home',
      tierLabel: 'Luxury',
      basePrice: 1350000,
      monthlyAppreciation: 0.0035,
      monthlyVol: 0.016,
      blurb: 'You have made it. Now make the payments.',
    ),
  ];

  /// The long-run benchmark 30-year mortgage rate. The live rate floats around
  /// this over a game; each [MortgageType.annualRate] is read as a spread
  /// relative to this baseline, so the relative cost of a 15-yr or ARM holds
  /// even as rates move.
  static const double baseRate = 0.065;
  static const double minRate = 0.03; // cheap-money floor
  static const double maxRate = 0.105; // rate-shock ceiling

  /// Financing options. Lower rate / shorter term = less interest but a bigger
  /// monthly bite.
  static const List<MortgageType> mortgages = [
    MortgageType(
      id: 'fixed30',
      name: '30-Year Fixed',
      annualRate: 0.065,
      termMonths: 360,
      blurb: 'Lowest payment, most interest over time. The default.',
    ),
    MortgageType(
      id: 'fixed15',
      name: '15-Year Fixed',
      annualRate: 0.058,
      termMonths: 180,
      blurb: 'Higher payment, far less total interest, paid off fast.',
    ),
    MortgageType(
      id: 'arm51',
      name: '5/1 ARM',
      annualRate: 0.055,
      termMonths: 360,
      blurb: 'Lowest rate to start (treated as fixed for now).',
    ),
  ];

  static final Map<String, PropertyDef> _byId = {
    for (final p in ladder) p.id: p,
  };

  static PropertyDef byId(String id) => _byId[id]!;
}
