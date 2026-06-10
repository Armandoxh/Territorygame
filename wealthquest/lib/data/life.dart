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

  /// Where you live, by monthly pay. Flavor only — the cost is already baked
  /// into your expenses, which rise with income.
  static LifestyleTier apartmentFor(double monthlyPay) {
    if (monthlyPay < 2000) {
      return const LifestyleTier(
          'Cramped studio', 'Shared walls, a hot plate, and a hopeful attitude.');
    }
    if (monthlyPay < 4500) {
      return const LifestyleTier(
          'Small 1-bedroom', 'Your own space at last — if you ignore the radiator.');
    }
    if (monthlyPay < 9000) {
      return const LifestyleTier(
          'Modern 1-bed downtown', 'Exposed brick, a real elevator, decent light.');
    }
    if (monthlyPay < 18000) {
      return const LifestyleTier(
          'Spacious 2-bed condo', 'Room for a home office and a guest who stays too long.');
    }
    return const LifestyleTier(
        'Luxury high-rise', 'Doorman, skyline views, a gym you never use.');
  }

  /// What you drive, by monthly pay. Flavor only.
  static LifestyleTier carFor(double monthlyPay) {
    if (monthlyPay < 2000) {
      return const LifestyleTier(
          'Bus pass & rideshares', 'No car payment, but a lot of waiting.');
    }
    if (monthlyPay < 4500) {
      return const LifestyleTier(
          'Used hatchback', '150k miles and a personality. Mostly reliable.');
    }
    if (monthlyPay < 9000) {
      return const LifestyleTier(
          'Reliable sedan', 'Nothing flashy — it just starts every morning.');
    }
    if (monthlyPay < 18000) {
      return const LifestyleTier(
          'New SUV', 'Heated seats, a sunroof, and a payment to match.');
    }
    return const LifestyleTier(
        'Luxury sports car', "Fast, loud, and terrible value — but it's yours.");
  }

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

class ExpenseSlice {
  final String label;
  final double share;
  final String emoji;
  const ExpenseSlice(this.label, this.share, this.emoji);
}

class LifestyleTier {
  final String name;
  final String blurb;
  const LifestyleTier(this.name, this.blurb);
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
