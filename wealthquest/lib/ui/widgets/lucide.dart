import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Renders a bundled Lucide SVG icon (`assets/icons/<name>.svg`), recolored to
/// [color] (or the ambient [IconTheme] color). Lucide is a free, ISC-licensed
/// icon set — SVG-based, so it sidesteps Flutter 3.44's sealed `IconData` that
/// broke the icon-font packages.
class Lucide extends StatelessWidget {
  const Lucide(this.name, {super.key, this.size = 24, this.color});

  final String name;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? IconTheme.of(context).color;
    return SvgPicture.asset(
      'assets/icons/$name.svg',
      width: size,
      height: size,
      colorFilter: c == null ? null : ColorFilter.mode(c, BlendMode.srcIn),
    );
  }
}
