import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../theme/swarm_colors.dart';

class SwarmBackground extends StatelessWidget {
  const SwarmBackground({super.key, this.showNeural = true});

  final bool showNeural;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFF182542), SwarmColors.bgDeep],
            ),
          ),
        ),
        const _RadialGlow(
          alignment: Alignment(-0.6, -1.1),
          color: Color(0x29669FFF),
          radius: 1.0,
        ),
        const _RadialGlow(
          alignment: Alignment(1.1, 1.1),
          color: Color(0x29A78BFA),
          radius: 1.0,
        ),
        if (showNeural) const _NeuralBg(),
      ],
    );
  }
}

class _RadialGlow extends StatelessWidget {
  const _RadialGlow({
    required this.alignment,
    required this.color,
    required this.radius,
  });

  final Alignment alignment;
  final Color color;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: alignment,
          radius: radius,
          colors: [color, Colors.transparent],
        ),
      ),
    );
  }
}

class _NeuralBg extends StatefulWidget {
  const _NeuralBg();

  @override
  State<_NeuralBg> createState() => _NeuralBgState();
}

class _NeuralBgState extends State<_NeuralBg>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final List<_Node> _nodes;
  final _rng = math.Random(7);

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(seconds: 14),
      vsync: this,
    )..repeat();
    _nodes = List.generate(28, (_) {
      return _Node(
        offset: Offset(_rng.nextDouble(), _rng.nextDouble()),
        speed: 0.05 + _rng.nextDouble() * 0.1,
        radius: 1.0 + _rng.nextDouble() * 1.8,
      );
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          return CustomPaint(
            painter: _NeuralPainter(_nodes, _controller.value),
            size: Size.infinite,
          );
        },
      ),
    );
  }
}

class _Node {
  _Node({required this.offset, required this.speed, required this.radius});
  final Offset offset;
  final double speed;
  final double radius;
}

class _NeuralPainter extends CustomPainter {
  _NeuralPainter(this.nodes, this.t);

  final List<_Node> nodes;
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    final positions = nodes.map((n) {
      final dx = (n.offset.dx + t * n.speed) % 1.0;
      final dy = (n.offset.dy + t * n.speed * 0.6) % 1.0;
      return Offset(dx * size.width, dy * size.height);
    }).toList();

    final linePaint = Paint()
      ..color = const Color(0x33A7C8FF)
      ..strokeWidth = 0.6;
    for (var i = 0; i < positions.length; i++) {
      for (var j = i + 1; j < positions.length; j++) {
        final d = (positions[i] - positions[j]).distance;
        if (d < 120) {
          linePaint.color = Color.fromRGBO(
            167,
            200,
            255,
            (1 - d / 120) * 0.16,
          );
          canvas.drawLine(positions[i], positions[j], linePaint);
        }
      }
    }

    final dotPaint = Paint()..color = const Color(0x66A7C8FF);
    for (var i = 0; i < positions.length; i++) {
      canvas.drawCircle(positions[i], nodes[i].radius, dotPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _NeuralPainter old) =>
      old.t != t || old.nodes != nodes;
}
