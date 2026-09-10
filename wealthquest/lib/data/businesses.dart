import 'dart:math';

import '../models/business.dart';

/// The storefront of buyable businesses, grouped by category. Tunables live
/// here. Prices are set ≈ annual profit × the sale multiple, so you buy roughly
/// at fair value — your return is the monthly cash yield (1 ÷ multiple), plus
/// whatever you grow it to before selling.
class Businesses {
  Businesses._();

  static const List<BusinessDef> all = [
    // 🍽️ Food & Beverage — fat yields, very cyclical, real failure risk.
    BusinessDef(
      id: 'food_truck',
      name: 'Food Truck',
      emoji: '🚚',
      category: BusinessCategory.food,
      price: 90000,
      baseMonthlyProfit: 2500,
      saleMultiple: 3.0,
      profitVol: 0.25,
      cyclicality: 0.70,
      failureRisk: 0.006,
      blurb: 'Cheap to start, fat margins when the line is long — but a bad '
          'stretch can sink it fast.',
    ),
    BusinessDef(
      id: 'coffee_shop',
      name: 'Coffee Shop',
      emoji: '☕',
      category: BusinessCategory.food,
      price: 220000,
      baseMonthlyProfit: 4580,
      saleMultiple: 4.0,
      profitVol: 0.18,
      cyclicality: 0.50,
      failureRisk: 0.003,
      blurb: 'A neighborhood habit. Steady regulars, but rent and labor bite.',
    ),
    BusinessDef(
      id: 'restaurant',
      name: 'Restaurant',
      emoji: '🍽️',
      category: BusinessCategory.food,
      price: 480000,
      baseMonthlyProfit: 11400,
      saleMultiple: 3.5,
      profitVol: 0.22,
      cyclicality: 0.80,
      failureRisk: 0.005,
      blurb: 'Boom-or-bust. Packed in good times, empty in a downturn — the '
          'classic high-risk, high-reward play.',
    ),

    // 🛍️ Retail — lives on consumer spending.
    BusinessDef(
      id: 'boutique',
      name: 'Boutique',
      emoji: '🛍️',
      category: BusinessCategory.retail,
      price: 150000,
      baseMonthlyProfit: 3570,
      saleMultiple: 3.5,
      profitVol: 0.20,
      cyclicality: 0.70,
      failureRisk: 0.004,
      blurb: 'Curated and trendy — flies in a boom, gathers dust in a bust.',
    ),
    BusinessDef(
      id: 'convenience',
      name: 'Convenience Store',
      emoji: '🏪',
      category: BusinessCategory.retail,
      price: 280000,
      baseMonthlyProfit: 4670,
      saleMultiple: 5.0,
      profitVol: 0.12,
      cyclicality: 0.30,
      failureRisk: 0.0015,
      blurb: 'Cigarettes, lottery, milk. Unglamorous and remarkably steady.',
    ),

    // 🧰 Services — steady, often recession-resistant cash.
    BusinessDef(
      id: 'vending',
      name: 'Vending Route',
      emoji: '🥤',
      category: BusinessCategory.service,
      price: 25000,
      baseMonthlyProfit: 600,
      saleMultiple: 3.5,
      profitVol: 0.12,
      cyclicality: 0.20,
      failureRisk: 0,
      blurb: 'Tiny capital, near-passive, almost recession-proof. A starter '
          'cash machine.',
    ),
    BusinessDef(
      id: 'laundromat',
      name: 'Laundromat',
      emoji: '🧺',
      category: BusinessCategory.service,
      price: 180000,
      baseMonthlyProfit: 3750,
      saleMultiple: 4.0,
      profitVol: 0.10,
      cyclicality: 0.10,
      failureRisk: 0.0003,
      blurb: 'Boring quarters in a bucket — and it barely notices a recession.',
    ),
    BusinessDef(
      id: 'car_wash',
      name: 'Car Wash',
      emoji: '🚗',
      category: BusinessCategory.service,
      price: 320000,
      baseMonthlyProfit: 5930,
      saleMultiple: 4.5,
      profitVol: 0.14,
      cyclicality: 0.35,
      failureRisk: 0.001,
      blurb: 'Semi-automatic cash flow once the equipment is paid off.',
    ),
    BusinessDef(
      id: 'gym',
      name: 'Gym',
      emoji: '🏋️',
      category: BusinessCategory.service,
      price: 350000,
      baseMonthlyProfit: 6480,
      saleMultiple: 4.5,
      profitVol: 0.16,
      cyclicality: 0.50,
      failureRisk: 0.003,
      blurb: 'Recurring memberships are gold — until people cancel in a pinch.',
    ),

    // 💻 Online — cheap, scalable, swingy.
    BusinessDef(
      id: 'content_site',
      name: 'Content Site',
      emoji: '🌐',
      category: BusinessCategory.online,
      price: 40000,
      baseMonthlyProfit: 950,
      saleMultiple: 3.5,
      profitVol: 0.28,
      cyclicality: 0.50,
      failureRisk: 0.004,
      blurb: 'Ad revenue from a niche site. One algorithm change away from zero.',
    ),
    BusinessDef(
      id: 'saas',
      name: 'SaaS App',
      emoji: '💻',
      category: BusinessCategory.online,
      price: 60000,
      baseMonthlyProfit: 1250,
      saleMultiple: 4.0,
      profitVol: 0.30,
      cyclicality: 0.60,
      failureRisk: 0.005,
      blurb: 'Subscription software — scales beautifully with expansion, but '
          'churn and competition are brutal.',
    ),

    // 🏪 Franchise — pricey, royalty-bound, but brand-backed and steady.
    BusinessDef(
      id: 'franchise',
      name: 'Fast-Food Franchise',
      emoji: '🍔',
      category: BusinessCategory.franchise,
      price: 900000,
      baseMonthlyProfit: 12500,
      saleMultiple: 6.0,
      profitVol: 0.08,
      cyclicality: 0.30,
      failureRisk: 0.0005,
      blurb: 'Expensive and you owe royalties, but the brand brings the crowd — '
          'steady, low-risk, and resale-friendly.',
    ),
  ];

  /// Display info + a one-line pitch per category.
  static const Map<BusinessCategory,
      ({String label, String emoji, String pitch})> categoryInfo = {
    BusinessCategory.food: (
      label: 'Food & Beverage',
      emoji: '🍽️',
      pitch: 'Fat cash yields, very cyclical, and some genuinely fail. High risk/reward.'
    ),
    BusinessCategory.retail: (
      label: 'Retail',
      emoji: '🛍️',
      pitch: 'Storefronts living on consumer spending — solid yields, downturn-sensitive.'
    ),
    BusinessCategory.service: (
      label: 'Services',
      emoji: '🧰',
      pitch: 'Laundromats, car washes, gyms — steady, often recession-resistant cash.'
    ),
    BusinessCategory.online: (
      label: 'Online',
      emoji: '💻',
      pitch: 'Cheap to start and scalable, but swingy and easy to disrupt.'
    ),
    BusinessCategory.franchise: (
      label: 'Franchise',
      emoji: '🏪',
      pitch: 'Pricey and royalty-bound, but brand-backed, steady, and low-risk.'
    ),
  };

  static const List<BusinessCategory> categoriesInOrder = [
    BusinessCategory.service,
    BusinessCategory.food,
    BusinessCategory.retail,
    BusinessCategory.online,
    BusinessCategory.franchise,
  ];

  static List<BusinessDef> inCategory(BusinessCategory c) =>
      all.where((b) => b.category == c).toList();

  static final Map<String, BusinessDef> _byId = {for (final b in all) b.id: b};
  static BusinessDef byId(String id) => _byId[id]!;

  static const List<String> _locales = [
    'Maple St', 'Oak Ave', 'Downtown', 'Riverside', 'Sunset', 'Lakeview',
    'Midtown', 'Highland', 'Harbor', 'Bayside', '5th Ave', 'Park Row',
    'Old Town', 'Westgate', 'Uptown', 'Eastside',
  ];

  /// A flavor name like "Maple St Laundromat".
  static String randomName(Random rng, BusinessDef def) =>
      '${_locales[rng.nextInt(_locales.length)]} ${def.name}';
}
