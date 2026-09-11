import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../theme/swarm_colors.dart';

class CityMap extends StatefulWidget {
  const CityMap({super.key, this.height = 210});
  final double height;

  @override
  State<CityMap> createState() => _CityMapState();
}

class _CityMapState extends State<CityMap>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      duration: const Duration(seconds: 6),
      vsync: this,
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: widget.height,
      width: double.infinity,
      child: AnimatedBuilder(
        animation: _ctrl,
        builder: (context, _) {
          return CustomPaint(painter: _CityMapPainter(_ctrl.value));
        },
      ),
    );
  }
}

class _CityMapPainter extends CustomPainter {
  _CityMapPainter(this.t);
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    final bg = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFF152244), Color(0xFF0B1330)],
      ).createShader(Offset.zero & size);
    canvas.drawRect(Offset.zero & size, bg);

    final grid = Paint()
      ..color = const Color(0x14A7C8FF)
      ..strokeWidth = 0.6;
    for (double x = 0; x < size.width; x += 28) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), grid);
    }
    for (double y = 0; y < size.height; y += 28) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }

    final roads = Paint()
      ..color = const Color(0x66A7C8FF)
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(
      Offset(0, size.height * 0.65),
      Offset(size.width, size.height * 0.4),
      roads,
    );
    canvas.drawLine(
      Offset(size.width * 0.15, 0),
      Offset(size.width * 0.55, size.height),
      roads,
    );

    final flow = Paint()
      ..shader = const LinearGradient(
        colors: [SwarmColors.swarmBlue2, SwarmColors.ecoTeal],
      ).createShader(Offset.zero & size)
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    final path = Path()
      ..moveTo(size.width * 0.05, size.height * 0.85)
      ..quadraticBezierTo(
        size.width * 0.35,
        size.height * 0.2,
        size.width * 0.95,
        size.height * 0.45,
      );
    canvas.drawPath(path, flow);

    final metric = path.computeMetrics().first;
    final pos = metric.getTangentForOffset(metric.length * t);
    if (pos != null) {
      final dot = Paint()..color = SwarmColors.swarmBlue2;
      canvas.drawCircle(pos.position, 6, Paint()..color = const Color(0x662A7BFF));
      canvas.drawCircle(pos.position, 3.5, dot);
    }

    final rng = math.Random(11);
    final hot = Paint()..color = SwarmColors.alertAmber.withValues(alpha: 0.35);
    for (var i = 0; i < 6; i++) {
      canvas.drawCircle(
        Offset(rng.nextDouble() * size.width, rng.nextDouble() * size.height),
        6 + rng.nextDouble() * 4,
        hot,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _CityMapPainter old) => old.t != t;
}
