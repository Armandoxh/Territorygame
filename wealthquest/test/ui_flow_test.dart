import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wealthquest/app.dart';

/// Smoke-tests the phone-home flow: open apps, browse the market, open an
/// asset, advance a month, and visit every app.
void main() {
  testWidgets('phone home: open apps, browse market, advance a month',
      (tester) async {
    // This is a phone UI. Render at a realistic phone size (390x844) rather
    // than the default 800x600 landscape test surface: the app caps its width
    // at 480 on wide screens, so a short 600px-tall window would wrap text into
    // extra lines and overflow non-scrolling columns — something neither a real
    // phone (taller) nor a real desktop (full window height) ever hits.
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const WealthQuestApp());
    await tester.pumpAndSettle();

    NavigatorState nav() =>
        tester.state<NavigatorState>(find.byType(Navigator).first);

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
    nav().pop(); // close the detail screen
    await tester.pumpAndSettle();

    // Advance a month from inside the app and dismiss the recap.
    await tester.tap(find.text('Next Month'));
    await tester.pumpAndSettle();
    expect(find.text('Continue'), findsOneWidget);
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    nav().pop(); // back to the phone home
    await tester.pumpAndSettle();

    // Open every other app and return.
    for (final app in const ['Vault', 'Nestly', 'Hustl', 'Ledger', 'DraftDay']) {
      await tester.tap(find.text(app));
      await tester.pumpAndSettle();
      nav().pop();
      await tester.pumpAndSettle();
    }

    expect(find.text('Net Worth'), findsOneWidget);
  });
}
