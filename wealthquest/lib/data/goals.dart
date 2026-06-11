import '../state/game_controller.dart';
import 'catalog.dart';

/// A scored objective. [done] is a pure predicate over the current game state —
/// goals auto-complete as you play, giving the game direction and a score.
class Goal {
  const Goal(this.id, this.title, this.detail, this.points, this.group, this.done);

  final String id;
  final String title;
  final String detail;
  final int points;
  final String group;
  final bool Function(GameController g) done;
}

/// The full achievement checklist — the spine that pulls a player through every
/// system and gives a reason to keep going past the first million.
class Goals {
  Goals._();

  static final List<Goal> all = [
    // ---- Wealth ----
    Goal('nw_10k', 'Getting started', 'Reach \$10k net worth.', 10, 'Wealth',
        (g) => g.netWorth >= 10000),
    Goal('nw_100k', 'Six figures', 'Reach \$100k net worth.', 25, 'Wealth',
        (g) => g.netWorth >= 100000),
    Goal('nw_500k', 'Half a million', 'Reach \$500k net worth.', 50, 'Wealth',
        (g) => g.netWorth >= 500000),
    Goal('nw_1m', 'Millionaire', 'Reach \$1M — retirement-eligible.', 100,
        'Wealth', (g) => g.netWorth >= 1000000),
    Goal('nw_5m', 'Seriously wealthy', 'Reach \$5M net worth.', 200, 'Wealth',
        (g) => g.netWorth >= 5000000),
    Goal('nw_10m', 'Eight figures', 'Reach \$10M net worth.', 400, 'Wealth',
        (g) => g.netWorth >= 10000000),

    // ---- Career ----
    Goal('degree', 'Educated', 'Earn your first degree.', 20, 'Career',
        (g) => g.completedDegrees.isNotEmpty),
    Goal('two_degrees', 'Overachiever', 'Earn two degrees.', 40, 'Career',
        (g) => g.completedDegrees.length >= 2),
    Goal('six_fig_job', 'Big earner', 'Land a job paying \$100k+/year.', 40,
        'Career', (g) => g.job.pay >= 8333),
    Goal('top_job', 'Top of the ladder', 'Earn \$40k+/month from your career.',
        80, 'Career', (g) => g.job.pay >= 40000),
    Goal('retire_fund', 'Future you', 'Build \$250k in your 401(k).', 50,
        'Career', (g) => g.retirementBalance >= 250000),

    // ---- Investing ----
    Goal('first_invest', 'First trade', 'Buy your first investment.', 10,
        'Investing', (g) => g.holdings.isNotEmpty),
    Goal('diversified', 'Diversified',
        'Hold an asset in all five investment categories at once.', 40,
        'Investing',
        (g) => Catalog.categories.every((c) => g.holdings
            .any((h) => Catalog.assetById(h.assetId).categoryId == c.id))),

    // ---- Real estate ----
    Goal('first_rental', 'Landlord', 'Own your first property.', 25,
        'Real estate', (g) => g.properties.isNotEmpty),
    Goal('re_mogul', 'Property mogul', 'Own three properties at once.', 60,
        'Real estate', (g) => g.properties.length >= 3),

    // ---- Business ----
    Goal('first_biz', 'Entrepreneur', 'Buy your first business.', 25, 'Business',
        (g) => g.businesses.isNotEmpty),
    Goal('biz_empire', 'Conglomerate', 'Run three businesses at once.', 60,
        'Business', (g) => g.businesses.length >= 3),

    // ---- Betting ----
    Goal('first_win', 'Beginner\'s luck', 'Win a sports bet.', 15, 'Betting',
        (g) => g.betsWon >= 1),

    // ---- Life ----
    Goal('married', 'Settled down', 'Get married.', 20, 'Life',
        (g) => g.relationship == RelationshipStage.married),
    Goal('parent', 'Parent', 'Have a child.', 20, 'Life',
        (g) => g.children >= 1),
    Goal('big_family', 'Full house', 'Raise three kids.', 40, 'Life',
        (g) => g.children >= 3),
    Goal('inner_circle', 'Connected',
        'Reach the Inner Circle — top social standing.', 50, 'Life',
        (g) => g.standingTier >= 3),
    Goal('luxury_life', 'Living large', 'Live in a luxury home or an estate.',
        30, 'Life',
        (g) => g.housing != null &&
            (g.housing!.id == 'luxury' || g.housing!.id == 'estate')),

    // ---- Resilience ----
    Goal('phoenix', 'Phoenix', 'Survive a bankruptcy and keep going.', 30,
        'Resilience', (g) => g.bankruptcies >= 1),

    // ---- Prestige ----
    Goal('retire_once', 'New beginning',
        'Retire and start a new life (Prestige 1).', 60, 'Prestige',
        (g) => g.prestige >= 1),
    Goal('prestige3', 'Living legend', 'Reach Prestige 3.', 150, 'Prestige',
        (g) => g.prestige >= 3),
  ];

  static final Map<String, Goal> _byId = {for (final x in all) x.id: x};
  static Goal byId(String id) => _byId[id]!;

  static int pointsFor(Iterable<String> ids) {
    var s = 0;
    for (final id in ids) {
      final goal = _byId[id];
      if (goal != null) s += goal.points;
    }
    return s;
  }

  static int get totalPoints => all.fold(0, (s, x) => s + x.points);

  /// Goal groups in display order.
  static List<String> get groups {
    final seen = <String>[];
    for (final goal in all) {
      if (!seen.contains(goal.group)) seen.add(goal.group);
    }
    return seen;
  }
}
