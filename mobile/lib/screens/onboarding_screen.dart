import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/swarm_colors.dart';
import '../theme/swarm_theme.dart';
import '../widgets/swarm_background.dart';
import '../widgets/swarm_primitives.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final int _step = 3;
  int _selected = 0;
  final _options = const [
    'Calme et prudent',
    'Pressé mais maîtrisé',
    "Détendu, j'aime explorer",
    'Anxieux en ville',
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          const SwarmBackground(),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 22),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      SwarmGhostButton(
                        label: '← Retour',
                        onPressed: () => context.go('/splash'),
                      ),
                      Text(
                        'ÉTAPE $_step SUR 9',
                        style: SwarmTheme.mono(size: 10.5, letterSpacing: 1),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: List.generate(9, (i) {
                      return Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 2),
                          child: Container(
                            height: 3,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(99),
                              gradient: i < _step
                                  ? const LinearGradient(
                                      colors: [
                                        SwarmColors.swarmBlue2,
                                        SwarmColors.swarmBlue,
                                      ],
                                    )
                                  : null,
                              color: i < _step ? null : const Color(0x2994A3B8),
                            ),
                          ),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    'Construisons votre profil mobilité',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w600,
                      color: SwarmColors.ink100,
                      height: 1.2,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'SWARM apprend en quelques questions.',
                    style: TextStyle(fontSize: 13.5, color: SwarmColors.ink500),
                  ),
                  const SizedBox(height: 24),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SwarmMark(size: 32),
                      const SizedBox(width: 10),
                      Expanded(
                        child: GlassCard(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 12,
                          ),
                          radius: 16,
                          child: const Text(
                            "Bonjour Yasmine. Je suis votre copilote SWARM. Pour commencer, comment vous décririez-vous au volant ?",
                            style: TextStyle(
                              fontSize: 13.5,
                              color: SwarmColors.ink100,
                              height: 1.5,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 22),
                  Expanded(
                    child: ListView.separated(
                      itemBuilder: (context, i) {
                        final selected = i == _selected;
                        return GlassCard(
                          onTap: () => setState(() => _selected = i),
                          radius: 14,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),
                          borderColor: selected
                              ? const Color(0x802A7BFF)
                              : null,
                          gradient: selected
                              ? const LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [
                                    Color(0x401A5FDC),
                                    Color(0x141A5FDC),
                                  ],
                                )
                              : null,
                          child: Row(
                            children: [
                              Container(
                                width: 18,
                                height: 18,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: selected
                                        ? SwarmColors.swarmBlue2
                                        : SwarmColors.hairlineStrong,
                                    width: 1.5,
                                  ),
                                ),
                                child: selected
                                    ? Center(
                                        child: Container(
                                          width: 8,
                                          height: 8,
                                          decoration: const BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: SwarmColors.swarmBlue2,
                                          ),
                                        ),
                                      )
                                    : null,
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  _options[i],
                                  style: const TextStyle(
                                    fontSize: 14,
                                    color: SwarmColors.ink100,
                                  ),
                                ),
                              ),
                              if (selected)
                                const SwarmChip(
                                  label: '+12',
                                  tone: SwarmChipTone.blue,
                                ),
                            ],
                          ),
                        );
                      },
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemCount: _options.length,
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12, top: 8),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'DONNÉES CHIFFRÉES · JAMAIS VENDUES',
                          style: SwarmTheme.mono(size: 10),
                        ),
                        SwarmPrimaryButton(
                          label: 'Suivant',
                          icon: Icons.chevron_right,
                          onPressed: () => context.go('/home'),
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
    );
  }
}
