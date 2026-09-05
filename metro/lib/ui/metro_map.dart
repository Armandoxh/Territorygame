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
                  left: 10,
                  top: 10,
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

    // STYLE.md: the landmass is one flat color — no grid, no texture.
    final city = game.city;

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

      final label = TextPainter(
        text: TextSpan(
          text: st.name,
          style: GoogleFonts.inter(
            color: _ink,
            fontSize: (3.4 * s).clamp(9.0, 14.0),
            fontWeight: FontWeight.w700,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      final above = st.y > 75;
      label.paint(
        canvas,
        Offset(
          (c.dx - label.width / 2)
              .clamp(2.0, size.width - label.width - 2.0),
          above ? c.dy - 5 * s - label.height : c.dy + 4.5 * s,
        ),
      );

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
      ..color = const Color(0xFFBDBDBD).withOpacity(0.75)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.0 * s
      ..strokeCap = StrokeCap.round;
    const dash = 2.2, gap = 2.2;
    var carried = 0.0;
    for (var i = 1; i < path.points.length; i++) {
      final a = path.points[i - 1];
      final b = path.points[i];
      final segLen = (b - a).distance;
      var d = carried;
      while (d < segLen) {
        final end = (d + dash) < segLen ? d + dash : segLen;
        canvas.drawLine(m(Offset.lerp(a, b, d / segLen)!),
            m(Offset.lerp(a, b, end / segLen)!), paint);
        d = end + gap;
      }
      carried = (d - segLen).clamp(0.0, dash + gap);
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
