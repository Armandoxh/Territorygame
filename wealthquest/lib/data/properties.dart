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

  /// Every property, grouped by category. Houses first (so the cheapest rung,
  /// the shack, stays the entry point), then apartments, commercial, land and
  /// the niche "other" plays. Each category trades off appreciation, rent
  /// yield, occupancy and volatility differently — that's the strategy.
  static const List<PropertyDef> ladder = [
    // ---- 🏠 Houses: balanced appreciation + reliable rent ----
    PropertyDef(
      id: 'shack',
      name: 'Fixer-Upper Shack',
      tierLabel: 'Starter',
      category: PropertyCategory.house,
      basePrice: 45000,
      monthlyAppreciation: 0.0026, // ~3.2%/yr
      monthlyVol: 0.010,
      blurb: 'A roof and four walls. Cheap to get on the ladder.',
    ),
    PropertyDef(
      id: 'two_br',
      name: '2-Bedroom House',
      tierLabel: 'Step up',
      category: PropertyCategory.house,
      basePrice: 360000,
      monthlyAppreciation: 0.0031,
      monthlyVol: 0.013,
      blurb: 'Room for a roommate, an office, or a kid.',
    ),
    PropertyDef(
      id: 'house',
      name: 'Suburban House',
      tierLabel: 'Family',
      category: PropertyCategory.house,
      basePrice: 560000,
      monthlyAppreciation: 0.0033,
      monthlyVol: 0.013,
      blurb: 'Yard, garage, the whole deal.',
    ),
    PropertyDef(
      id: 'luxury',
      name: 'Luxury Home',
      tierLabel: 'Luxury',
      category: PropertyCategory.house,
      basePrice: 1350000,
      monthlyAppreciation: 0.0035,
      monthlyVol: 0.016,
      blurb: 'You have made it. Now make the payments.',
    ),

    // ---- 🏢 Apartments: higher rent yield + occupancy, slower growth ----
    PropertyDef(
      id: 'studio',
      name: 'Studio Apartment',
      tierLabel: 'Starter',
      category: PropertyCategory.apartment,
      basePrice: 120000,
      monthlyAppreciation: 0.0025,
      monthlyVol: 0.011,
      rentYield: 0.0060,
      occupancy: 0.82,
      renoYield: 0.0035,
      blurb: 'Always in demand to rent. Cash flow over capital gains.',
    ),
    PropertyDef(
      id: 'one_br',
      name: '1-Bedroom Condo',
      tierLabel: 'Step up',
      category: PropertyCategory.apartment,
      basePrice: 215000,
      monthlyAppreciation: 0.0025,
      monthlyVol: 0.011,
      rentYield: 0.0060,
      occupancy: 0.82,
      renoYield: 0.0035,
      blurb: 'A bedroom with a door — and a tenant waiting list.',
    ),
    PropertyDef(
      id: 'duplex',
      name: 'Duplex (2 units)',
      tierLabel: 'Multi-unit',
      category: PropertyCategory.apartment,
      basePrice: 300000,
      monthlyAppreciation: 0.0025,
      monthlyVol: 0.011,
      rentYield: 0.0062,
      occupancy: 0.83,
      renoYield: 0.0035,
      blurb: 'Two rents, one roof. House-hack the other half.',
    ),
    PropertyDef(
      id: 'fourplex',
      name: 'Fourplex',
      tierLabel: 'Multi-unit',
      category: PropertyCategory.apartment,
      basePrice: 560000,
      monthlyAppreciation: 0.0024,
      monthlyVol: 0.012,
      rentYield: 0.0064,
      occupancy: 0.84,
      renoYield: 0.0035,
      blurb: 'Four doors. A vacancy barely dents the cash flow.',
    ),
    PropertyDef(
      id: 'apt_building',
      name: 'Apartment Building',
      tierLabel: 'Multi-unit',
      category: PropertyCategory.apartment,
      basePrice: 1750000,
      monthlyAppreciation: 0.0024,
      monthlyVol: 0.012,
      rentYield: 0.0064,
      occupancy: 0.85,
      renoYield: 0.0035,
      blurb: 'Dozens of units. A real rent machine — if you can fund it.',
    ),

    // ---- 🏬 Commercial: fat, sticky rent; little growth; swingy values ----
    PropertyDef(
      id: 'retail_unit',
      name: 'Strip-Mall Retail Unit',
      tierLabel: 'Commercial',
      category: PropertyCategory.business,
      basePrice: 420000,
      monthlyAppreciation: 0.0018, // ~2.2%/yr
      monthlyVol: 0.016,
      rentYield: 0.0068,
      occupancy: 0.88,
      renoYield: 0.0035,
      blurb: 'Long leases, fat rent — but it lives and dies with the tenant.',
    ),
    PropertyDef(
      id: 'office_suite',
      name: 'Office Suite',
      tierLabel: 'Commercial',
      category: PropertyCategory.business,
      basePrice: 780000,
      monthlyAppreciation: 0.0017,
      monthlyVol: 0.017,
      rentYield: 0.0068,
      occupancy: 0.87,
      renoYield: 0.0035,
      blurb: 'Steady corporate rent. Appreciation? Don\'t hold your breath.',
    ),
    PropertyDef(
      id: 'warehouse',
      name: 'Warehouse',
      tierLabel: 'Industrial',
      category: PropertyCategory.business,
      basePrice: 1150000,
      monthlyAppreciation: 0.0019,
      monthlyVol: 0.015,
      rentYield: 0.0070,
      occupancy: 0.90,
      renoYield: 0.0030,
      blurb: 'Boring box, reliable industrial tenant, the fattest yield around.',
    ),

    // ---- 🌄 Land: no rent, no upkeep — pure, volatile appreciation ----
    PropertyDef(
      id: 'lot',
      name: 'Vacant City Lot',
      tierLabel: 'Speculative',
      category: PropertyCategory.land,
      basePrice: 65000,
      monthlyAppreciation: 0.0042, // ~5.2%/yr
      monthlyVol: 0.026,
      rentable: false,
      renovatable: false,
      blurb: 'No tenants, no toilets — just a bet the city grows your way.',
    ),
    PropertyDef(
      id: 'acreage',
      name: 'Rural Acreage',
      tierLabel: 'Speculative',
      category: PropertyCategory.land,
      basePrice: 190000,
      monthlyAppreciation: 0.0046,
      monthlyVol: 0.030,
      rentable: false,
      renovatable: false,
      blurb: 'Cheap dirt, big swings. Patient money or a lottery ticket.',
    ),
    PropertyDef(
      id: 'dev_parcel',
      name: 'Development Parcel',
      tierLabel: 'Speculative',
      category: PropertyCategory.land,
      basePrice: 720000,
      monthlyAppreciation: 0.0050,
      monthlyVol: 0.034,
      rentable: false,
      renovatable: false,
      blurb: 'Where the next subdivision goes — or doesn\'t. Highest octane.',
    ),

    // ---- 🗂️ Other: niche plays, each with a quirk ----
    PropertyDef(
      id: 'parking',
      name: 'Parking Lot',
      tierLabel: 'Passive',
      category: PropertyCategory.other,
      basePrice: 250000,
      monthlyAppreciation: 0.0017,
      monthlyVol: 0.010,
      rentYield: 0.0045,
      occupancy: 0.95,
      renovatable: false,
      renoYield: 0,
      blurb: 'Lowest yield, near-zero hassle, almost never empty.',
    ),
    PropertyDef(
      id: 'vacation',
      name: 'Beach Vacation Rental',
      tierLabel: 'Seasonal',
      category: PropertyCategory.other,
      basePrice: 480000,
      monthlyAppreciation: 0.0029,
      monthlyVol: 0.018,
      rentYield: 0.0095,
      occupancy: 0.55,
      renoYield: 0.0040,
      blurb: 'Huge rent when booked, dead off-season. Feast or famine.',
    ),
    PropertyDef(
      id: 'storage',
      name: 'Self-Storage Facility',
      tierLabel: 'Cash-flow',
      category: PropertyCategory.other,
      basePrice: 600000,
      monthlyAppreciation: 0.0021,
      monthlyVol: 0.012,
      rentYield: 0.0068,
      occupancy: 0.85,
      renoYield: 0.0025,
      blurb: 'Recession-resistant boxes of other people\'s stuff.',
    ),
    PropertyDef(
      id: 'mobile_park',
      name: 'Mobile-Home Park',
      tierLabel: 'Cash-flow',
      category: PropertyCategory.other,
      basePrice: 900000,
      monthlyAppreciation: 0.0018,
      monthlyVol: 0.013,
      rentYield: 0.0075,
      occupancy: 0.90,
      renoYield: 0.0025,
      blurb: 'Unglamorous, sticky tenants, serious monthly cash flow.',
    ),
  ];

  /// Display info + the one-line pros/cons pitch for each category.
  static const Map<PropertyCategory,
      ({String label, String emoji, String pitch})> categoryInfo = {
    PropertyCategory.house: (
      label: 'Houses',
      emoji: '🏠',
      pitch: 'Balanced: steady appreciation and reliable rent. Bread and butter.'
    ),
    PropertyCategory.apartment: (
      label: 'Apartments',
      emoji: '🏢',
      pitch: 'Cash-flow first — higher rent yield and occupancy, slower growth.'
    ),
    PropertyCategory.business: (
      label: 'Commercial',
      emoji: '🏬',
      pitch:
          'Fat, sticky rent and big tickets — but little growth and swingy values.'
    ),
    PropertyCategory.land: (
      label: 'Land',
      emoji: '🌄',
      pitch:
          'No rent, no upkeep — pure appreciation with big swings. High risk/reward.'
    ),
    PropertyCategory.other: (
      label: 'Other',
      emoji: '🗂️',
      pitch: 'Niche plays: parking, vacation rentals, storage, mobile parks.'
    ),
  };

  /// Categories in display order.
  static const List<PropertyCategory> categoriesInOrder = [
    PropertyCategory.house,
    PropertyCategory.apartment,
    PropertyCategory.business,
    PropertyCategory.land,
    PropertyCategory.other,
  ];

  static List<PropertyDef> inCategory(PropertyCategory c) =>
      ladder.where((d) => d.category == c).toList();

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
