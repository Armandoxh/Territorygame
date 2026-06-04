import 'package:flutter/material.dart';

/// A lightweight net-worth sparkline. No charting dependency — just a
/// CustomPainter over the history list.
class NetWorthChart extends StatelessWidget {
  const NetWorthChart({super.key, required this.history});

  final List<double> history;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      height: 120,
      width: double.infinity,
      child: CustomPaint(
        painter: _ChartPainter(
          history: history,
          line: scheme.primary,
          fill: scheme.primary.withOpacity(0.15),
        ),
      ),
    );
  }
}

class _ChartPainter extends CustomPainter {
  _ChartPainter({
    required this.history,
    required this.line,
    required this.fill,
  });

  final List<double> history;
  final Color line;
  final Color fill;

  @override
  void paint(Canvas canvas, Size size) {
    if (history.length < 2) return;

    var min = history.first;
    var max = history.first;
    for (final v in history) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    final range = (max - min).abs() < 1e-6 ? 1.0 : max - min;

    double x(int i) => size.width * i / (history.length - 1);
    double y(double v) => size.height - (v - min) / range * size.height;

    final path = Path()..moveTo(0, y(history.first));
    for (var i = 1; i < history.length; i++) {
      path.lineTo(x(i), y(history[i]));
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
  bool shouldRepaint(_ChartPainter old) => true;
}
