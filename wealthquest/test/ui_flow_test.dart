import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wealthquest/app.dart';

/// Smoke-tests the phone-home flow: launch an app, browse the market, open an
/// asset, advance a month, and open every app — the way a player would.
void main() {
  testWidgets('phone home: open apps, browse market, advance a month',
      (tester) async {
    await tester.pumpWidget(const WealthQuestApp());
    await tester.pumpAndSettle();

    // Home shows the status panel + version badge + the app grid.
    expect(find.text('Net Worth'), findsOneWidget);
    expect(find.textContaining('build'), findsWidgets);
    expect(find.text('Sherwood'), findsOneWidget);

    // Open the investing app → Market → Stocks → an asset detail.
    await tester.tap(find.text('Sherwood'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Market'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Stocks'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Apt Technologies').first);
    await tester.pumpAndSettle();
    expect(find.text('Key stats'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    // Advance a month from inside the app and dismiss the recap.
    await tester.tap(find.text('Next Month'));
    await tester.pumpAndSettle();
    expect(find.text('Continue'), findsOneWidget);
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    // Back to the phone home, then open every other app and return.
    await tester.pageBack();
    await tester.pumpAndSettle();
    for (final app in const ['Vault', 'Nestly', 'Hustl', 'Ledger']) {
      await tester.tap(find.text(app));
      await tester.pumpAndSettle();
      await tester.pageBack();
      await tester.pumpAndSettle();
    }

    expect(find.text('Net Worth'), findsOneWidget);
  });
}
