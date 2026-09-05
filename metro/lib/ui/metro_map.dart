import 'dart:math';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../data/cities.dart';
import '../state/game_state.dart';
import 'transit_style.dart';

/// The classic paper transit map: cream ground, colored lines through
/// white-ringed station dots, trains sliding along them, waiting counts at
/// each platform, and floating "+$" as riders board. Locked lines are drawn
/// dashed — the routes you're saving for. Tap a served station to open it.
class MetroMap extends StatefulWidget {
  const MetroMap({super.key, required this.game, required this.onStationTap});

  final GameState game;
  final void Function(StationDef station) onStationTap;

  @override
  State<MetroMap> createState() => _MetroMapState();
}

class _MetroMapState extends State<MetroMap> {
  int _seenSeq = 0;
  final List<_FarePop> _pops = [];

  void _handleTap(Offset local, Size size) {
    final g = widget.game;
    final s = size.shortestSide / 100.0;
    final origin = Offset(
        (size.width - 100 * s) / 2, (size.height - 100 * s) / 2);
    final map = (local - origin) / s;
    StationDef? best;
    var bestD = 8.0; // tap tolerance in map units
    for (final st in g.city.stations) {
      if (!g.isServed(st.id)) continue;
      final d = (st.pos - map).distance;
      if (d < bestD) {
        bestD = d;
        best = st;
      }
    }
    if (best != null) widget.onStationTap(best);
  }

  @override
  Widget build(BuildContext context) {
    final g = widget.game;
    final now = DateTime.now().millisecondsSinceEpoch;

    if (g.boardSeq != _seenSeq) {
      _seenSeq = g.boardSeq;
      if (g.lastBoardAmount >= 1 && g.lastBoardStationId.isNotEmpty) {
        _pops.add(_FarePop(
          stationId: g.lastBoardStationId,
          amount: g.lastBoardAmount,
          bornMs: now,
        ));
      }
    }
    _pops.removeWhere((p) => now - p.bornMs > _FarePop.lifeMs);

    return AspectRatio(
      aspectRatio: 1.05,
      child: Container(
        // STYLE.md: flat ultra-light landmass, 1px hairline, square corners.
        decoration: BoxDecoration(
          color: TransitStyle.ground,
          border: Border.all(color: TransitStyle.hairline, width: 1),
        ),
        clipBehavior: Clip.hardEdge,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final size = Size(constraints.maxWidth, constraints.maxHeight);
            return Stack(
              children: [
                Positioned.fill(
                  child: GestureDetector(
                    onTapUp: (d) => _handleTap(d.localPosition, size),
                    child: CustomPaint(
                      painter: _MapPainter(
                        game: g,
                        pops: List.of(_pops),
                        nowMs: now,
                      ),
                    ),
                  ),
                ),
                Positioned(
                  right: 10,
                  bottom: 10,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 5),
                    color: TransitStyle.ink,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (final line in g.city.lines)
                          if (g.isUnlocked(line.id))
                            Padding(
                              padding: const EdgeInsets.only(right: 5),
                              child: RouteBullet(
                                  label: line.bullet,
                                  color: line.color,
                                  size: 15),
                            ),
                        const SizedBox(width: 1),
                        Text(
                          '${g.city.name} Transit',
                          style:
                              TransitStyle.signage(size: 11, spacing: 1.1),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _FarePop {
  const _FarePop(
      {required this.stationId, required this.amount, required this.bornMs});
  final String stationId;
  final double amount;
  final int bornMs;

  static const int lifeMs = 1100;
}

class _MapPainter extends CustomPainter {
  _MapPainter({required this.game, required this.pops, required this.nowMs});

  final GameState game;
  final List<_FarePop> pops;
  final int nowMs;

  static const _ink = TransitStyle.ink;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.shortestSide / 100.0;
    Offset m(Offset p) => Offset(
        p.dx * s + (size.width - 100 * s) / 2,
        p.dy * s + (size.height - 100 * s) / 2);

    // STYLE.md: the landmass is one flat color — no grid, no texture. The
    // city comes from geography: flat water bodies with map labels, and
    // asymmetric park blocks.
    final city = game.city;

    final waterPaint = Paint()..color = const Color(0xFFBFD7E4);
    for (final poly in city.waters) {
      final wp = Path()..moveTo(m(poly.first).dx, m(poly.first).dy);
      for (final p in poly.skip(1)) {
        wp.lineTo(m(p).dx, m(p).dy);
      }
      wp.close();
      canvas.drawPath(wp, waterPaint);
    }
    for (final wl in city.waterLabels) {
      final tp = TextPainter(
        text: TextSpan(
          text: wl.text,
          style: GoogleFonts.inter(
            color: const Color(0xFF6E93AC),
            fontSize: (2.4 * s).clamp(7.0, 10.0),
            fontWeight: FontWeight.w700,
            letterSpacing: 1.2,
          ),
        ),
        textAlign: TextAlign.center,
        textDirection: TextDirection.ltr,
      )..layout();
      final c = m(Offset(wl.x, wl.y));
      canvas.save();
      canvas.translate(c.dx, c.dy);
      canvas.rotate(wl.rotDeg * pi / 180);
      tp.paint(canvas, Offset(-tp.width / 2, -tp.height / 2));
      canvas.restore();
    }
    final parkPaint = Paint()..color = const Color(0xFFCBE2C6);
    for (final park in city.parks) {
      final c = m(Offset(park.cx, park.cy));
      canvas.save();
      canvas.translate(c.dx, c.dy);
      canvas.rotate(park.rotDeg * pi / 180);
      canvas.drawRect(
          Rect.fromCenter(
              center: Offset.zero, width: park.w * s, height: park.h * s),
          parkPaint);
      canvas.restore();
    }

    // Locked lines first (under everything): dashed "planned routes".
    for (final line in city.lines) {
      if (game.isUnlocked(line.id)) continue;
      _drawDashedLine(canvas, m, s, line);
    }
    // Unlocked lines: solid and proud.
    for (final line in city.lines) {
      if (!game.isUnlocked(line.id)) continue;
      final route = Paint()
        ..color = line.color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4.5 * s
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round;
      final path = game.paths[line.id]!;
      final routePath = Path()
        ..moveTo(m(path.points.first).dx, m(path.points.first).dy);
      for (final p in path.points.skip(1)) {
        routePath.lineTo(m(p).dx, m(p).dy);
      }
      canvas.drawPath(routePath, route);
    }

    // How many unlocked lines touch each station (2+ = interchange).
    final linesAt = <String, int>{};
    for (final line in city.lines) {
      if (!game.isUnlocked(line.id)) continue;
      for (final id in line.stationIds) {
        linesAt[id] = (linesAt[id] ?? 0) + 1;
      }
    }

    for (final st in city.stations) {
      final c = m(st.pos);
      final served = game.isServed(st.id);
      if (!served) {
        // A faint hollow dot: a stop on a route you haven't bought yet.
        canvas.drawCircle(
            c,
            1.8 * s,
            Paint()
              ..color = const Color(0x55000000)
              ..style = PaintingStyle.stroke
              ..strokeWidth = 0.8 * s);
        continue;
      }
      // STYLE.md markers: local = white dot + thin ink ring; interchange =
      // larger concentric circles, like the real digital map.
      final interchange = (linesAt[st.id] ?? 0) > 1;
      final r = (interchange ? 4.2 : 3.0) * s;
      canvas.drawCircle(c, r, Paint()..color = Colors.white);
      canvas.drawCircle(
          c,
          r,
          Paint()
            ..color = _ink
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.1 * s);
      if (interchange) {
        canvas.drawCircle(
            c,
            2.1 * s,
            Paint()
              ..color = _ink
              ..style = PaintingStyle.stroke
              ..strokeWidth = 0.9 * s);
      }

      // Label with a white halo (like real map labels) at its hand-tuned
      // offset — dense corridors fan their labels out via StationDef data.
      final fontSize = (3.3 * s).clamp(9.0, 13.0);
      TextPainter mkLabel(TextStyle style) => TextPainter(
            text: TextSpan(text: st.name, style: style),
            textDirection: TextDirection.ltr,
          )..layout();
      final halo = mkLabel(GoogleFonts.inter(
        fontSize: fontSize,
        fontWeight: FontWeight.w700,
        foreground: Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3
          ..color = Colors.white,
      ));
      final label = mkLabel(GoogleFonts.inter(
        color: _ink,
        fontSize: fontSize,
        fontWeight: FontWeight.w700,
      ));
      double top;
      if (st.labelDy > 0) {
        top = c.dy + st.labelDy * s;
      } else if (st.labelDy < 0) {
        top = c.dy + st.labelDy * s - label.height;
      } else {
        final above = st.y > 75;
        top = above ? c.dy - 5 * s - label.height : c.dy + 4.5 * s;
      }
      final labelPos = Offset(
        (c.dx + st.labelDx * s - label.width / 2)
            .clamp(2.0, size.width - label.width - 2.0),
        top,
      );
      halo.paint(canvas, labelPos);
      label.paint(canvas, labelPos);

      // Waiting riders badge; full platforms flash red (demand being lost).
      final count = game.waiting[st.id]!.floor();
      if (count > 0) {
        final full = game.waiting[st.id]! >= GameState.stationCap - 0.001;
        final badge = TextPainter(
          text: TextSpan(
            text: '$count',
            style: GoogleFonts.inter(
              color: Colors.white,
              fontSize: (3.0 * s).clamp(8.0, 12.0),
              fontWeight: FontWeight.w800,
            ),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        final bw = badge.width + 3.2 * s;
        final bh = badge.height + 1.2 * s;
        final bc = Offset(c.dx + 4.2 * s, c.dy - 4.2 * s - bh / 2);
        canvas.drawRRect(
          RRect.fromRectAndRadius(
              Rect.fromLTWH(bc.dx, bc.dy, bw, bh), Radius.circular(bh / 2)),
          Paint()
            ..color =
                full ? const Color(0xFFC62828) : const Color(0xFF444444),
        );
        badge.paint(canvas, Offset(bc.dx + 1.6 * s, bc.dy + 0.6 * s));
      }

      // Food-court marker: a clean square "F" chip (no emoji — STYLE.md).
      if ((game.foodLevel[st.id] ?? 0) > 0) {
        final fr = Rect.fromCenter(
            center: c + Offset(-6.2 * s, 4.6 * s),
            width: 3.6 * s,
            height: 3.6 * s);
        canvas.drawRect(fr, Paint()..color = Colors.white);
        canvas.drawRect(
            fr,
            Paint()
              ..color = _ink
              ..style = PaintingStyle.stroke
              ..strokeWidth = 1);
        final f = TextPainter(
          text: TextSpan(
            text: 'F',
            style: GoogleFonts.inter(
              color: _ink,
              fontSize: 2.4 * s,
              fontWeight: FontWeight.w900,
            ),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        f.paint(canvas,
            fr.center - Offset(f.width / 2, f.height / 2));
      }
    }

    // Trains, live-tracker style (STYLE.md): a solid circle in the line
    // color carrying the bold route letter, sliding along the vector path.
    for (final t in game.trains) {
      final line = city.lineById(t.lineId);
      final path = game.paths[t.lineId]!;
      final tPos = m(path.posAt(t.distance));
      final r = 3.4 * s;
      canvas.drawCircle(tPos, r, Paint()..color = line.color);
      canvas.drawCircle(
          tPos,
          r,
          Paint()
            ..color = Colors.white
            ..style = PaintingStyle.stroke
            ..strokeWidth = 0.8 * s);
      final darkText = line.color.computeLuminance() > 0.5;
      final letter = TextPainter(
        text: TextSpan(
          text: line.bullet,
          style: GoogleFonts.inter(
            color: darkText ? _ink : Colors.white,
            fontSize: r * 1.15,
            fontWeight: FontWeight.w900,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      letter.paint(
          canvas, tPos - Offset(letter.width / 2, letter.height / 2));
    }

    // Boarding feedback (STYLE.md): a clean expanding geometric ring plus a
    // numeric increment rising linearly. No bounce, no sparkle.
    for (final p in pops) {
      final t = (nowMs - p.bornMs) / _FarePop.lifeMs;
      if (t < 0 || t >= 1) continue;
      final st = city.stationById(p.stationId);
      final c = m(st.pos);
      canvas.drawCircle(
          c,
          (3.0 + 7.0 * t) * s,
          Paint()
            ..color = _ink.withOpacity((1 - t) * 0.45)
            ..style = PaintingStyle.stroke
            ..strokeWidth = 0.8 * s);
      final pos = c + Offset(0, -6 * s - 10 * s * t);
      final tp = TextPainter(
        text: TextSpan(
          text: '+\$${p.amount.toStringAsFixed(0)}',
          style: GoogleFonts.inter(
            color: const Color(0xFF1B5E20).withOpacity(1 - t),
            fontSize: (3.8 * s).clamp(10.0, 15.0),
            fontWeight: FontWeight.w900,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, pos - Offset(tp.width / 2, 0));
    }
  }

  /// A locked line (STYLE.md): a semi-transparent light-gray dashed stroke —
  /// the route you're saving for — with a data-overlay price plate at its
  /// midpoint.
  void _drawDashedLine(
      Canvas canvas, Offset Function(Offset) m, double s, LineDef line) {
    final path = game.paths[line.id]!;
    final paint = Paint()
      ..color = const Color(0xFFB9B9B9).withOpacity(0.8)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.0 * s
      ..strokeCap = StrokeCap.butt;
    // Long, uniform dashes cut from the real path with PathMetrics — clean
    // through bends, no stubby round blobs.
    final full = Path()..moveTo(m(path.points.first).dx, m(path.points.first).dy);
    for (final p in path.points.skip(1)) {
      full.lineTo(m(p).dx, m(p).dy);
    }
    final dash = 5.0 * s, gap = 3.0 * s;
    for (final metric in full.computeMetrics()) {
      var d = 0.0;
      while (d < metric.length) {
        final end = (d + dash) < metric.length ? d + dash : metric.length;
        canvas.drawPath(metric.extractPath(d, end), paint);
        d = end + gap;
      }
    }

    final mid = m(path.posAt(path.length / 2));
    final tp = TextPainter(
      text: TextSpan(
        text: '${line.bullet} · \$${line.unlockCost.toStringAsFixed(0)}',
        style: GoogleFonts.inter(
          color: _ink,
          fontSize: (3.0 * s).clamp(9.0, 12.0),
          fontWeight: FontWeight.w800,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    // Square-cornered white plate with a 1px ink hairline — a data overlay.
    final plate = Rect.fromCenter(
        center: mid, width: tp.width + 6 * s, height: tp.height + 2.4 * s);
    canvas.drawRect(plate, Paint()..color = Colors.white);
    canvas.drawRect(
        plate,
        Paint()
          ..color = _ink
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1);
    tp.paint(canvas, plate.topLeft + Offset(3 * s, 1.2 * s));
  }

  @override
  bool shouldRepaint(_MapPainter old) => true;
}
