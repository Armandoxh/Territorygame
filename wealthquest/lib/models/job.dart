/// A day job. Pay lands in cash every Next Week (one game week).
class JobDef {
  final String id;
  final String title;

  /// Dollars earned per advanced day (= one in-game week).
  final double pay;

  /// Minimum age before this job can be taken.
  final int minAge;

  /// Minimum education level required (0 none, 1 associate, 2 bachelor, 3
  /// master). You can't take the job until you've earned the credential.
  final int requiredEdu;

  const JobDef({
    required this.id,
    required this.title,
    required this.pay,
    this.minAge = 18,
    this.requiredEdu = 0,
  });
}
