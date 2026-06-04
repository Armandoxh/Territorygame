import 'package:flutter/material.dart';

import '../state/game_controller.dart';
import '../util/format.dart';
import 'dashboard_tab.dart';
import 'life_tab.dart';
import 'market_tab.dart';
import 'portfolio_tab.dart';
import 'widgets/day_summary_dialog.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final GameController game;
  int _tab = 0;

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

  Future<void> _nextDay() async {
    final result = game.advanceDay();
    if (!mounted) return;
    await showDaySummary(context, game, result);
  }

  @override
  Widget build(BuildContext context) {
    final tabs = [
      DashboardTab(game: game),
      MarketTab(game: game),
      PortfolioTab(game: game),
      LifeTab(game: game),
    ];

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _Header(game: game),
            Expanded(
              child: ListenableBuilder(
                listenable: game,
                builder: (context, _) => tabs[_tab],
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _nextDay,
        icon: const Icon(Icons.skip_next),
        label: const Text('Next Day'),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.candlestick_chart_outlined),
            selectedIcon: Icon(Icons.candlestick_chart),
            label: 'Market',
          ),
          NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_outlined),
            selectedIcon: Icon(Icons.account_balance_wallet),
            label: 'Portfolio',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Life',
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.game});

  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListenableBuilder(
      listenable: game,
      builder: (context, _) {
        return Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                theme.colorScheme.primary.withOpacity(0.28),
                Colors.transparent,
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Net Worth',
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  Text(
                    'Day ${game.day}  •  Age ${game.ageYears}',
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                moneyWhole(game.netWorth),
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  _Pill(
                    icon: Icons.payments_outlined,
                    label: 'Cash ${moneyWhole(game.cash)}',
                  ),
                  const SizedBox(width: 8),
                  _Pill(
                    icon: Icons.trending_up,
                    label: 'Invested ${moneyWhole(game.holdingsValue)}',
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withOpacity(0.4),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: 5),
          Text(label, style: theme.textTheme.labelMedium),
        ],
      ),
    );
  }
}
