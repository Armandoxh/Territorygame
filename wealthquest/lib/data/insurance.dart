import '../models/crisis_category.dart';

/// Insurance policies — one "shield" per insurable life-event category. Each is
/// a monthly premium that, when a covered life event hits, absorbs most of the
/// out-of-pocket cost: you pay a [deductible] plus a slice of the rest, and the
/// insurer covers the remaining [Insurance.coinsurance] (80%). Skip the shield
/// and the event lands at full price — which, if you're cash-light, can spiral
/// into a margin call or bankruptcy.
///
/// Premiums sit a touch above the expected payout (the insurer's edge), so a
/// risk-tolerant optimizer skips the ones whose events rarely hit them — but one
/// bad year can wipe out an uninsured player.
class InsurancePolicy {
  const InsurancePolicy(
    this.id,
    this.name,
    this.emoji,
    this.category,
    this.premium,
    this.deductible,
    this.blurb,
  );

  final String id;
  final String name;
  final String emoji;

  /// The life-event category this shield covers (1:1).
  final CrisisCategory category;

  /// Monthly premium (drained from cash whether or not anything happens).
  final double premium;

  /// What you still pay out of pocket on a covered event before coverage kicks
  /// in. Small everyday hits below this are entirely on you; the shield earns
  /// its keep on the big ones.
  final double deductible;

  final String blurb;

  /// Short tag for the in-event "covered" line.
  String get shortName => name.split(' ').first;
}

class Insurance {
  Insurance._();

  /// Of the cost above the deductible, the insurer pays this share (you pay the
  /// deductible plus the remaining 20%).
  static const double coinsurance = 0.8;

  /// Income protection replaces this fraction of your normal wage for each month
  /// a life event has knocked you off the payroll (disability / job loss).
  static const double incomeReplacement = 0.6;

  static const List<InsurancePolicy> all = [
    InsurancePolicy(
        'health',
        'Health insurance',
        '🩺',
        CrisisCategory.health,
        260,
        1500,
        'Medical emergencies, surgery, injury recovery. The single most ruinous '
            'bill if you skip it — and it also keeps you healthier.'),
    InsurancePolicy(
        'auto',
        'Auto insurance',
        '🚗',
        CrisisCategory.auto,
        90,
        1000,
        'Repairs, accidents, and liability. Only matters if you actually drive.'),
    InsurancePolicy(
        'home',
        'Home / renters',
        '🏠',
        CrisisCategory.home,
        70,
        1000,
        'Fire, theft, water, and the big structural repairs to where you live.'),
    InsurancePolicy(
        'legal',
        'Legal & liability',
        '⚖️',
        CrisisCategory.legal,
        60,
        1500,
        'Lawsuits, audits, fines, and settlements — the bills with a courtroom '
            'attached.'),
    InsurancePolicy(
        'income',
        'Income protection',
        '🛟',
        CrisisCategory.income,
        130,
        0,
        'Disability & job-loss cover. Replaces 60% of your wage for every month '
            'a life event keeps you off the payroll.'),
    InsurancePolicy(
        'family',
        'Family protection',
        '👨‍👩‍👧',
        CrisisCategory.family,
        75,
        1000,
        'Eldercare, dependents, and the family emergencies that land in your '
            'lap.'),
    InsurancePolicy(
        'education',
        'Tuition protection',
        '🎓',
        CrisisCategory.education,
        45,
        500,
        'Surprise tuition, fees, and the cost shocks of staying credentialed.'),
    InsurancePolicy(
        'tech',
        'Cyber & identity',
        '🔒',
        CrisisCategory.tech,
        35,
        500,
        'Identity theft, fraud, hacked accounts, and fried devices.'),
  ];

  static InsurancePolicy byId(String id) => all.firstWhere((p) => p.id == id);

  /// The shield covering [category], or null for uninsurable events.
  static InsurancePolicy? byCategory(CrisisCategory category) {
    if (category == CrisisCategory.none) return null;
    for (final p in all) {
      if (p.category == category) return p;
    }
    return null;
  }
}
