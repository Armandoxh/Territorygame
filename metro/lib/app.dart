import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'ui/home_screen.dart';
import 'ui/transit_style.dart';

class MetroMagnateApp extends StatelessWidget {
  const MetroMagnateApp({super.key});

  @override
  Widget build(BuildContext context) {
    final base = ThemeData(
      brightness: Brightness.light,
      colorSchemeSeed: const Color(0xFFEE352E),
      scaffoldBackgroundColor: TransitStyle.ground,
      useMaterial3: true,
    );
    return MaterialApp(
      title: 'Metro Magnate',
      debugShowCheckedModeBanner: false,
      // Transit signage voice: Inter everywhere (the standard Helvetica
      // stand-in), ink-on-cream, black signage buttons.
      theme: base.copyWith(
        textTheme: GoogleFonts.interTextTheme(base.textTheme),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: TransitStyle.ink,
            foregroundColor: Colors.white,
            textStyle: GoogleFonts.inter(fontWeight: FontWeight.w800),
            shape: const StadiumBorder(),
          ),
        ),
        cardTheme: const CardThemeData(
          color: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(12)),
            side: BorderSide(color: Color(0x33000000)),
          ),
        ),
      ),
      home: const HomeScreen(),
    );
  }
}
