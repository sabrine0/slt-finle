import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/swarm_colors.dart';
import '../theme/swarm_theme.dart';
import '../widgets/swarm_background.dart';
import '../widgets/swarm_primitives.dart';

class MultimodalScreen extends StatefulWidget {
  const MultimodalScreen({super.key});

  @override
  State<MultimodalScreen> createState() => _MultimodalScreenState();
}

class _Mode {
  const _Mode({
    required this.id,
    required this.label,
    required this.icon,
    required this.time,
    required this.co2,
    required this.cost,
    required this.color,
    this.badge,
  });
  final String id;
  final String label;
  final IconData icon;
  final String time;
  final String co2;
  final String cost;
  final Color color;
  final String? badge;
}

class _MultimodalScreenState extends State<MultimodalScreen> {
  String _selected = 'park';

  final _modes = const [
    _Mode(
      id: 'car',
      label: 'Voiture solo',
      icon: Icons.directions_car,
      time: '28 min',
      co2: '2.1 kg',
      cost: '32 DH',
      color: SwarmColors.swarmBlue2,
    ),
    _Mode(
      id: 'bus',
      label: 'Bus + marche',
      icon: Icons.directions_bus,
      time: '46 min',
      co2: '0.6 kg',
      cost: '6 DH',
      color: SwarmColors.alertAmber,
    ),
    _Mode(
      id: 'tram',
      label: 'Tram + marche',
      icon: Icons.tram,
      time: '38 min',
      co2: '0.4 kg',
      cost: '7 DH',
      color: SwarmColors.ecoTeal,
    ),
    _Mode(
      id: 'park',
      label: 'Park & Tram',
      icon: Icons.commute,
      time: '26 min',
      co2: '0.7 kg',
      cost: '22 DH',
      color: SwarmColors.ecoTeal,
      badge: 'Optimal',
    ),
    _Mode(
      id: 'bike',
      label: 'Vélo',
      icon: Icons.directions_bike,
      time: '34 min',
      co2: '0 kg',
      cost: '0 DH',
      color: SwarmColors.safeGreen,
    ),
    _Mode(
      id: 'walk',
      label: 'Marche',
      icon: Icons.directions_walk,
      time: '1h10',
      co2: '0 kg',
      cost: '0 DH',
      color: SwarmColors.stressViolet,
    ),
  ];

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
                      'COMPARAISON MULTIMODALE',
                      style: SwarmTheme.mono(size: 10.5, letterSpacing: 1),
                    ),
                    const Spacer(),
                    const SizedBox(width: 24),
                  ],
                ),
                const SizedBox(height: 14),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 6),
                  child: Text(
                    'Maârif → Aéroport',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w600,
                      color: SwarmColors.ink100,
                    ),
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.fromLTRB(6, 4, 6, 12),
                  child: Text(
                    '14 modes évalués · 11 dimensions',
                    style: TextStyle(fontSize: 12, color: SwarmColors.ink500),
                  ),
                ),
                for (final m in _modes)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: GlassCard(
                      onTap: () => setState(() => _selected = m.id),
                      halo: m.id == _selected,
                      borderColor: m.id == _selected
                          ? m.color.withValues(alpha: 0.5)
                          : null,
                      radius: 14,
                      child: Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: m.color.withValues(alpha: 0.18),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Icon(m.icon, color: m.color, size: 22),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text(
                                      m.label,
                                      style: const TextStyle(
                                        fontSize: 14.5,
                                        fontWeight: FontWeight.w600,
                                        color: SwarmColors.ink100,
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    if (m.badge != null)
                                      SwarmChip(
                                        label: m.badge!,
                                        tone: SwarmChipTone.teal,
                                      ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Row(
                                  children: [
                                    _Tag(value: m.time, label: 'TEMPS'),
                                    const SizedBox(width: 12),
                                    _Tag(
                                      value: m.co2,
                                      label: 'CO₂',
                                      color: SwarmColors.ecoTeal,
                                    ),
                                    const SizedBox(width: 12),
                                    _Tag(value: m.cost, label: 'COÛT'),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
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

class _Tag extends StatelessWidget {
  const _Tag({
    required this.value,
    required this.label,
    this.color,
  });
  final String value;
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: SwarmTheme.mono(size: 9, letterSpacing: 0.6),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: 12,
            color: color ?? SwarmColors.ink100,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
