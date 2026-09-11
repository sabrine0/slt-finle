import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/swarm_colors.dart';
import '../theme/swarm_theme.dart';
import '../widgets/swarm_background.dart';
import '../widgets/swarm_primitives.dart';

class UserProfileEditScreen extends StatefulWidget {
  const UserProfileEditScreen({super.key});

  @override
  State<UserProfileEditScreen> createState() => _UserProfileEditScreenState();
}

class _UserProfileEditScreenState extends State<UserProfileEditScreen> {
  double _stress = 0.4;
  double _eco = 0.7;
  double _safety = 0.85;
  String _style = 'Calme et prudent';

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
                      'PROFIL MOBILITÉ',
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
                    'Ajuste ton profil cognitif',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w600,
                      color: SwarmColors.ink100,
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                GlassCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'STYLE DE CONDUITE',
                        style: SwarmTheme.mono(size: 10.5),
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final s in [
                            'Calme et prudent',
                            'Pressé mais maîtrisé',
                            "J'aime explorer",
                            'Anxieux en ville',
                          ])
                            InkWell(
                              onTap: () => setState(() => _style = s),
                              borderRadius: BorderRadius.circular(99),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 8,
                                ),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(99),
                                  border: Border.all(
                                    color: _style == s
                                        ? SwarmColors.swarmBlue2
                                        : SwarmColors.hairlineStrong,
                                  ),
                                  color: _style == s
                                      ? SwarmColors.swarmBlue.withValues(
                                          alpha: 0.18,
                                        )
                                      : Colors.transparent,
                                ),
                                child: Text(
                                  s,
                                  style: TextStyle(
                                    fontSize: 12.5,
                                    color: _style == s
                                        ? SwarmColors.ink100
                                        : SwarmColors.ink300,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                _Slider(
                  label: 'Tolérance stress',
                  value: _stress,
                  color: SwarmColors.stressViolet,
                  onChanged: (v) => setState(() => _stress = v),
                ),
                _Slider(
                  label: 'Préférence éco',
                  value: _eco,
                  color: SwarmColors.ecoTeal,
                  onChanged: (v) => setState(() => _eco = v),
                ),
                _Slider(
                  label: 'Priorité sécurité',
                  value: _safety,
                  color: SwarmColors.safeGreen,
                  onChanged: (v) => setState(() => _safety = v),
                ),
                const SizedBox(height: 18),
                SwarmPrimaryButton(
                  label: 'Enregistrer le profil',
                  icon: Icons.check,
                  expand: true,
                  onPressed: () => context.pop(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Slider extends StatelessWidget {
  const _Slider({
    required this.label,
    required this.value,
    required this.color,
    required this.onChanged,
  });

  final String label;
  final double value;
  final Color color;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: GlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    label,
                    style: const TextStyle(
                      color: SwarmColors.ink100,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                Text(
                  '${(value * 100).round()}%',
                  style: TextStyle(
                    color: color,
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
            SliderTheme(
              data: SliderTheme.of(context).copyWith(
                activeTrackColor: color,
                thumbColor: color,
                inactiveTrackColor: SwarmColors.hairline,
                overlayColor: color.withValues(alpha: 0.2),
                trackHeight: 4,
              ),
              child: Slider(value: value, onChanged: onChanged),
            ),
          ],
        ),
      ),
    );
  }
}
