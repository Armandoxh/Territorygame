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
    // Per STYLE.md: a data dashboard, not a game menu. Square corners, 1px
    // hairlines, flat white panels, heavy neo-grotesque type, no shadows.
    return MaterialApp(
      title: 'Metro Magnate',
      debugShowCheckedModeBanner: false,
      theme: base.copyWith(
        textTheme: GoogleFonts.interTextTheme(base.textTheme),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: TransitStyle.ink,
            foregroundColor: Colors.white,
            textStyle: GoogleFonts.inter(fontWeight: FontWeight.w800),
            shape: const RoundedRectangleBorder(),
            elevation: 0,
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: TransitStyle.ink,
            side: const BorderSide(color: TransitStyle.ink, width: 1),
            textStyle: GoogleFonts.inter(fontWeight: FontWeight.w800),
            shape: const RoundedRectangleBorder(),
          ),
        ),
        dialogTheme: const DialogThemeData(
          backgroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            side: BorderSide(color: TransitStyle.ink, width: 1),
          ),
        ),
      ),
      home: const HomeScreen(),
    );
  }
}
