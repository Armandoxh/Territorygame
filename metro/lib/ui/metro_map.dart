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
  final TransformationController _viewer = TransformationController();
  bool _centered = false;

  @override
  void dispose() {
    _viewer.dispose();
    super.dispose();
  }

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
      // Taller than wide: the map dominates the screen.
      aspectRatio: 0.82,
      child: Container(
        // STYLE.md: water frames the city; the landmass is painted on top.
        decoration: BoxDecoration(
          color: const Color(0xFFBDD3E8),
          border: Border.all(color: TransitStyle.hairline, width: 1),
        ),
        clipBehavior: Clip.hardEdge,
        child: LayoutBuilder(
          builder: (context, constraints) {
            // The map square is rendered at viewport-HEIGHT size (bigger than
            // the frame is wide), so it starts large and pans/zooms like the
            // real Live Map.
            final side = constraints.maxHeight;
            final size = Size(side, side);
            if (!_centered) {
              _centered = true;
              _viewer.value = Matrix4.identity()
                ..translate((constraints.maxWidth - side) / 2, 0.0);
            }
            return Stack(
              children: [
                Positioned.fill(
                  child: InteractiveViewer(
                    transformationController: _viewer,
                    constrained: false,
                    minScale: 0.75,
                    maxScale: 5,
                    boundaryMargin: const EdgeInsets.all(80),
                    child: SizedBox(
                      width: side,
                      height: side,
                      child: GestureDetector(
                        onTapUp: (d) => _handleTap(d.localPosition, size),
                        child: CustomPaint(
                          size: size,
                          painter: _MapPainter(
                            game: g,
                            pops: List.of(_pops),
                            nowMs: now,
                          ),
                        ),
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

    // The landmass: near-white, 45-degree corners softened by a fat
    // round-join stroke in the same color.
    const landColor = Color(0xFFFAF9F6);
    if (city.land.isNotEmpty) {
      final lp = Path()..moveTo(m(city.land.first).dx, m(city.land.first).dy);
      for (final pt in city.land.skip(1)) {
        lp.lineTo(m(pt).dx, m(pt).dy);
      }
      lp.close();
      canvas.drawPath(lp, Paint()..color = landColor);
      canvas.drawPath(
          lp,
          Paint()
            ..color = landColor
            ..style = PaintingStyle.stroke
            ..strokeWidth = 3 * s
            ..strokeJoin = StrokeJoin.round);
    }
    // District names sit UNDER the network, like the real diagram.
    for (final d in city.districts) {
      final tp = TextPainter(
        text: TextSpan(
          text: d.text,
          style: GoogleFonts.inter(
            color: const Color(0xFFCDCDCD),
            fontSize: 4.0 * s,
            fontWeight: FontWeight.w800,
            letterSpacing: 2,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      final c = m(Offset(d.x, d.y));
      tp.paint(canvas, c - Offset(tp.width / 2, tp.height / 2));
    }

    final waterPaint = Paint()..color = const Color(0xFFBDD3E8);
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
        ..strokeWidth = 2.2 * s
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
            c, 0.75 * s, Paint()..color = const Color(0xFFBDBDBD));
        continue;
      }
      // STYLE.md markers: white dot + thin ring, sized to hold the waiting
      // count INSIDE it (saves space vs a floating badge). A full platform
      // turns the ring + number red — demand is being lost. Solid-color
      // circles are trains only, so the two can never be confused.
      final interchange = (linesAt[st.id] ?? 0) > 1;
      final count = game.waiting[st.id]!.floor();
      final full = game.waiting[st.id]! >= GameState.stationCap - 0.001;
      final r = (interchange ? 2.4 : 1.9) * s;
      if (count == 0 && !interchange) {
        // Quiet local stop: the real diagram's tiny solid dot.
        canvas.drawCircle(c, 0.85 * s, Paint()..color = _ink);
      } else {
        canvas.drawCircle(c, r, Paint()..color = Colors.white);
        canvas.drawCircle(
            c,
            r,
            Paint()
              ..color = full ? const Color(0xFFC62828) : _ink
              ..style = PaintingStyle.stroke
              ..strokeWidth =
                  (full ? 0.85 : (interchange ? 0.7 : 0.55)) * s);
      }
      if (interchange && count == 0) {
        canvas.drawCircle(
            c,
            1.1 * s,
            Paint()
              ..color = _ink
              ..style = PaintingStyle.stroke
              ..strokeWidth = 0.5 * s);
      }
      if (count > 0) {
        final countPainter = TextPainter(
          text: TextSpan(
            text: '$count',
            style: GoogleFonts.inter(
              color: full ? const Color(0xFFC62828) : _ink,
              fontSize: (count < 10 ? 2.1 : 1.7) * s,
              fontWeight: FontWeight.w900,
            ),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        countPainter.paint(canvas,
            c - Offset(countPainter.width / 2, countPainter.height / 2));
      }

      // Label with a white halo (like real map labels) at its hand-tuned
      // offset — dense corridors fan their labels out via StationDef data.
      final fontSize = (2.9 * s).clamp(8.5, 12.0);
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
        top = above ? c.dy - 3.2 * s - label.height : c.dy + 3.2 * s;
      }
      final labelPos = Offset(
        (c.dx + st.labelDx * s - label.width / 2)
            .clamp(2.0, size.width - label.width - 2.0),
        top,
      );
      halo.paint(canvas, labelPos);
      label.paint(canvas, labelPos);

      // Food-court marker: a clean square "F" chip (no emoji — STYLE.md).
      if ((game.foodLevel[st.id] ?? 0) > 0) {
        final fr = Rect.fromCenter(
            center: c + Offset(-3.6 * s, 3.0 * s),
            width: 2.6 * s,
            height: 2.6 * s);
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
              fontSize: 1.7 * s,
              fontWeight: FontWeight.w900,
            ),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        f.paint(canvas,
            fr.center - Offset(f.width / 2, f.height / 2));
      }
    }

    // Terminal route bullets: the line's bullet extended past each end,
    // exactly like the printed diagram caps its routes.
    for (final line in city.lines) {
      if (!game.isUnlocked(line.id)) continue;
      final pts = game.paths[line.id]!.points;
      for (final end in [0, pts.length - 1]) {
        final terminal = pts[end];
        final prev = pts[end == 0 ? 1 : pts.length - 2];
        final dir = terminal - prev;
        final len = dir.distance;
        if (len < 0.001) continue;
        final pos = m(terminal + dir / len * 5.0);
        canvas.drawCircle(pos, 1.7 * s, Paint()..color = line.color);
        final darkTxt = line.color.computeLuminance() > 0.5;
        final tp = TextPainter(
          text: TextSpan(
            text: line.bullet,
            style: GoogleFonts.inter(
              color: darkTxt ? _ink : Colors.white,
              fontSize: 2.0 * s,
              fontWeight: FontWeight.w900,
            ),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        tp.paint(canvas, pos - Offset(tp.width / 2, tp.height / 2));
      }
    }

    // Trains, live-tracker style (STYLE.md): a solid circle in the line
    // color carrying the bold route letter, sliding along the vector path.
    for (final t in game.trains) {
      final line = city.lineById(t.lineId);
      final path = game.paths[t.lineId]!;
      final tPos = m(path.posAt(t.distance));
      final r = 2.6 * s;
      canvas.drawCircle(tPos, r, Paint()..color = line.color);
      canvas.drawCircle(
          tPos,
          r,
          Paint()
            ..color = Colors.white
            ..style = PaintingStyle.stroke
            ..strokeWidth = 0.5 * s);
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
          (2.0 + 6.0 * t) * s,
          Paint()
            ..color = _ink.withOpacity((1 - t) * 0.45)
            ..style = PaintingStyle.stroke
            ..strokeWidth = 0.6 * s);
      final pos = c + Offset(0, -4.5 * s - 9 * s * t);
      final tp = TextPainter(
        text: TextSpan(
          text: '+\$${p.amount.toStringAsFixed(0)}',
          style: GoogleFonts.inter(
            color: const Color(0xFF1B5E20).withOpacity(1 - t),
            fontSize: (3.0 * s).clamp(9.0, 13.0),
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
      ..color = const Color(0xFFD2D2D2)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.15 * s
      ..strokeCap = StrokeCap.butt;
    // Long, uniform dashes cut from the real path with PathMetrics — clean
    // through bends, no stubby round blobs.
    final full = Path()..moveTo(m(path.points.first).dx, m(path.points.first).dy);
    for (final p in path.points.skip(1)) {
      full.lineTo(m(p).dx, m(p).dy);
    }
    final dash = 3.8 * s, gap = 2.4 * s;
    for (final metric in full.computeMetrics()) {
      var d = 0.0;
      while (d < metric.length) {
        final end = (d + dash) < metric.length ? d + dash : metric.length;
        canvas.drawPath(metric.extractPath(d, end), paint);
        d = end + gap;
      }
    }

    // Hand-placed in open land (see LineDef.plateX/plateY) — the midpoint
    // landed on interchanges and collided with labels.
    final mid = m(Offset(line.plateX, line.plateY));
    final tp = TextPainter(
      text: TextSpan(
        text: '${line.bullet} · \$${_fmtMoney(line.unlockCost)}',
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

  static String _fmtMoney(double v) {
    final digits = v.round().toString();
    final out = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) out.write(',');
      out.write(digits[i]);
    }
    return out.toString();
  }

  @override
  bool shouldRepaint(_MapPainter old) => true;
}
