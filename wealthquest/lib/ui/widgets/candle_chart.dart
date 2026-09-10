import 'dart:math';

import 'package:flutter/material.dart';

import 'ui_helpers.dart';

/// A trading-style candlestick chart. We only store closes, so each candle's
/// open = previous close and its wicks are synthesized deterministically — it
/// reads like a real ticker without needing intraday data. Shows gridlines,
/// price labels, and a dashed last-price line.
class CandleChart extends StatelessWidget {
  const CandleChart({
    super.key,
    required this.series,
    this.height = 180,
    this.maxCandles = 48,
  });

  final List<double> series;
  final double height;
  final int maxCandles;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      height: height,
      width: double.infinity,
      child: CustomPaint(
        painter: _CandlePainter(
          series: series,
          maxCandles: maxCandles,
          grid: scheme.onSurfaceVariant.withOpacity(0.18),
          label: scheme.onSurfaceVariant,
          lastLine: scheme.primary,
        ),
      ),
    );
  }
}

class _Candle {
  final double open, high, low, close;
  _Candle(this.open, this.high, this.low, this.close);
  bool get up => close >= open;
}

class _CandlePainter extends CustomPainter {
  _CandlePainter({
    required this.series,
    required this.maxCandles,
    required this.grid,
    required this.label,
    required this.lastLine,
  });

  final List<double> series;
  final int maxCandles;
  final Color grid;
  final Color label;
  final Color lastLine;

  // Deterministic [0,1) pseudo-random so wicks are stable across repaints.
  double _r(int i) {
    final x = sin(i * 12.9898) * 43758.5453;
    return x - x.floorToDouble();
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (series.length < 2) return;
    final closes = series.length > maxCandles + 1
        ? series.sublist(series.length - (maxCandles + 1))
        : series;

    final candles = <_Candle>[];
    for (var i = 1; i < closes.length; i++) {
      final o = closes[i - 1];
      final c = closes[i];
      final hi = max(o, c);
      final lo = min(o, c);
      final body = hi - lo;
      final ref = (hi + lo) / 2;
      final wU = (body * 0.45 + ref * 0.004) * (0.4 + _r(i * 2));
      final wD = (body * 0.45 + ref * 0.004) * (0.4 + _r(i * 2 + 1));
      candles.add(_Candle(o, hi + wU, lo - wD, c));
    }
    if (candles.isEmpty) return;

    var minV = candles.first.low;
    var maxV = candles.first.high;
    for (final c in candles) {
      if (c.low < minV) minV = c.low;
      if (c.high > maxV) maxV = c.high;
    }
    final pad = (maxV - minV) * 0.06 + 1e-9;
    minV -= pad;
    maxV += pad;
    final range = (maxV - minV).abs() < 1e-9 ? 1.0 : maxV - minV;

    const rightPad = 52.0; // room for price labels
    final chartW = size.width - rightPad;
    double y(double v) => size.height - (v - minV) / range * size.height;

    // Gridlines + price labels.
    final gridPaint = Paint()
      ..color = grid
      ..strokeWidth = 1;
    for (var g = 0; g <= 3; g++) {
      final v = minV + range * g / 3;
      final yy = y(v);
      canvas.drawLine(Offset(0, yy), Offset(chartW, yy), gridPaint);
      _text(canvas, _fmt(v), Offset(chartW + 6, yy - 6), label);
    }

    // Candles.
    final n = candles.length;
    final slot = chartW / n;
    final bodyW = (slot * 0.62).clamp(1.5, 14.0);
    for (var i = 0; i < n; i++) {
      final c = candles[i];
      final cx = slot * (i + 0.5);
      final color = c.up ? kGain : kLoss;
      // wick
      canvas.drawLine(
        Offset(cx, y(c.high)),
        Offset(cx, y(c.low)),
        Paint()
          ..color = color
          ..strokeWidth = 1.2,
      );
      // body
      final top = y(max(c.open, c.close));
      final bot = y(min(c.open, c.close));
      final rect = Rect.fromLTRB(
          cx - bodyW / 2, top, cx + bodyW / 2, (bot - top).abs() < 1 ? top + 1 : bot);
      canvas.drawRect(rect, Paint()..color = color);
    }

    // Dashed last-price line.
    final lastV = candles.last.close;
    final ly = y(lastV);
    final dash = Paint()
      ..color = lastLine
      ..strokeWidth = 1;
    for (var x = 0.0; x < chartW; x += 8) {
      canvas.drawLine(Offset(x, ly), Offset(x + 4, ly), dash);
    }
    _text(canvas, _fmt(lastV), Offset(chartW + 6, ly - 6), lastLine, bold: true);
  }

  String _fmt(double v) {
    if (v >= 1000) return '\$${(v / 1000).toStringAsFixed(v >= 100000 ? 0 : 1)}k';
    if (v >= 1) return '\$${v.toStringAsFixed(0)}';
    return '\$${v.toStringAsFixed(3)}';
  }

  void _text(Canvas canvas, String s, Offset at, Color color,
      {bool bold = false}) {
    final tp = TextPainter(
      text: TextSpan(
        text: s,
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: bold ? FontWeight.bold : FontWeight.normal,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, at);
  }

  @override
  bool shouldRepaint(_CandlePainter old) => true;
}
