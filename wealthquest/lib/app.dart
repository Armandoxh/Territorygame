import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'ui/phone_home.dart';

class WealthQuestApp extends StatelessWidget {
  const WealthQuestApp({super.key});

  @override
  Widget build(BuildContext context) {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: const Color(0xFF2E7D32),
      brightness: Brightness.dark,
    );
    final base = ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: const Color(0xFF0E1512),
    );
    // Manrope is a clean, modern "fintech" sans with proper tabular figures —
    // a big step up from the default Roboto for money figures and headings.
    final textTheme = GoogleFonts.manropeTextTheme(base.textTheme);
    return MaterialApp(
      title: 'WealthQuest',
      debugShowCheckedModeBanner: false,
      theme: base.copyWith(
        textTheme: textTheme,
        primaryTextTheme: textTheme,
      ),
      // On wide screens (desktop/web) keep the phone-style UI in a centered,
      // phone-width column instead of stretching everything across the window.
      builder: (context, child) {
        return LayoutBuilder(
          builder: (context, constraints) {
            final w = constraints.maxWidth;
            final target = w > _maxAppWidth ? _maxAppWidth : w;
            return ColoredBox(
              color: const Color(0xFF05080A),
              child: Center(
                child: SizedBox(
                  width: target,
                  height: constraints.maxHeight,
                  child: child,
                ),
              ),
            );
          },
        );
      },
      home: const PhoneHome(),
    );
  }
}

/// Cap the UI at a comfortable phone width so it doesn't stretch on desktop.
const double _maxAppWidth = 480;
