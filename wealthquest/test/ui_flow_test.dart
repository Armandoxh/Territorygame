import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wealthquest/app.dart';

/// Smoke-tests the real UI flow by tapping through the actual screens, the way
/// a player would. Catches wiring bugs (navigation, dialogs, tab refresh) that
/// the logic-only play-agent can't see.
void main() {
  testWidgets('core flow: advance a week, browse market, open an asset, '
      'visit every tab', (tester) async {
    await tester.pumpWidget(const WealthQuestApp());
    await tester.pumpAndSettle();

    // Header + version badge are present.
    expect(find.text('Net Worth'), findsOneWidget);
    expect(find.textContaining('build'), findsWidgets);

    // Advance one week and dismiss the summary dialog.
    await tester.tap(find.text('Next Week'));
    await tester.pumpAndSettle();
    expect(find.text('Continue'), findsOneWidget);
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    // Market → Stocks sub-tab → open an asset detail.
    await tester.tap(find.text('Market'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Stocks'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Apt Technologies').first);
    await tester.pumpAndSettle();
    expect(find.text('Key stats'), findsOneWidget);

    // Back out of the detail screen.
    await tester.pageBack();
    await tester.pumpAndSettle();

    // Visit the remaining tabs without throwing.
    for (final tab in const ['News', 'Portfolio', 'Life', 'Home']) {
      await tester.tap(find.text(tab));
      await tester.pumpAndSettle();
    }

    expect(find.text('Net Worth'), findsOneWidget);
  });
}
