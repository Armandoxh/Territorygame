import 'package:flutter/material.dart';

import '../state/game_controller.dart';
import 'market_tab.dart';
import 'portfolio_tab.dart';
import 'widgets/app_scaffold.dart';
import 'widgets/swipe_back.dart';

/// "Sherwood" — the investing app (a play on Robinhood). Holds the whole market
/// (browse + buy/sell/short) and your portfolio.
class InvestApp extends StatelessWidget {
  const InvestApp({super.key, required this.game});

  final GameController game;

  @override
  Widget build(BuildContext context) {
    return SwipeBack(
      child: DefaultTabController(
        length: 2,
        child: Scaffold(
          appBar: AppBar(
            title: const Text('Sherwood'),
            actions: [CashBadge(game: game)],
            bottom: const TabBar(
              tabs: [
                Tab(text: 'Portfolio'),
                Tab(text: 'Market'),
              ],
            ),
          ),
          body: ListenableBuilder(
            listenable: game,
            builder: (context, _) => TabBarView(
              children: [
                PortfolioTab(game: game),
                MarketTab(game: game),
              ],
            ),
          ),
          floatingActionButton: advanceControls(context, game),
          floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
        ),
      ),
    );
  }
}
