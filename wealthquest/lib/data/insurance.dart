/// Insurance policies. Each is a monthly premium that protects against a stream
/// of random, sometimes-ruinous incidents. Uninsured, an incident hits you for
/// the full (large) amount — which, if you're cash-light, can spiral into a
/// margin call or bankruptcy. The choice: pay steady premiums for safety, or
/// self-insure and gamble. Premiums sit a touch above expected loss (the
/// insurer's edge), so a risk-tolerant optimizer skips them — but one bad year
/// can wipe them out.
class InsurancePolicy {
  const InsurancePolicy(
    this.id,
    this.name,
    this.emoji,
    this.premium,
    this.incidentChance,
    this.incidentMin,
    this.incidentMax,
    this.deductible,
    this.blurb,
  );

  final String id;
  final String name;
  final String emoji;

  /// Monthly premium (drained from cash whether or not anything happens).
  final double premium;

  /// Monthly probability of an incident while UNcovered.
  final double incidentChance;

  /// Uninsured incident cost range.
  final double incidentMin;
  final double incidentMax;

  /// What you still pay out of pocket even when covered.
  final double deductible;

  final String blurb;
}

class Insurance {
  Insurance._();

  static const List<InsurancePolicy> all = [
    InsurancePolicy('health', 'Health insurance', '🩺', 320, 0.011, 4000, 45000,
        1500, 'Covers medical emergencies. The single most ruinous bill if '
            'you skip it.'),
    InsurancePolicy('auto', 'Auto insurance', '🚗', 120, 0.011, 2000, 16000,
        1000, 'Accidents and liability. Only matters if you actually drive.'),
    InsurancePolicy('home', 'Home / renters', '🏠', 90, 0.006, 3000, 28000, 1000,
        'Fire, theft, water damage to where you live and your stuff.'),
    InsurancePolicy('life', 'Life & disability', '🛟', 110, 0.004, 6000, 55000,
        0, 'Protects your income (and your family) if you can\'t work.'),
  ];

  static InsurancePolicy byId(String id) => all.firstWhere((p) => p.id == id);
}
