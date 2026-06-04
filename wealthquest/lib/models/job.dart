/// A day job. Pay lands in cash every Next Day (one game week).
class JobDef {
  final String id;
  final String title;

  /// Dollars earned per advanced day (= one in-game week).
  final double pay;

  /// Minimum age before this job can be taken.
  final int minAge;

  const JobDef({
    required this.id,
    required this.title,
    required this.pay,
    this.minAge = 18,
  });
}
