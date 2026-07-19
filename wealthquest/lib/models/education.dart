/// A degree program: a time + money investment that raises your education
/// level and unlocks better-paying jobs. Tuition is borrowed as a student loan.
class DegreeDef {
  final String id;
  final String name; // "Bachelor's Degree"
  final int level; // 1 = associate, 2 = bachelor, 3 = master
  final int years; // study duration in years
  final double tuition; // borrowed up front as a student loan

  /// A SPECIFIC professional degree (MD, JD) rather than a general ladder rung.
  /// You can stack one on top of a general degree, and a higher general level
  /// doesn't substitute for it.
  final bool professional;

  final String blurb;

  const DegreeDef({
    required this.id,
    required this.name,
    required this.level,
    required this.years,
    required this.tuition,
    this.professional = false,
    this.blurb = '',
  });

  int get months => years * 12;
}

/// Human label for an education level (0..3).
String educationLabel(int level) {
  switch (level) {
    case 1:
      return "Associate's degree";
    case 2:
      return "Bachelor's degree";
    case 3:
      return "Master's degree";
    default:
      return 'No degree';
  }
}
