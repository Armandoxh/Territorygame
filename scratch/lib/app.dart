import 'package:flutter/material.dart';

import 'ui/home_screen.dart';

class ScratchEmpireApp extends StatelessWidget {
  const ScratchEmpireApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Scratch Empire',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        colorSchemeSeed: const Color(0xFFFFB300),
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}
