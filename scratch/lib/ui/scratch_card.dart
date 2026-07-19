import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../data/tickets.dart';

/// The heart of the game: a ticket you scratch with your finger. A latex
/// coating sits over the symbol grid; pan gestures erase it (BlendMode.clear
/// strokes on a saveLayer). When ~60% is cleared the rest auto-reveals.
/// v0.1's entire job is making this feel great.
class ScratchCard extends StatefulWidget {
  const ScratchCard({
    super.key,
    required this.ticket,
    required this.onRevealed,
  });

  final TicketInstance ticket;

  /// Fired once, when the ticket becomes fully revealed.
  final VoidCallback onRevealed;

  @override
  State<ScratchCard> createState() => _ScratchCardState();
}

class _ScratchCardState extends State<ScratchCard>
    with TickerProviderStateMixin {
  /// Finished pan strokes plus the one in progress, in local coordinates.
  final List<List<Offset>> _strokes = [];

  /// Coarse cleared-cell tracking for reveal progress.
  static const int _gridN = 12;
  final Set<int> _cleared = {};

  bool _revealed = false;
  int _hapticTick = 0;

  late final AnimationController _fade = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 400));
  late final AnimationController _confetti = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1100));

  @override
  void dispose() {
    _fade.dispose();
    _confetti.dispose();
    super.dispose();
  }

  void _addPoint(Offset p, Size size, {bool newStroke = false}) {
    if (_revealed) return;
    if (newStroke || _strokes.isEmpty) _strokes.add([]);
    final stroke = _strokes.last;
    if (stroke.isNotEmpty && (stroke.last - p).distance < 5) return;
    stroke.add(p);

    // Occasional haptic tick sells the texture (no-op on web/desktop).
    if (++_hapticTick % 9 == 0) HapticFeedback.selectionClick();

    // Mark this cell + neighbours as cleared.
    final cx = (p.dx / size.width * _gridN).floor().clamp(0, _gridN - 1);
    final cy = (p.dy / size.height * _gridN).floor().clamp(0, _gridN - 1);
    for (var dx = -1; dx <= 1; dx++) {
      for (var dy = -1; dy <= 1; dy++) {
        final x = cx + dx, y = cy + dy;
        if (x >= 0 && x < _gridN && y >= 0 && y < _gridN) {
          _cleared.add(y * _gridN + x);
        }
      }
    }
    setState(() {});

    if (_cleared.length / (_gridN * _gridN) >= 0.6) _reveal();
  }

  void _reveal() {
    if (_revealed) return;
    _revealed = true;
    _fade.forward();
    final t = widget.ticket;
    if (t.isWinner && t.payout >= t.def.cost * 10) {
      _confetti.forward(from: 0);
      HapticFeedback.heavyImpact();
    } else if (t.isWinner) {
      HapticFeedback.mediumImpact();
    }
    setState(() {});
    widget.onRevealed();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.ticket;
    final def = t.def;
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [def.colorA, def.colorB],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(color: Colors.black45, blurRadius: 14, offset: Offset(0, 6)),
        ],
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(def.name,
                  style: theme.textTheme.titleLarge?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.2)),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.black26,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text('\$${def.cost.toStringAsFixed(0)}',
                    style: theme.textTheme.labelLarge?.copyWith(
                        color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(def.tagline,
                style: theme.textTheme.labelSmall
                    ?.copyWith(color: Colors.white70)),
          ),
          const SizedBox(height: 10),
          // The scratchable zone: symbol grid under a latex overlay.
          AspectRatio(
            aspectRatio: 1,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final size =
                    Size(constraints.maxWidth, constraints.maxHeight);
                return ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      _SymbolGrid(ticket: t),
                      FadeTransition(
                        opacity:
                            Tween(begin: 1.0, end: 0.0).animate(CurvedAnimation(
                          parent: _fade,
                          curve: Curves.easeOut,
                        )),
                        child: GestureDetector(
                          onPanStart: (d) => _addPoint(
                              d.localPosition, size,
                              newStroke: true),
                          onPanUpdate: (d) =>
                              _addPoint(d.localPosition, size),
                          child: CustomPaint(
                            painter: _LatexPainter(
                                strokes: _strokes, tick: _strokes.fold<int>(
                                    0, (n, s) => n + s.length)),
                            size: size,
                          ),
                        ),
                      ),
                      if (_revealed)
                        IgnorePointer(
                          child: AnimatedBuilder(
                            animation: _confetti,
                            builder: (context, _) => CustomPaint(
                              painter: _ConfettiPainter(
                                  t: _confetti.value,
                                  seed: t.payout.round()),
                              size: size,
                            ),
                          ),
                        ),
                    ],
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 10),
          if (_revealed)
            _ResultStrip(ticket: t)
          else
            Text('Scratch to reveal · 3 matching symbols win',
                style:
                    theme.textTheme.labelSmall?.copyWith(color: Colors.white70)),
        ],
      ),
    );
  }
}

/// The 3×3 prize grid hiding under the latex.
class _SymbolGrid extends StatelessWidget {
  const _SymbolGrid({required this.ticket});
  final TicketInstance ticket;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFFFDF6E3),
      padding: const EdgeInsets.all(8),
      child: Column(
        children: [
          for (var row = 0; row < 3; row++)
            Expanded(
              child: Row(
                children: [
                  for (var col = 0; col < 3; col++)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.all(3),
                        child: Container(
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                                color: const Color(0xFFE0D6BC), width: 1.5),
                          ),
                          child: Center(
                            child: FittedBox(
                              child: Text(
                                ticket.cells[row * 3 + col],
                                style: const TextStyle(fontSize: 30),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// The silver latex coating, erased along the player's strokes.
class _LatexPainter extends CustomPainter {
  _LatexPainter({required this.strokes, required this.tick});

  final List<List<Offset>> strokes;

  /// Total point count — cheap repaint trigger.
  final int tick;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.saveLayer(rect, Paint());

    // The coating itself.
    final coat = Paint()
      ..shader = const LinearGradient(
        colors: [Color(0xFFBDBDBD), Color(0xFF9E9E9E), Color(0xFFC7C7C7)],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ).createShader(rect);
    canvas.drawRect(rect, coat);

    // A hint + sparkle pattern so the latex reads as "scratch me".
    final tp = TextPainter(
      text: const TextSpan(
        text: '✦  SCRATCH HERE  ✦',
        style: TextStyle(
          color: Color(0xFF757575),
          fontSize: 16,
          fontWeight: FontWeight.w800,
          letterSpacing: 2,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(
        canvas,
        Offset(
            (size.width - tp.width) / 2, (size.height - tp.height) / 2));

    // Erase along every stroke.
    final erase = Paint()
      ..blendMode = BlendMode.clear
      ..style = PaintingStyle.stroke
      ..strokeWidth = 36
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final dot = Paint()..blendMode = BlendMode.clear;
    for (final s in strokes) {
      if (s.isEmpty) continue;
      if (s.length == 1) {
        canvas.drawCircle(s.first, 18, dot);
        continue;
      }
      final path = Path()..moveTo(s.first.dx, s.first.dy);
      for (final p in s.skip(1)) {
        path.lineTo(p.dx, p.dy);
      }
      canvas.drawPath(path, erase);
    }

    canvas.restore();
  }

  @override
  bool shouldRepaint(_LatexPainter old) => old.tick != tick;
}

/// A short celebratory burst for wins ≥10× cost — the seed of the future
/// jackpot screenshot moment.
class _ConfettiPainter extends CustomPainter {
  _ConfettiPainter({required this.t, required this.seed});

  final double t;
  final int seed;

  static const _colors = [
    Color(0xFFFFD54F),
    Color(0xFFFF7043),
    Color(0xFF4FC3F7),
    Color(0xFF81C784),
    Color(0xFFBA68C8),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    if (t <= 0 || t >= 1) return;
    final rng = Random(seed);
    final origin = Offset(size.width / 2, size.height * 0.35);
    for (var i = 0; i < 26; i++) {
      final angle = rng.nextDouble() * 2 * pi;
      final speed = (0.35 + rng.nextDouble() * 0.65) * size.width;
      final gravity = size.height * 1.2;
      final pos = origin +
          Offset(cos(angle) * speed * t,
              sin(angle) * speed * t * 0.6 + gravity * t * t * 0.5);
      final paint = Paint()
        ..color = _colors[i % _colors.length].withOpacity(1 - t);
      canvas.drawCircle(pos, 3 + (i % 3).toDouble(), paint);
    }
  }

  @override
  bool shouldRepaint(_ConfettiPainter old) => old.t != t;
}

/// The verdict under a revealed ticket.
class _ResultStrip extends StatelessWidget {
  const _ResultStrip({required this.ticket});
  final TicketInstance ticket;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final big = ticket.payout >= ticket.def.cost * 10;
    if (!ticket.isWinner) {
      return Text('No luck this time…',
          style: theme.textTheme.titleSmall?.copyWith(color: Colors.white70));
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: big ? const Color(0xFFFFD54F) : Colors.white,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        big
            ? '🎉 BIG WIN  \$${ticket.payout.toStringAsFixed(0)}!'
            : 'WINNER  \$${ticket.payout.toStringAsFixed(0)}!',
        style: theme.textTheme.titleMedium?.copyWith(
          color: const Color(0xFF5D4037),
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}
