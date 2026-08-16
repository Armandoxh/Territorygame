/// The kind of life event a shield (insurance policy) covers. Pure data with no
/// dependencies, so both the crisis library and the insurance catalog can share
/// it without an import cycle.
///
/// [none] = uninsurable (windfalls, gambling, voluntary splurges, market bets).
/// Everything else maps 1:1 to an [InsurancePolicy] in `data/insurance.dart`.
enum CrisisCategory {
  none,
  health,
  auto,
  home,
  legal,
  income,
  family,
  education,
  tech,
}
