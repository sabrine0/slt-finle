import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/swarm_colors.dart';
import '../theme/swarm_theme.dart';
import '../widgets/swarm_background.dart';
import '../widgets/swarm_primitives.dart';

class ParkScreen extends StatelessWidget {
  const ParkScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final spots = [
      _ParkSpot(
        name: 'P+R Sidi Maârouf',
        dist: '1.2 km',
        avail: 142,
        total: 380,
        price: '15 DH / jour',
        tram: 'T1 · 8 min',
        recommended: true,
      ),
      _ParkSpot(
        name: 'Casa Voyageurs',
        dist: '3.8 km',
        avail: 24,
        total: 220,
        price: 'Gratuit',
        tram: 'TGV + Tram',
      ),
      _ParkSpot(
        name: 'Anfa Place',
        dist: '0.6 km',
        avail: 67,
        total: 450,
        price: '20 DH / h',
        tram: 'T2 · 4 min',
      ),
    ];
    return Scaffold(
      body: Stack(
        children: [
          const SwarmBackground(),
          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 8, 14, 0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      SwarmGhostButton(
                        label: '←',
                        onPressed: () => context.pop(),
                      ),
                      Text(
                        'PARK & CONTINUE',
                        style: SwarmTheme.mono(size: 11, letterSpacing: 1),
                      ),
                      const SizedBox(width: 24),
                    ],
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.fromLTRB(22, 18, 22, 12),
                  child: Text(
                    'Garez-vous, continuez en transport',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w600,
                      color: SwarmColors.ink100,
                    ),
                  ),
                ),
                Expanded(
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(14, 0, 14, 24),
                    itemCount: spots.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, i) {
                      final s = spots[i];
                      final ratio = s.avail / s.total;
                      return GlassCard(
                        halo: s.recommended,
                        radius: 16,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Container(
                                  width: 40,
                                  height: 40,
                                  decoration: BoxDecoration(
                                    color: SwarmColors.ecoTeal.withValues(
                                      alpha: 0.18,
                                    ),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: const Icon(
                                    Icons.local_parking,
                                    color: SwarmColors.ecoTeal,
                                    size: 20,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Expanded(
                                            child: Text(
                                              s.name,
                                              style: const TextStyle(
                                                fontSize: 15,
                                                fontWeight: FontWeight.w600,
                                                color: SwarmColors.ink100,
                                              ),
                                            ),
                                          ),
                                          if (s.recommended)
                                            const SwarmChip(
                                              label: 'Optimal',
                                              tone: SwarmChipTone.teal,
                                            ),
                                        ],
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        '${s.dist} · ${s.price}',
                                        style: const TextStyle(
                                          fontSize: 12,
                                          color: SwarmColors.ink500,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 14),
                            Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Text(
                                            'PLACES',
                                            style: SwarmTheme.mono(size: 9.5),
                                          ),
                                          const Spacer(),
                                          Text(
                                            '${s.avail}/${s.total}',
                                            style: SwarmTheme.mono(
                                              size: 11,
                                              color: ratio > 0.3
                                                  ? SwarmColors.safeGreen
                                                  : SwarmColors.alertAmber,
                                            ),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 4),
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(4),
                                        child: LinearProgressIndicator(
                                          value: ratio,
                                          minHeight: 6,
                                          backgroundColor: SwarmColors.hairline,
                                          valueColor: AlwaysStoppedAnimation(
                                            ratio > 0.3
                                                ? SwarmColors.safeGreen
                                                : SwarmColors.alertAmber,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 16),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text(
                                      'CORRESPONDANCE',
                                      style: SwarmTheme.mono(size: 9.5),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      s.tram,
                                      style: const TextStyle(
                                        fontSize: 13,
                                        color: SwarmColors.swarmBlue2,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ],
                        ),
                      );
                    },
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

class _ParkSpot {
  const _ParkSpot({
    required this.name,
    required this.dist,
    required this.avail,
    required this.total,
    required this.price,
    required this.tram,
    this.recommended = false,
  });

  final String name;
  final String dist;
  final int avail;
  final int total;
  final String price;
  final String tram;
  final bool recommended;
}
