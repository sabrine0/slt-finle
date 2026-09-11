import 'dart:ui';
import 'package:flutter/material.dart';

import '../theme/swarm_colors.dart';
import '../theme/swarm_theme.dart';

class GlassCard extends StatelessWidget {
  const GlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(SwarmSpacing.md),
    this.radius = SwarmRadius.lg,
    this.halo = false,
    this.borderColor,
    this.gradient,
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final bool halo;
  final Color? borderColor;
  final Gradient? gradient;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final card = ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: Container(
          decoration: BoxDecoration(
            gradient: gradient ??
                const LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0x8C243456), Color(0x80142039)],
                ),
            border: Border.all(
              color: borderColor ?? SwarmColors.hairline,
              width: 1,
            ),
            borderRadius: BorderRadius.circular(radius),
          ),
          child: Padding(padding: padding, child: child),
        ),
      ),
    );

    final wrapped = onTap == null
        ? card
        : Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(radius),
              child: card,
            ),
          );

    if (!halo) return wrapped;
    return Stack(
      children: [
        Positioned.fill(
          child: IgnorePointer(
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(radius),
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Color(0x8C2A7BFF),
                    Color(0x0014B8A6),
                    Color(0x6688B5CF),
                  ],
                ),
              ),
              padding: const EdgeInsets.all(1),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: SwarmColors.bgBase,
                  borderRadius: BorderRadius.circular(radius - 1),
                ),
              ),
            ),
          ),
        ),
        wrapped,
      ],
    );
  }
}

enum SwarmChipTone { neutral, blue, green, amber, red, violet, teal }

class SwarmChip extends StatelessWidget {
  const SwarmChip({
    super.key,
    required this.label,
    this.tone = SwarmChipTone.neutral,
    this.leading,
  });

  final String label;
  final SwarmChipTone tone;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    final (fg, border, bg) = switch (tone) {
      SwarmChipTone.blue => (
          const Color(0xFF93C5FD),
          const Color(0x663B82F6),
          const Color(0x1F1A5FDC),
        ),
      SwarmChipTone.green => (
          const Color(0xFF6EE7B7),
          const Color(0x6610B981),
          const Color(0x1A10B981),
        ),
      SwarmChipTone.amber => (
          const Color(0xFFFCD34D),
          const Color(0x66F59E0B),
          const Color(0x1AF59E0B),
        ),
      SwarmChipTone.red => (
          const Color(0xFFFCA5A5),
          const Color(0x73EF4444),
          const Color(0x1AEF4444),
        ),
      SwarmChipTone.violet => (
          const Color(0xFFC4B5FD),
          const Color(0x668B5CF6),
          const Color(0x1A8B5CF6),
        ),
      SwarmChipTone.teal => (
          const Color(0xFF5EEAD4),
          const Color(0x6614B8A6),
          const Color(0x1A14B8A6),
        ),
      SwarmChipTone.neutral => (
          SwarmColors.ink300,
          SwarmColors.hairlineStrong,
          const Color(0x8C0F172A),
        ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: border, width: 1),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (leading != null) ...[
            IconTheme(
              data: IconThemeData(size: 10, color: fg),
              child: leading!,
            ),
            const SizedBox(width: 6),
          ],
          Text(
            label.toUpperCase(),
            style: SwarmTheme.mono(
              size: 10.5,
              color: fg,
              weight: FontWeight.w500,
              letterSpacing: 0.6,
            ),
          ),
        ],
      ),
    );
  }
}

class PulseDot extends StatefulWidget {
  const PulseDot({super.key, this.color = SwarmColors.safeGreen, this.size = 8});

  final Color color;
  final double size;

  @override
  State<PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<PulseDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      duration: const Duration(seconds: 2),
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
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        final t = _ctrl.value;
        return SizedBox(
          width: widget.size * 3,
          height: widget.size * 3,
          child: Center(
            child: Stack(
              alignment: Alignment.center,
              children: [
                Container(
                  width: widget.size + 16 * t,
                  height: widget.size + 16 * t,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: widget.color.withValues(alpha: (1 - t) * 0.4),
                  ),
                ),
                Container(
                  width: widget.size,
                  height: widget.size,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: widget.color,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class SwarmMark extends StatelessWidget {
  const SwarmMark({super.key, this.size = 28});
  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _SwarmMarkPainter()),
    );
  }
}

class _SwarmMarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final r = size.width * 0.42;
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    final grad = const LinearGradient(
      colors: [SwarmColors.swarmBlue2, SwarmColors.ecoTeal, SwarmColors.stressViolet],
    );

    for (var i = 0; i < 4; i++) {
      final angle = i * 0.4;
      final rect = Rect.fromCircle(center: c, radius: r);
      paint.shader = grad.createShader(rect);
      canvas.save();
      canvas.translate(c.dx, c.dy);
      canvas.rotate(angle);
      canvas.translate(-c.dx, -c.dy);
      final path = Path()
        ..addOval(Rect.fromCenter(center: c, width: r * 2, height: r * 1.4));
      canvas.drawPath(path, paint);
      canvas.restore();
    }

    final dot = Paint()..color = SwarmColors.swarmBlue2;
    canvas.drawCircle(c, size.width * 0.08, dot);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class LiveEyebrow extends StatelessWidget {
  const LiveEyebrow({super.key, required this.label, this.color = SwarmColors.swarmBlue2});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        PulseDot(color: color, size: 6),
        const SizedBox(width: 6),
        Text(
          label.toUpperCase(),
          style: SwarmTheme.mono(
            size: 10.5,
            color: color,
            letterSpacing: 0.8,
          ),
        ),
      ],
    );
  }
}

class SwarmPrimaryButton extends StatelessWidget {
  const SwarmPrimaryButton({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
    this.expand = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final btn = DecoratedBox(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [SwarmColors.swarmBlue2, SwarmColors.swarmBlue],
        ),
        borderRadius: BorderRadius.circular(SwarmRadius.sm),
        boxShadow: [
          BoxShadow(
            color: SwarmColors.swarmBlue2.withValues(alpha: 0.4),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(SwarmRadius.sm),
          onTap: onPressed,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
            child: Row(
              mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 16, color: SwarmColors.ink100),
                  const SizedBox(width: 8),
                ],
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 14,
                    color: SwarmColors.ink100,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    return expand ? SizedBox(width: double.infinity, child: btn) : btn;
  }
}

class SwarmGhostButton extends StatelessWidget {
  const SwarmGhostButton({super.key, required this.label, this.onPressed, this.icon});

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(SwarmRadius.sm),
        onTap: onPressed,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 14, color: SwarmColors.ink300),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: const TextStyle(fontSize: 13, color: SwarmColors.ink300),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
