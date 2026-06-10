import '../models/asset.dart';

/// Static data for the Life app: how the monthly living expense splits across
/// categories, the flavor tiers for where you live and what you drive (these
/// track your income — lifestyle creep — and are read-only for now), and the
/// life events you can attend to pick up a market tip.
class LifeData {
  LifeData._();

  /// Slices of the monthly living expense. Shares sum to 1.0; the dollar
  /// amounts are derived from [GameController.dailyExpenses] at display time.
  static const List<ExpenseSlice> breakdown = [
    ExpenseSlice('Housing & rent', 0.38, '🏠'),
    ExpenseSlice('Food & groceries', 0.18, '🛒'),
    ExpenseSlice('Transportation', 0.15, '🚗'),
    ExpenseSlice('Insurance & health', 0.12, '🩺'),
    ExpenseSlice('Utilities & phone', 0.09, '💡'),
    ExpenseSlice('Fun & everything else', 0.08, '🎉'),
  ];

  static const double housingShare = 0.38;
  static const double transportShare = 0.15;


  /// Events you can attend (once a month) to pick up a market tip. Costlier
  /// events get you closer to the right people — better intel.
  static const List<LifeEvent> events = [
    LifeEvent(
      id: 'crypto_meetup',
      name: 'Crypto meetup',
      emoji: '🪙',
      blurb: 'Basement of a coffee shop. Strong opinions on coins.',
      cost: 100,
      tipKind: AssetKind.crypto,
      reliability: 0.58,
      minTier: 0,
    ),
    LifeEvent(
      id: 'networking_mixer',
      name: 'Networking mixer',
      emoji: '🍸',
      blurb: 'Rub elbows with mid-level managers. Someone always talks.',
      cost: 175,
      tipKind: AssetKind.stock,
      reliability: 0.62,
      minTier: 0,
    ),
    LifeEvent(
      id: 'industry_conference',
      name: 'Industry conference',
      emoji: '🎤',
      blurb: 'Keynotes, name tags, and hallway gossip about whole sectors.',
      cost: 400,
      tipKind: AssetKind.etf,
      reliability: 0.66,
      minTier: 1,
    ),
    LifeEvent(
      id: 'charity_gala',
      name: 'Charity gala',
      emoji: '🥂',
      blurb: 'Old money, black tie, and famously loose lips after the wine.',
      cost: 750,
      tipKind: AssetKind.stock,
      reliability: 0.72,
      minTier: 2,
    ),
    LifeEvent(
      id: 'private_club',
      name: "Private members' club",
      emoji: '🎩',
      blurb: 'Invite-only. The people here move markets before the news does.',
      cost: 1500,
      tipKind: AssetKind.stock,
      reliability: 0.80,
      minTier: 3,
    ),
  ];
}

  /// Where you choose to live. Monthly costs are grounded in 2024-25 US rent
  /// data (national studio ≈ $1.5k, 1-bed ≈ $1.65k, 2-bed ≈ $1.95k; a shared
  /// room ≈ $900; luxury and estates run far higher). Nicer places cost more
  /// but raise your social standing (you look successful, you can host).
  /// `capacityKids` is how many kids the place comfortably fits.
  static const List<HousingOption> housing = [
    HousingOption('live_family', 'With family', '🏠', 450, 0, 4,
        'Crash with family and pocket the difference. No privacy, huge savings.'),
    HousingOption('roommates', 'Room with roommates', '🛏️', 900, 0, 0,
        'A room of your own in a shared place — the cheapest real independence.'),
    HousingOption('studio', 'Studio apartment', '🚪', 1500, 0, 0,
        'Your own four walls — all of them close together.'),
    HousingOption('one_bed', '1-bedroom apartment', '🪟', 1650, 1, 1,
        'A real bedroom and a door that actually closes.'),
    HousingOption('two_bed', '2-bedroom apartment', '🏢', 1950, 2, 3,
        'Room for a home office or a kid. The family starter.'),
    HousingOption('condo', 'Downtown condo', '🌆', 3200, 4, 4,
        'Walkable, doorman, the right zip code.'),
    HousingOption('luxury', 'Luxury high-rise', '🏙️', 5500, 8, 4,
        'Skyline views, concierge, and a gym you never use.'),
    HousingOption('estate', 'Suburban estate', '🏡', 9000, 14, 4,
        'Big house, big lawn, big-mortgage-sized rent.'),
  ];

  /// What you get around in. Monthly all-in costs (payment + insurance + fuel +
  /// maintenance) are grounded in AAA's Your Driving Costs (a new car averages
  /// ≈ $965/mo; small sedans/hybrids are cheapest, SUVs more, luxury far more)
  /// and typical transit-pass prices (≈ $100/mo).
  static const List<TransportOption> transport = [
    TransportOption('bike', 'Bike & walking', '🚲', 40, 0,
        'No car, no payment — just your legs and the weather.'),
    TransportOption('transit', 'Public transit pass', '🚌', 100, 0,
        'Unlimited rides. Cheap, green, occasionally crowded.'),
    TransportOption('used_car', 'Used economy car', '🚗', 500, 0,
        '150k miles and a personality. Mostly reliable.'),
    TransportOption('sedan', 'New sedan / hybrid', '🚙', 750, 1,
        'Reliable and efficient. Nothing flashy — it just starts.'),
    TransportOption('suv', 'New SUV', '🚐', 1050, 2,
        'Heated seats, a sunroof, and a payment to match.'),
    TransportOption('luxury_car', 'Luxury car', '🏎️', 1600, 5,
        'A badge on the hood and premium at the pump.'),
    TransportOption('exotic', 'Exotic sports car', '🏁', 2800, 10,
        'Fast, loud, terrible value — but everyone notices.'),
  ];

  static HousingOption housingById(String id) =>
      housing.firstWhere((h) => h.id == id);
  static TransportOption transportById(String id) =>
      transport.firstWhere((t) => t.id == id);
}

class ExpenseSlice {
  final String label;
  final double share;
  final String emoji;
  const ExpenseSlice(this.label, this.share, this.emoji);
}

/// A housing choice: a fixed monthly cost and a social-standing bonus.
class HousingOption {
  final String id;
  final String name;
  final String emoji;
  final double monthlyCost;
  final int standingBonus;
  final int capacityKids;
  final String blurb;
  const HousingOption(this.id, this.name, this.emoji, this.monthlyCost,
      this.standingBonus, this.capacityKids, this.blurb);
}

/// A transport choice: a fixed monthly all-in cost and a standing bonus.
class TransportOption {
  final String id;
  final String name;
  final String emoji;
  final double monthlyCost;
  final int standingBonus;
  final String blurb;
  const TransportOption(this.id, this.name, this.emoji, this.monthlyCost,
      this.standingBonus, this.blurb);
}

class LifeEvent {
  final String id;
  final String name;
  final String emoji;
  final String blurb;
  final double cost;
  final AssetKind tipKind;
  final double reliability;

  /// Minimum social-standing tier (0–3) needed to get in the door.
  final int minTier;

  const LifeEvent({
    required this.id,
    required this.name,
    required this.emoji,
    required this.blurb,
    required this.cost,
    required this.tipKind,
    required this.reliability,
    this.minTier = 0,
  });
}
