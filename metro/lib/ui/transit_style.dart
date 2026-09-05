import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// The design language — see STYLE.md (authoritative): the modern NYC Live
/// Subway Map dashboard. Flat #F4F4F4 ground, official line hexes, heavy
/// Swiss neo-grotesque type (Inter as the Helvetica stand-in), and UI that
/// reads as a data overlay: 1px borders, square corners, no shadows.
class TransitStyle {
  TransitStyle._();

  static const ink = Color(0xFF1A1A1A);
  static const ground = Color(0xFFF4F4F4);
  static const hairline = Color(0x33000000); // the razor-thin 1px border

  static TextStyle signage({
    double size = 14,
    Color color = Colors.white,
    FontWeight weight = FontWeight.w800,
    double spacing = 0,
  }) =>
      GoogleFonts.inter(
        fontSize: size,
        color: color,
        fontWeight: weight,
        letterSpacing: spacing,
      );
}

/// The iconic route bullet: a colored disc with the line's letter/number.
/// Light lines (like the #FCCC0A N/Q/R/W) get ink text, exactly like the
/// real system.
class RouteBullet extends StatelessWidget {
  const RouteBullet({
    super.key,
    required this.label,
    required this.color,
    this.size = 24,
    this.dimmed = false,
  });

  final String label;
  final Color color;
  final double size;
  final bool dimmed;

  @override
  Widget build(BuildContext context) {
    final darkText = color.computeLuminance() > 0.5;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: dimmed ? const Color(0xFF9E9E9E) : color,
        shape: BoxShape.circle,
      ),
      child: Center(
        child: Text(
          label,
          style: TransitStyle.signage(
            size: size * 0.55,
            color: darkText ? TransitStyle.ink : Colors.white,
            weight: FontWeight.w900,
          ),
        ),
      ),
    );
  }
}

/// A black station-sign bar with the signature white rule along the top.
/// Square corners — this is signage, not a game card.
class StationSign extends StatelessWidget {
  const StationSign({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: TransitStyle.ink,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(height: 3, color: Colors.white),
          Padding(
            padding: padding ?? const EdgeInsets.fromLTRB(16, 12, 16, 14),
            child: child,
          ),
        ],
      ),
    );
  }
}

/// A flat white data panel: 1px hairline border, 0-radius corners.
class DataPanel extends StatelessWidget {
  const DataPanel({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding ?? const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: TransitStyle.hairline, width: 1),
      ),
      child: child,
    );
  }
}

