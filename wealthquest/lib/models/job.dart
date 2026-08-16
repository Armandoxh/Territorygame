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

  /// Prestige level at which this job becomes available (0 = always). Higher
  /// rungs unlock by retiring and starting over.
  final int unlockLevel;

  const JobDef({
    required this.id,
    required this.title,
    required this.pay,
    this.minAge = 18,
    this.requiredEdu = 0,
    this.unlockLevel = 0,
  });
}

/// A whole career line: an ordered ladder of rungs you climb by TENURE (you're
/// auto-promoted after enough months on a rung while working), gated by an
/// education requirement to enter. Tracks differ in ramp time, ceiling, and
/// what schooling (and debt) they demand — a doctor grinds years of low-paid
/// residency after a huge loan; a tradesperson earns from day one with none.
class CareerTrack {
  final String id;
  final String name; // "Medicine"
  final String emoji;
  final String blurb;

  /// General education level required to enter (0 none … 3 master).
  final int minEduLevel;

  /// A SPECIFIC professional degree that must be completed (e.g. 'med', 'law').
  /// null = any degree at [minEduLevel] suffices.
  final String? requiredDegreeId;

  final int minAge;
  final int unlockLevel; // prestige gate (0 = always)

  /// Rungs from entry (index 0) to the ceiling (last).
  final List<JobDef> rungs;

  /// Months of tenure on each rung before promotion to the next. The last
  /// entry is ignored (you can't promote past the top).
  final List<int> rungMonths;

  const CareerTrack({
    required this.id,
    required this.name,
    required this.emoji,
    required this.blurb,
    required this.rungs,
    required this.rungMonths,
    this.minEduLevel = 0,
    this.requiredDegreeId,
    this.minAge = 18,
    this.unlockLevel = 0,
  });

  JobDef get entry => rungs.first;
  JobDef get top => rungs.last;

  /// Total months from entry to the top rung.
  int get monthsToTop {
    var m = 0;
    for (var i = 0; i < rungs.length - 1; i++) {
      m += rungMonths[i];
    }
    return m;
  }
}
