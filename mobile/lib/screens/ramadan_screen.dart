import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/swarm_colors.dart';
import '../theme/swarm_theme.dart';
import '../widgets/swarm_background.dart';
import '../widgets/swarm_primitives.dart';

class RamadanScreen extends StatelessWidget {
  const RamadanScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          const SwarmBackground(showNeural: false),
          Positioned(
            top: -120,
            left: -60,
            child: Container(
              width: 300,
              height: 300,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [Color(0x668B5CF6), Colors.transparent],
                ),
              ),
            ),
          ),
          SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 30),
              children: [
                Row(
                  children: [
                    SwarmGhostButton(label: '←', onPressed: () => context.pop()),
                    const Spacer(),
                    Text(
                      'MODE RAMADAN',
                      style: SwarmTheme.mono(size: 11, letterSpacing: 1),
                    ),
                    const Spacer(),
                    const SizedBox(width: 24),
                  ],
                ),
                const SizedBox(height: 14),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 6),
                  child: Text(
                    'Le territoire ralentit avec toi',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w600,
                      color: SwarmColors.ink100,
                      height: 1.2,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 6),
                  child: Text(
                    "SWARM adapte ses scénarios autour du f'tour, de la prière et des heures de jeûne.",
                    style: TextStyle(fontSize: 13, color: SwarmColors.ink500),
                  ),
                ),
                const SizedBox(height: 18),
                GlassCard(
                  halo: true,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const LiveEyebrow(
                        label: "F'tour dans 47 min",
                        color: SwarmColors.stressViolet,
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Container(
                            width: 56,
                            height: 56,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: SwarmColors.stressViolet.withValues(
                                alpha: 0.18,
                              ),
                            ),
                            child: const Icon(
                              Icons.nights_stay,
                              color: SwarmColors.stressViolet,
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: const [
                                Text(
                                  'Reste à la maison',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                    color: SwarmColors.ink100,
                                  ),
                                ),
                                SizedBox(height: 2),
                                Text(
                                  "Le trafic ne se calmera qu'après 20h15.",
                                  style: TextStyle(
                                    fontSize: 12.5,
                                    color: SwarmColors.ink300,
                                    height: 1.4,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                GlassCard(
                  child: Column(
                    children: [
                      _Slot(
                        time: '19h28',
                        label: "F'tour · Adhan Maghrib",
                        icon: Icons.restaurant,
                        color: SwarmColors.alertAmber,
                      ),
                      const Divider(color: SwarmColors.hairline, height: 18),
                      _Slot(
                        time: '20h45',
                        label: 'Tarawih · Mosquée Hassan II',
                        icon: Icons.mosque,
                        color: SwarmColors.swarmBlue2,
                      ),
                      const Divider(color: SwarmColors.hairline, height: 18),
                      _Slot(
                        time: '04h12',
                        label: 'Suhoor · réveil doux',
                        icon: Icons.bedtime_outlined,
                        color: SwarmColors.stressViolet,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                GlassCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const LiveEyebrow(
                        label: 'Adaptation cognitive',
                        color: SwarmColors.ecoTeal,
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        "Les scénarios pré-f'tour réduisent la vitesse cible et la durée debout. Les zones de jeûne difficile sont évitées.",
                        style: TextStyle(
                          fontSize: 13,
                          color: SwarmColors.ink300,
                          height: 1.5,
                        ),
                      ),
                    ],
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

class _Slot extends StatelessWidget {
  const _Slot({
    required this.time,
    required this.label,
    required this.icon,
    required this.color,
  });

  final String time;
  final String label;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SizedBox(
          width: 60,
          child: Text(
            time,
            style: SwarmTheme.mono(
              size: 14,
              color: color,
              weight: FontWeight.w600,
              letterSpacing: 0.4,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Icon(icon, color: color, size: 18),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 13.5,
              color: SwarmColors.ink100,
            ),
          ),
        ),
      ],
    );
  }
}
