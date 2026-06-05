import 'package:flutter/material.dart';

import '../state/game_controller.dart';
import '../util/format.dart';
import '../version.dart';
import 'commodities_app.dart';
import 'dashboard_tab.dart';
import 'invest_app.dart';
import 'life_app.dart';
import 'life_tab.dart';
import 'news_tab.dart';
import 'property_tab.dart';
import 'sports_app.dart';
import 'widgets/app_scaffold.dart';

/// The home screen is a phone: a status panel up top, a grid of "apps", and a
/// persistent Next Month button. Each app opens full-screen.
class PhoneHome extends StatefulWidget {
  const PhoneHome({super.key});

  @override
  State<PhoneHome> createState() => _PhoneHomeState();
}

class _PhoneHomeState extends State<PhoneHome> {
  late final GameController game;

  @override
  void initState() {
    super.initState();
    game = GameController();
  }

  @override
  void dispose() {
    game.dispose();
    super.dispose();
  }

  void _open(Widget app) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => app));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: ListenableBuilder(
          listenable: game,
          builder: (context, _) {
            return Column(
              children: [
                _StatusPanel(game: game),
                Expanded(
                  child: GridView.count(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 96),
                    crossAxisCount: 3,
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                    children: [
                      _AppIcon(
                        label: 'Vault',
                        sub: 'Bank',
                        icon: Icons.account_balance,
                        color: const Color(0xFF2E7D32),
                        onTap: () => _open(AppScaffold(
                          game: game,
                          title: 'Vault',
                          body: (_) => DashboardTab(game: game),
                        )),
                      ),
                      _AppIcon(
                        label: 'Sherwood',
                        sub: 'Invest',
                        icon: Icons.show_chart,
                        color: const Color(0xFF00A86B),
                        onTap: () => _open(InvestApp(game: game)),
                      ),
                      _AppIcon(
                        label: 'Nestly',
                        sub: 'Real estate',
                        icon: Icons.home,
                        color: const Color(0xFF5C6BC0),
                        onTap: () => _open(AppScaffold(
                          game: game,
                          title: 'Nestly',
                          body: (_) => PropertyTab(game: game),
                        )),
                      ),
                      _AppIcon(
                        label: 'Hustl',
                        sub: 'Jobs',
                        icon: Icons.work,
                        color: const Color(0xFFEF6C00),
                        onTap: () => _open(AppScaffold(
                          game: game,
                          title: 'Hustl',
                          body: (_) => LifeTab(game: game),
                        )),
                      ),
                      _AppIcon(
                        label: 'Ledger',
                        sub: 'News',
                        icon: Icons.newspaper,
                        color: const Color(0xFF6D4C41),
                        onTap: () => _open(AppScaffold(
                          game: game,
                          title: 'The Daily Ledger',
                          body: (_) => NewsTab(game: game),
                        )),
                      ),
                      _AppIcon(
                        label: 'DraftDay',
                        sub: 'Sports bets',
                        icon: Icons.sports_football,
                        color: const Color(0xFFC62828),
                        onTap: () => _open(AppScaffold(
                          game: game,
                          title: 'DraftDay',
                          body: (_) => SportsBody(game: game),
                        )),
                      ),
                      _AppIcon(
                        label: 'Life',
                        sub: 'Expenses',
                        icon: Icons.spa,
                        color: const Color(0xFF00897B),
                        onTap: () => _open(LifeApp(game: game)),
                      ),
                      _AppIcon(
                        label: 'Comex',
                        sub: 'Commodities',
                        icon: Icons.diamond,
                        color: const Color(0xFFB8860B),
                        onTap: () => _open(AppScaffold(
                          game: game,
                          title: 'Comex',
                          body: (_) => CommoditiesBody(game: game),
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
            );
          },
        ),
      ),
      floatingActionButton: advanceControls(context, game),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
    );
  }
}

class _StatusPanel extends StatelessWidget {
  const _StatusPanel({required this.game});
  final GameController game;

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
          Text('Month ${game.day}  •  Age ${game.ageYears}',
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
        ],
      ),
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
  });

  final String label;
  final String sub;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
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
            child: Icon(icon, color: Colors.white, size: 30),
          ),
          const SizedBox(height: 6),
          Text(label,
              style: theme.textTheme.labelLarge
                  ?.copyWith(fontWeight: FontWeight.w600)),
          Text(sub,
              style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}
