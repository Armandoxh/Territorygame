import 'package:flutter/material.dart';

import 'ui/home_screen.dart';

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
      home: const HomeScreen(),
    );
  }
}
