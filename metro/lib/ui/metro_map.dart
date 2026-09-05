import 'package:flutter/material.dart';

import '../data/cities.dart';
import '../state/game_state.dart';

/// The classic paper transit map: cream ground, one bold colored line through
/// white-ringed station dots, a little train capsule sliding along it, waiting
/// counts at each platform, and floating "+$" as riders board. The parent
/// rebuilds every frame (the game ticks at frame rate), so this just paints
/// current state.
class MetroMap extends StatefulWidget {
  const MetroMap({super.key, required this.game});

  final GameState game;

  @override
  State<MetroMap> createState() => _MetroMapState();
}

class _MetroMapState extends State<MetroMap> {
  int _seenSeq = 0;
  final List<_FarePop> _pops = [];

  @override
  Widget build(BuildContext context) {
    final g = widget.game;
    final now = DateTime.now().millisecondsSinceEpoch;

    // One "+$" pop per boarding event.
    if (g.boardSeq != _seenSeq) {
      _seenSeq = g.boardSeq;
      if (g.lastBoardAmount >= 1) {
        _pops.add(_FarePop(
          station: g.lastBoardStation,
          amount: g.lastBoardAmount,
          bornMs: now,
        ));
      }
    }
    _pops.removeWhere((p) => now - p.bornMs > _FarePop.lifeMs);

    return AspectRatio(
      aspectRatio: 1.05,
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFFF7F3E8),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFF1A1A1A), width: 2),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            Positioned.fill(
              child: CustomPaint(
                painter: _MapPainter(
                  line: g.line,
                  path: g.path,
                  waiting: g.waiting,
                  trainDistance: g.trainDistance,
                  pops: List.of(_pops),
                  nowMs: now,
                ),
              ),
            ),
            // The paper-map corner plate.
            Positioned(
              left: 10,
              top: 10,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                color: const Color(0xFF1A1A1A),
                child: Text(
                  '${g.city.name} Transit',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.1,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FarePop {
  const _FarePop(
      {required this.station, required this.amount, required this.bornMs});
  final int station;
  final double amount;
  final int bornMs;

  static const int lifeMs = 1100;
}

class _MapPainter extends CustomPainter {
  _MapPainter({
    required this.line,
    required this.path,
    required this.waiting,
    required this.trainDistance,
    required this.pops,
    required this.nowMs,
  });

  final LineDef line;
  final LinePath path;
  final List<double> waiting;
  final double trainDistance;
  final List<_FarePop> pops;
  final int nowMs;

  static const _ink = Color(0xFF1A1A1A);

  @override
  void paint(Canvas canvas, Size size) {
    // Uniform scale keeps the 45°/90° geometry honest.
    final s = size.shortestSide / 100.0;
    Offset m(Offset p) => Offset(
        p.dx * s + (size.width - 100 * s) / 2,
        p.dy * s + (size.height - 100 * s) / 2);

    // Faint grid for the printed-map feel.
    final grid = Paint()
      ..color = const Color(0x14000000)
      ..strokeWidth = 1;
    for (var i = 10; i < 100; i += 10) {
      canvas.drawLine(m(Offset(i.toDouble(), 0)),
          m(Offset(i.toDouble(), 100)), grid);
      canvas.drawLine(m(Offset(0, i.toDouble())),
          m(Offset(100, i.toDouble())), grid);
    }

    // The line itself.
    final route = Paint()
      ..color = line.color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4.5 * s
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final routePath = Path()..moveTo(m(path.points.first).dx, m(path.points.first).dy);
    for (final p in path.points.skip(1)) {
      routePath.lineTo(m(p).dx, m(p).dy);
    }
    canvas.drawPath(routePath, route);

    // Stations: white dot, ink ring, name label, waiting badge.
    for (var i = 0; i < line.stations.length; i++) {
      final st = line.stations[i];
      final c = m(st.pos);
      canvas.drawCircle(c, 3.0 * s, Paint()..color = Colors.white);
      canvas.drawCircle(
          c,
          3.0 * s,
          Paint()
            ..color = _ink
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.1 * s);

      final label = TextPainter(
        text: TextSpan(
          text: st.name,
          style: TextStyle(
            color: _ink,
            fontSize: (3.4 * s).clamp(9.0, 14.0),
            fontWeight: FontWeight.w700,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      final above = st.y > 75;
      final labelPos = Offset(
        (c.dx - label.width / 2)
            .clamp(2.0, size.width - label.width - 2.0),
        above ? c.dy - 5 * s - label.height : c.dy + 4.5 * s,
      );
      label.paint(canvas, labelPos);

      // Waiting riders badge; full platforms flash red (demand being lost).
      final count = waiting[i].floor();
      if (count > 0) {
        final full = waiting[i] >= GameState.stationCap - 0.001;
        final badge = TextPainter(
          text: TextSpan(
            text: '$count',
            style: TextStyle(
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
          Paint()..color = full ? const Color(0xFFC62828) : const Color(0xFF444444),
        );
        badge.paint(
            canvas, Offset(bc.dx + 1.6 * s, bc.dy + 0.6 * s));
      }
    }

    // The train: an ink capsule rotated to its segment.
    final tPos = m(path.posAt(trainDistance));
    final ahead = m(path.posAt(
        (trainDistance + 0.6).clamp(0.0, path.length)));
    final behind = m(path.posAt(
        (trainDistance - 0.6).clamp(0.0, path.length)));
    final dirVec = ahead - behind;
    final angle = dirVec.distance < 0.001 ? 0.0 : dirVec.direction;
    canvas.save();
    canvas.translate(tPos.dx, tPos.dy);
    canvas.rotate(angle);
    final trainRect = RRect.fromRectAndRadius(
      Rect.fromCenter(center: Offset.zero, width: 7.5 * s, height: 3.6 * s),
      Radius.circular(1.8 * s),
    );
    canvas.drawRRect(trainRect, Paint()..color = _ink);
    canvas.drawRRect(
        trainRect,
        Paint()
          ..color = Colors.white
          ..style = PaintingStyle.stroke
          ..strokeWidth = 0.8 * s);
    canvas.restore();

    // Floating fares.
    for (final p in pops) {
      final t = (nowMs - p.bornMs) / _FarePop.lifeMs;
      if (t < 0 || t >= 1) continue;
      final st = line.stations[p.station];
      final pos = m(st.pos) + Offset(0, -6 * s - 10 * s * t);
      final tp = TextPainter(
        text: TextSpan(
          text: '+\$${p.amount.toStringAsFixed(0)}',
          style: TextStyle(
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

  @override
  bool shouldRepaint(_MapPainter old) => true;
}
