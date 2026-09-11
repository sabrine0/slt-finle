import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/swarm_colors.dart';
import '../theme/swarm_theme.dart';
import '../widgets/swarm_background.dart';
import '../widgets/swarm_primitives.dart';

class BilanScreen extends StatelessWidget {
  const BilanScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          const SwarmBackground(),
          SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 30),
              children: [
                Row(
                  children: [
                    SwarmGhostButton(label: '←', onPressed: () => context.pop()),
                    const Spacer(),
                    Text(
                      'BILAN POST-TRAJET',
                      style: SwarmTheme.mono(size: 11, letterSpacing: 1),
                    ),
                    const Spacer(),
                    const SizedBox(width: 24),
                  ],
                ),
                const SizedBox(height: 18),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 6),
                  child: Text(
                    'Trajet terminé',
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w600,
                      color: SwarmColors.ink100,
                    ),
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.fromLTRB(6, 4, 6, 16),
                  child: Text(
                    'Maârif → Aéroport Mohammed V · 19h12 — 19h41',
                    style: TextStyle(fontSize: 12, color: SwarmColors.ink500),
                  ),
                ),
                GlassCard(
                  halo: true,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const LiveEyebrow(
                        label: 'Score du trajet',
                        color: SwarmColors.safeGreen,
                      ),
                      const SizedBox(height: 8),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          const Text(
                            '94',
                            style: TextStyle(
                              fontSize: 56,
                              fontWeight: FontWeight.w600,
                              color: SwarmColors.safeGreen,
                              height: 1,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Text(
                              '/100',
                              style: SwarmTheme.mono(size: 14),
                            ),
                          ),
                          const Spacer(),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              const Text(
                                '+12 pts',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w600,
                                  color: SwarmColors.safeGreen,
                                ),
                              ),
                              Text(
                                'COGNITIVE GAIN',
                                style: SwarmTheme.mono(size: 10),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                GlassCard(
                  radius: 16,
                  child: Column(
                    children: [
                      _Row(label: 'Temps réel', value: '29 min', icon: Icons.schedule),
                      const Divider(height: 18, color: SwarmColors.hairline),
                      _Row(
                        label: 'Carburant économisé',
                        value: '0.8 L',
                        icon: Icons.local_gas_station,
                        accent: SwarmColors.ecoTeal,
                      ),
                      const Divider(height: 18, color: SwarmColors.hairline),
                      _Row(
                        label: 'CO₂ évité',
                        value: '1.7 kg',
                        icon: Icons.eco,
                        accent: SwarmColors.ecoTeal,
                      ),
                      const Divider(height: 18, color: SwarmColors.hairline),
                      _Row(
                        label: 'Pic de stress',
                        value: '23%',
                        icon: Icons.psychology_alt,
                        accent: SwarmColors.alertAmber,
                      ),
                      const Divider(height: 18, color: SwarmColors.hairline),
                      _Row(
                        label: 'Vigilance moyenne',
                        value: '88%',
                        icon: Icons.shield_outlined,
                        accent: SwarmColors.safeGreen,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                GlassCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const LiveEyebrow(label: 'SWARM dit'),
                      const SizedBox(height: 8),
                      const Text(
                        "Tu as gardé une conduite calme malgré la pluie. La prochaine fois je te propose le trajet apaisé en amont.",
                        style: TextStyle(
                          fontSize: 13.5,
                          color: SwarmColors.ink100,
                          height: 1.5,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                SwarmPrimaryButton(
                  label: 'Retour à l\'accueil',
                  icon: Icons.home,
                  expand: true,
                  onPressed: () => context.go('/home'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.label,
    required this.value,
    required this.icon,
    this.accent,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: accent ?? SwarmColors.ink300, size: 18),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 13.5,
              color: SwarmColors.ink300,
            ),
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: accent ?? SwarmColors.ink100,
          ),
        ),
      ],
    );
  }
}
