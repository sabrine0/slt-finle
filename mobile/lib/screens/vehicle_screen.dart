import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/swarm_colors.dart';
import '../theme/swarm_theme.dart';
import '../widgets/swarm_background.dart';
import '../widgets/swarm_primitives.dart';

class VehicleScreen extends StatelessWidget {
  const VehicleScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final attributes = [
      _AttrGroup(
        'Énergie',
        SwarmColors.ecoTeal,
        const [
          _Attr('Type', 'Diesel · Euro 6'),
          _Attr('Conso. mixte', '5.4 L/100'),
          _Attr('Sensibilité prix', 'Élevée'),
          _Attr('Range', '850 km'),
        ],
      ),
      _AttrGroup(
        'Gabarit',
        SwarmColors.swarmBlue2,
        const [
          _Attr('Catégorie', 'Compacte'),
          _Attr('Longueur', '4.05 m'),
          _Attr('Largeur', '1.73 m'),
          _Attr('Hauteur', '1.45 m'),
        ],
      ),
      _AttrGroup(
        'Freinage & sécurité',
        SwarmColors.alertAmber,
        const [
          _Attr('ABS', 'Oui'),
          _Attr('ESP', 'Oui'),
          _Attr('Distance freinage', '38 m @ 100'),
          _Attr('Note SWARM safety', '78/100'),
        ],
      ),
      _AttrGroup(
        'Environnement',
        SwarmColors.stressViolet,
        const [
          _Attr('Vignette Crit\'Air', '2'),
          _Attr('ZFE compatibles', '8/12'),
          _Attr('CO₂ mixte', '142 g/km'),
        ],
      ),
    ];
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
                      'VEHICLE KNOWLEDGE GRAPH',
                      style: SwarmTheme.mono(size: 10.5, letterSpacing: 1),
                    ),
                    const Spacer(),
                    const SizedBox(width: 24),
                  ],
                ),
                const SizedBox(height: 14),
                GlassCard(
                  halo: true,
                  child: Row(
                    children: [
                      Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          color: SwarmColors.swarmBlue.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: const Icon(
                          Icons.directions_car,
                          color: SwarmColors.swarmBlue2,
                          size: 28,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Renault Clio IV',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w600,
                                color: SwarmColors.ink100,
                              ),
                            ),
                            const SizedBox(height: 2),
                            const Text(
                              '2019 · 78 432 km',
                              style: TextStyle(
                                fontSize: 12,
                                color: SwarmColors.ink500,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: const [
                                SwarmChip(
                                  label: '40 attributs',
                                  tone: SwarmChipTone.blue,
                                ),
                                SwarmChip(
                                  label: 'VKG v1.0',
                                  tone: SwarmChipTone.teal,
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                for (final group in attributes) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(6, 14, 6, 6),
                    child: Row(
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            color: group.color,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          group.title.toUpperCase(),
                          style: SwarmTheme.mono(
                            size: 11,
                            color: group.color,
                            letterSpacing: 0.8,
                          ),
                        ),
                      ],
                    ),
                  ),
                  GlassCard(
                    radius: 14,
                    child: Column(
                      children: [
                        for (var i = 0; i < group.attrs.length; i++) ...[
                          if (i > 0) const Divider(color: SwarmColors.hairline, height: 16),
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  group.attrs[i].name,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    color: SwarmColors.ink300,
                                  ),
                                ),
                              ),
                              Text(
                                group.attrs[i].value,
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: SwarmColors.ink100,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AttrGroup {
  final String title;
  final Color color;
  final List<_Attr> attrs;
  const _AttrGroup(this.title, this.color, this.attrs);
}

class _Attr {
  final String name;
  final String value;
  const _Attr(this.name, this.value);
}
