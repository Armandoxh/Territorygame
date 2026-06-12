import 'dart:async';

import 'package:flutter/material.dart';

import '../data/catalog.dart';
import '../state/game_controller.dart';
import '../state/save_service.dart';
import '../util/format.dart';
import '../version.dart';
import 'widgets/lucide.dart';
import 'business_app.dart';
import 'commodities_app.dart';
import 'credit_app.dart';
import 'dashboard_tab.dart';
import 'goals_app.dart';
import 'insurance_app.dart';
import 'invest_app.dart';
import 'life_app.dart';
import 'life_tab.dart';
import 'news_tab.dart';
import 'prestige_app.dart';
import 'property_tab.dart';
import 'rivals_app.dart';
import 'sports_app.dart';
import 'widgets/app_notifications.dart';
import 'widgets/app_scaffold.dart';
import 'widgets/ui_helpers.dart';

/// The home screen is a phone: a status panel up top, a grid of "apps", and a
/// persistent Next Month button. Each app opens full-screen.
class PhoneHome extends StatefulWidget {
  const PhoneHome({super.key});

  @override
  State<PhoneHome> createState() => _PhoneHomeState();
}

class _PhoneHomeState extends State<PhoneHome> {
  int _prestige = 0;
  late GameController game;
  Timer? _saveTimer;

  @override
  void initState() {
    super.initState();
    game = GameController(prestige: _prestige);
    _attachSave(game);
    _restore();
  }

  /// Load a saved life on boot, if one exists, replacing the fresh game.
  Future<void> _restore() async {
    final loaded = await SaveService.load();
    if (loaded == null || !mounted) return;
    setState(() {
      game.removeListener(_scheduleSave);
      game.dispose();
      game = loaded;
      _prestige = loaded.prestige;
      _attachSave(game);
    });
  }

  /// Persist on every change, debounced so a flurry of taps writes once.
  void _attachSave(GameController g) => g.addListener(_scheduleSave);

  void _scheduleSave() {
    _saveTimer?.cancel();
    _saveTimer =
        Timer(const Duration(milliseconds: 800), () => SaveService.save(game));
  }

  /// Swap in a brand-new life (after retiring or dying) and persist it at once,
  /// overwriting the old save.
  void _newGame(int prestige) {
    setState(() {
      game.removeListener(_scheduleSave);
      final old = game;
      _prestige = prestige;
      game = GameController(prestige: _prestige);
      _attachSave(game);
      old.dispose();
    });
    SaveService.save(game);
  }

  @override
  void dispose() {
    _saveTimer?.cancel();
    game.removeListener(_scheduleSave);
    game.dispose();
    super.dispose();
  }

  void _open(Widget app) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => app));
  }

  /// Retire (once eligible): show a legacy screen, then start a fresh life at
  /// the next prestige level — which unlocks new content.
  Future<void> _retire() async {
    final newLevel = _prestige + 1;
    final unlocks = Catalog.unlocksAt(newLevel);
    final theme = Theme.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Retire & start over?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
                'You retire at age ${game.ageYears} with a net worth of '
                '${moneyWhole(game.netWorth)}. A life well played.',
                style: theme.textTheme.bodyMedium),
            const SizedBox(height: 12),
            Text('Begin again at ${Catalog.startAge} as ★ Prestige $newLevel.',
                style: theme.textTheme.titleSmall),
            if (unlocks.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('Newly unlocked:',
                  style: theme.textTheme.labelMedium
                      ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
              for (final u in unlocks)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text('• $u', style: theme.textTheme.bodySmall),
                ),
            ],
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Keep playing')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Retire')),
        ],
      ),
    );
    if (confirmed == true) {
      _newGame(newLevel);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListenableBuilder(
      listenable: game,
      builder: (context, _) {
        if (game.isDead) {
          return _DeathScreen(
            game: game,
            prestige: _prestige,
            onNewLife: () => _newGame(_prestige),
          );
        }
        return Scaffold(
          body: SafeArea(
            child: Column(
              children: [
                _StatusPanel(game: game, prestige: _prestige),
                if (game.canRetire)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
                    child: FilledButton.icon(
                      onPressed: _retire,
                      icon: Lucide('party-popper',
                          size: 18, color: theme.colorScheme.onPrimary),
                      label: const Text('You can retire — start a new life'),
                    ),
                  ),
                Expanded(
                  child: GridView.count(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 96),
                    crossAxisCount: 3,
                    // Cells need to be taller than they are wide: a 64px icon
                    // plus two text labels needs ~120px, but on a narrow phone
                    // three columns leave each cell only ~111px wide — a 1:1
                    // ratio would clip the labels. Give them headroom.
                    childAspectRatio: 0.78,
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                    children: [
                      _AppIcon(
                        label: 'Vault',
                        sub: 'Bank',
                        icon: 'landmark',
                        color: const Color(0xFF2E7D32),
                        badge: game.appUnread['vault'] ?? 0,
                        onTap: () => _open(AppScaffold(
                          game: game,
                          title: 'Vault',
                          appId: 'vault',
                          body: (_) => DashboardTab(game: game),
                        )),
                      ),
                      _AppIcon(
                        label: 'Sherwood',
                        sub: 'Invest',
                        icon: 'trending-up',
                        color: const Color(0xFF00A86B),
                        badge: game.appUnread['sherwood'] ?? 0,
                        onTap: () => _open(InvestApp(game: game)),
                      ),
                      _AppIcon(
                        label: 'Nestly',
                        sub: 'Real estate',
                        icon: 'house',
                        color: const Color(0xFF5C6BC0),
                        badge: game.appUnread['nestly'] ?? 0,
                        onTap: () => _open(AppScaffold(
                          game: game,
                          title: 'Nestly',
                          appId: 'nestly',
                          body: (_) => PropertyTab(game: game),
                        )),
                      ),
                      _AppIcon(
                        label: 'Hustl',
                        sub: 'Jobs',
                        icon: 'briefcase',
                        color: const Color(0xFFEF6C00),
                        badge: game.appUnread['hustl'] ?? 0,
                        onTap: () => _open(AppScaffold(
                          game: game,
                          title: 'Hustl',
                          appId: 'hustl',
                          body: (_) => LifeTab(game: game),
                        )),
                      ),
                      _AppIcon(
                        label: 'Ledger',
                        sub: 'News',
                        icon: 'newspaper',
                        color: const Color(0xFF6D4C41),
                        badge: game.appUnread['ledger'] ?? 0,
                        onTap: () => _open(AppScaffold(
                          game: game,
                          title: 'The Daily Ledger',
                          appId: 'ledger',
                          body: (_) => NewsTab(game: game),
                        )),
                      ),
                      _AppIcon(
                        label: 'DraftDay',
                        sub: 'Sports bets',
                        icon: 'dices',
                        color: const Color(0xFFC62828),
                        badge: game.appUnread['draftday'] ?? 0,
                        onTap: () => _open(AppScaffold(
                          game: game,
                          title: 'DraftDay',
                          appId: 'draftday',
                          body: (_) => SportsBody(game: game),
                        )),
                      ),
                      _AppIcon(
                        label: 'Life',
                        sub: 'Expenses',
                        icon: 'heart-pulse',
                        color: const Color(0xFF00897B),
                        badge: game.appUnread['life'] ?? 0,
                        onTap: () => _open(LifeApp(game: game)),
                      ),
                      _AppIcon(
                        label: 'Comex',
                        sub: 'Commodities',
                        icon: 'gem',
                        color: const Color(0xFFB8860B),
                        badge: game.appUnread['comex'] ?? 0,
                        onTap: () => _open(AppScaffold(
                          game: game,
                          title: 'Comex',
                          appId: 'comex',
                          body: (_) => CommoditiesBody(game: game),
                        )),
                      ),
                      _AppIcon(
                        label: 'Main St',
                        sub: 'Businesses',
                        icon: 'store',
                        color: const Color(0xFF8E24AA),
                        badge: game.appUnread['mainst'] ?? 0,
                        onTap: () => _open(AppScaffold(
                          game: game,
                          title: 'Main Street',
                          appId: 'mainst',
                          body: (_) => BusinessBody(game: game),
                        )),
                      ),
                      _AppIcon(
                        label: 'Prestige',
                        sub: 'Perks',
                        icon: 'sparkles',
                        color: const Color(0xFFB8860B),
                        badge: game.appUnread['prestige'] ?? 0,
                        onTap: () => _open(AppScaffold(
                          game: game,
                          title: 'Prestige',
                          appId: 'prestige',
                          body: (_) => PrestigeBody(game: game),
                        )),
                      ),
                      _AppIcon(
                        label: 'Goals',
                        sub: 'Score',
                        icon: 'target',
                        color: const Color(0xFFD81B60),
                        badge: game.appUnread['goals'] ?? 0,
                        onTap: () => _open(AppScaffold(
                          game: game,
                          title: 'Goals',
                          appId: 'goals',
                          body: (_) => GoalsBody(game: game),
                        )),
                      ),
                      _AppIcon(
                        label: 'Shield',
                        sub: 'Insurance',
                        icon: 'shield',
                        color: const Color(0xFF3949AB),
                        badge: game.appUnread['shield'] ?? 0,
                        onTap: () => _open(AppScaffold(
                          game: game,
                          title: 'Shield',
                          appId: 'shield',
                          body: (_) => InsuranceBody(game: game),
                        )),
                      ),
                      _AppIcon(
                        label: 'Credit',
                        sub: 'Score',
                        icon: 'credit-card',
                        color: const Color(0xFF00838F),
                        badge: game.appUnread['credit'] ?? 0,
                        onTap: () => _open(AppScaffold(
                          game: game,
                          title: 'Credit',
                          appId: 'credit',
                          body: (_) => CreditBody(game: game),
                        )),
                      ),
                      _AppIcon(
                        label: 'Rivals',
                        sub: 'Leaderboard',
                        icon: 'users',
                        color: const Color(0xFF7B1FA2),
                        badge: game.appUnread['rivals'] ?? 0,
                        onTap: () => _open(AppScaffold(
                          game: game,
                          title: 'Rivals',
                          appId: 'rivals',
                          body: (_) => RivalsBody(game: game),
                        )),
                      ),
                    ],
                  ),
                ),
                Text('v$kAppVersion · build $kBuildNumber',
                    style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant)),
                const SizedBox(height: 8),
              ],
            ),
          ),
          floatingActionButton: advanceControls(context, game),
          floatingActionButtonLocation:
              FloatingActionButtonLocation.centerFloat,
        );
      },
    );
  }
}

/// Shown when the player dies — the life is over. A eulogy with the final
/// tally, then a button to begin a fresh life at the start age (same prestige;
/// you didn't
/// retire rich, so no prestige reward — that's the sting of not making it).
class _DeathScreen extends StatelessWidget {
  const _DeathScreen({
    required this.game,
    required this.prestige,
    required this.onNewLife,
  });

  final GameController game;
  final int prestige;
  final VoidCallback onNewLife;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Lucide('flag', size: 44, color: theme.colorScheme.outline),
                const SizedBox(height: 16),
                Text('A life lived', style: theme.textTheme.headlineSmall),
                const SizedBox(height: 8),
                Text(
                  'You passed away at age ${game.ageYears}.',
                  style: theme.textTheme.titleMedium,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                _stat(theme, 'Final net worth', moneyWhole(game.netWorth)),
                _stat(theme, 'Legacy score', '${game.score} pts'),
                _stat(theme, 'Prestige', prestige > 0 ? '★ $prestige' : '—'),
                const SizedBox(height: 24),
                Text(
                  'You didn\'t retire a millionaire, so there\'s no prestige '
                  'reward this time — the clock ran out. Your score and unlocks '
                  'carry on.',
                  style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: onNewLife,
                  child: Text('Begin a new life at ${Catalog.startAge}'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _stat(ThemeData theme, String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(k,
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            const SizedBox(width: 24),
            Text(v,
                style: theme.textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.bold)),
          ],
        ),
      );
}

class _StatusPanel extends StatelessWidget {
  const _StatusPanel({required this.game, required this.prestige});
  final GameController game;
  final int prestige;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            theme.colorScheme.primary.withOpacity(0.30),
            Colors.transparent,
          ],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: Column(
        children: [
          Text(
              'Month ${game.day}  •  Age ${game.ageYears}'
              '${prestige > 0 ? '  •  ★ Prestige $prestige' : ''}',
              style: theme.textTheme.labelMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant)),
          const SizedBox(height: 6),
          Text('Net Worth',
              style: theme.textTheme.labelMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant)),
          Text(moneyWhole(game.netWorth),
              style: theme.textTheme.displaySmall
                  ?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text('Cash ${moneyWhole(game.cash)}',
              style: theme.textTheme.bodyMedium),
          const SizedBox(height: 8),
          _HealthBar(health: game.health),
          if (game.ongoing.isNotEmpty) ...[
            const SizedBox(height: 6),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 6,
              runSpacing: 4,
              children: [
                for (final e in game.ongoing)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: kLoss.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '${e.label} · ${e.monthsLeft} mo',
                      style: theme.textTheme.labelSmall?.copyWith(color: kLoss),
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// A slim health bar in the status panel — the clock you're racing.
class _HealthBar extends StatelessWidget {
  const _HealthBar({required this.health});
  final int health;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = health >= 60
        ? kGain
        : health >= 30
            ? const Color(0xFFEF6C00)
            : kLoss;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Lucide('heart-pulse', size: 14, color: color),
        const SizedBox(width: 6),
        SizedBox(
          width: 130,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: (health / 100).clamp(0.0, 1.0),
              minHeight: 6,
              backgroundColor: theme.colorScheme.surfaceContainerHighest,
              valueColor: AlwaysStoppedAnimation(color),
            ),
          ),
        ),
        const SizedBox(width: 6),
        Text('$health',
            style: theme.textTheme.labelSmall?.copyWith(color: color)),
      ],
    );
  }
}

class _AppIcon extends StatelessWidget {
  const _AppIcon({
    required this.label,
    required this.sub,
    required this.icon,
    required this.color,
    required this.onTap,
    this.badge = 0,
  });

  final String label;
  final String sub;
  final String icon;
  final Color color;
  final VoidCallback onTap;

  /// Unread notification count, shown as a red badge over the icon.
  final int badge;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [color, Color.lerp(color, Colors.black, 0.25)!],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Lucide(icon, size: 30, color: Colors.white),
              ),
              if (badge > 0)
                Positioned(
                  top: -5,
                  right: -5,
                  child: NotificationBadge(count: badge),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.labelLarge
                  ?.copyWith(fontWeight: FontWeight.w600)),
          Text(sub,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}
