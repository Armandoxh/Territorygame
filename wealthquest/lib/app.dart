import 'package:flutter/material.dart';

import 'ui/phone_home.dart';

class WealthQuestApp extends StatelessWidget {
  const WealthQuestApp({super.key});

  @override
  Widget build(BuildContext context) {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: const Color(0xFF2E7D32),
      brightness: Brightness.dark,
    );
    return MaterialApp(
      title: 'WealthQuest',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: colorScheme,
        scaffoldBackgroundColor: const Color(0xFF0E1512),
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
