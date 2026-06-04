import 'package:flutter/material.dart';

/// A line chart for a price (or value) series, coloured green/red by whether
/// the window ended higher than it started. Draws faint high/low guide lines.
class PriceChart extends StatelessWidget {
  const PriceChart({super.key, required this.series, this.height = 160});

  final List<double> series;
  final double height;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final up = series.length < 2 || series.last >= series.first;
    final color = up ? const Color(0xFF4CAF50) : const Color(0xFFE57373);
    return SizedBox(
      height: height,
      width: double.infinity,
      child: CustomPaint(
        painter: _PricePainter(
          series: series,
          line: color,
          fill: color.withOpacity(0.14),
          guide: scheme.onSurfaceVariant.withOpacity(0.25),
        ),
      ),
    );
  }
}

class _PricePainter extends CustomPainter {
  _PricePainter({
    required this.series,
    required this.line,
    required this.fill,
    required this.guide,
  });

  final List<double> series;
  final Color line;
  final Color fill;
  final Color guide;

  @override
  void paint(Canvas canvas, Size size) {
    if (series.length < 2) return;

    var min = series.first;
    var max = series.first;
    for (final v in series) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    final range = (max - min).abs() < 1e-9 ? 1.0 : max - min;

    double x(int i) => size.width * i / (series.length - 1);
    double y(double v) => size.height - (v - min) / range * size.height;

    // High / low guide lines.
    final guidePaint = Paint()
      ..color = guide
      ..strokeWidth = 1;
    canvas.drawLine(Offset(0, y(max)), Offset(size.width, y(max)), guidePaint);
    canvas.drawLine(Offset(0, y(min)), Offset(size.width, y(min)), guidePaint);

    final path = Path()..moveTo(0, y(series.first));
    for (var i = 1; i < series.length; i++) {
      path.lineTo(x(i), y(series[i]));
    }

    final area = Path.from(path)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();

    canvas.drawPath(area, Paint()..color = fill);
    canvas.drawPath(
      path,
      Paint()
        ..color = line
        ..strokeWidth = 2.5
        ..style = PaintingStyle.stroke
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(_PricePainter old) => true;
}
