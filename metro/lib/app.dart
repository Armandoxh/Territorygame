import 'package:flutter/material.dart';

import 'ui/home_screen.dart';

class MetroMagnateApp extends StatelessWidget {
  const MetroMagnateApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Metro Magnate',
      debugShowCheckedModeBanner: false,
      // Light chrome to match the paper-map centerpiece.
      theme: ThemeData(
        brightness: Brightness.light,
        colorSchemeSeed: const Color(0xFFEE352E),
        scaffoldBackgroundColor: const Color(0xFFEFEAE0),
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}
