import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// The design language: real transit signage. Helvetica-on-black is the NYC
/// subway's voice — Inter is the standard free stand-in. Route bullets,
/// station-sign bars, ink-on-cream paper. Every screen borrows from here so
/// the whole app speaks with one accent.
class TransitStyle {
  TransitStyle._();

  static const ink = Color(0xFF1A1A1A);
  static const paper = Color(0xFFF7F3E8);
  static const ground = Color(0xFFEFEAE0);

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
/// Yellow-ish lines get ink text (like the real N/Q/R/W).
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

/// A black station-sign bar with the signature white rule along the top —
/// the frame for headers and section titles.
class StationSign extends StatelessWidget {
  const StationSign({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    // The white rule is an inner strip: BoxDecoration can't mix a one-sided
    // border with rounded corners.
    return Container(
      width: double.infinity,
      clipBehavior: Clip.antiAlias,
      decoration: const BoxDecoration(
        color: TransitStyle.ink,
        borderRadius: BorderRadius.all(Radius.circular(10)),
      ),
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
