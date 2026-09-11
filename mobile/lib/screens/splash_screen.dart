import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/auth_service.dart';
import '../theme/swarm_colors.dart';
import '../theme/swarm_theme.dart';
import '../widgets/swarm_background.dart';
import '../widgets/swarm_primitives.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  int _step = 0;
  static const _lines = [
    'INIT  cognitive layer',
    'LINK  digital twin · 2,147 nodes',
    'SYNC  swarm intelligence · 184k vehicles',
    'WAKE  territorial brain',
  ];

  @override
  void initState() {
    super.initState();
    _tick();
  }

  Future<void> _tick() async {
    for (var i = 0; i <= _lines.length; i++) {
      await Future.delayed(const Duration(milliseconds: 900));
      if (!mounted) return;
      setState(() => _step = i);
    }
    await Future.delayed(const Duration(milliseconds: 700));
    if (!mounted) return;
    final next = AuthService.instance.isAuthenticated ? '/home' : '/login';
    context.go(next);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          const SwarmBackground(),
          Positioned.fill(
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const SwarmMark(size: 88),
                    const SizedBox(height: 22),
                    Text(
                      'SWARM-TRAFFIC AI · V1.0',
                      style: SwarmTheme.mono(letterSpacing: 1.2),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Cerveau territorial',
                      style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w600,
                        color: SwarmColors.ink100,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      "Système d'exploitation de la mobilité",
                      style: TextStyle(fontSize: 12, color: SwarmColors.ink500),
                    ),
                    const SizedBox(height: 32),
                    SizedBox(
                      width: 260,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: List.generate(_lines.length, (i) {
                          final done = i < _step;
                          final active = i == _step;
                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 3),
                            child: Opacity(
                              opacity: i <= _step ? 1 : 0.25,
                              child: Row(
                                children: [
                                  Text(
                                    done ? '✓' : active ? '◐' : '○',
                                    style: TextStyle(
                                      color: done
                                          ? SwarmColors.safeGreen
                                          : active
                                              ? SwarmColors.alertAmber
                                              : SwarmColors.ink700,
                                      fontSize: 12,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      _lines[i],
                                      overflow: TextOverflow.ellipsis,
                                      style: SwarmTheme.mono(
                                        color: i <= _step
                                            ? SwarmColors.ink300
                                            : SwarmColors.ink700,
                                        size: 10.5,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            bottom: 40,
            left: 0,
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const PulseDot(size: 6),
                const SizedBox(width: 8),
                Text(
                  'CONNEXION SÉCURISÉE · ANRT',
                  style: SwarmTheme.mono(size: 10, letterSpacing: 0.8),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
