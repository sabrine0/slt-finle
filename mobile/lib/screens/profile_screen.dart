import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/auth_service.dart';
import '../theme/swarm_colors.dart';
import '../theme/swarm_theme.dart';
import '../widgets/swarm_background.dart';
import '../widgets/swarm_primitives.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  String _displayName() {
    final p = AuthService.instance.profile;
    if (p == null) return 'Mode démo';
    return (p['fullName'] ?? p['name'] ?? p['email'] ?? 'Utilisateur STLS')
        .toString();
  }

  String? _displayEmail() {
    final p = AuthService.instance.profile;
    if (p == null) return null;
    return p['email']?.toString();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: AuthService.instance,
      builder: (context, _) => _buildBody(context),
    );
  }

  Widget _buildBody(BuildContext context) {
    return Stack(
      children: [
        const SwarmBackground(),
        SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 120),
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Row(
                  children: [
                    Container(
                      width: 56,
                      height: 56,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            SwarmColors.ecoTeal,
                            SwarmColors.stressViolet,
                          ],
                        ),
                      ),
                      child: const Center(
                        child: Text(
                          'Y',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _displayName(),
                            style: const TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w600,
                              color: SwarmColors.ink100,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              if (AuthService.instance.isAuthenticated)
                                const SwarmChip(
                                  label: 'STLS connecté',
                                  tone: SwarmChipTone.green,
                                )
                              else
                                const SwarmChip(
                                  label: 'Mode démo',
                                  tone: SwarmChipTone.amber,
                                ),
                              const SizedBox(width: 6),
                              const SwarmChip(
                                label: '−312kg CO₂',
                                tone: SwarmChipTone.teal,
                              ),
                            ],
                          ),
                          if (_displayEmail() != null) ...[
                            const SizedBox(height: 4),
                            Text(
                              _displayEmail()!,
                              style: const TextStyle(
                                fontSize: 12,
                                color: SwarmColors.ink500,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () async {
                        if (AuthService.instance.isAuthenticated) {
                          await AuthService.instance.logout();
                          if (context.mounted) context.go('/login');
                        } else {
                          context.go('/login');
                        }
                      },
                      icon: Icon(
                        AuthService.instance.isAuthenticated
                            ? Icons.logout
                            : Icons.login,
                        color: SwarmColors.ink300,
                      ),
                      tooltip: AuthService.instance.isAuthenticated
                          ? 'Déconnexion'
                          : 'Connexion',
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              GlassCard(
                halo: true,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const LiveEyebrow(
                      label: 'Saisons cognitives',
                      color: SwarmColors.stressViolet,
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: const [
                        _BadgeCol(
                          icon: Icons.shield_outlined,
                          label: 'Sécurité',
                          value: '92',
                          color: SwarmColors.safeGreen,
                        ),
                        _BadgeCol(
                          icon: Icons.eco,
                          label: 'Éco',
                          value: '84',
                          color: SwarmColors.ecoTeal,
                        ),
                        _BadgeCol(
                          icon: Icons.psychology_alt,
                          label: 'Calme',
                          value: '78',
                          color: SwarmColors.stressViolet,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              _Tile(
                icon: Icons.directions_car_outlined,
                title: 'Mon véhicule',
                subtitle: 'Renault Clio · Diesel · 2019',
                onTap: () => context.push('/vehicle'),
              ),
              _Tile(
                icon: Icons.nights_stay_outlined,
                title: 'Mode Ramadan',
                subtitle: 'Adapter horaires & ftour',
                onTap: () => context.push('/ramadan'),
              ),
              _Tile(
                icon: Icons.directions_transit_outlined,
                title: 'Comparaison multimodale',
                subtitle: 'Voiture vs TC vs vélo',
                onTap: () => context.push('/multimodal'),
              ),
              _Tile(
                icon: Icons.fact_check_outlined,
                title: 'Mes bilans trajet',
                subtitle: '24 trajets ce mois',
                onTap: () => context.push('/bilan'),
              ),
              _Tile(
                icon: Icons.shield_moon_outlined,
                title: 'Confidentialité',
                subtitle: 'Données chiffrées · jamais vendues',
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _BadgeCol extends StatelessWidget {
  const _BadgeCol({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color.withValues(alpha: 0.16),
              border: Border.all(color: color.withValues(alpha: 0.5)),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
          Text(
            label.toUpperCase(),
            style: SwarmTheme.mono(size: 9.5, letterSpacing: 0.8),
          ),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: GlassCard(
        radius: 14,
        onTap: onTap,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        child: Row(
          children: [
            Icon(icon, color: SwarmColors.swarmBlue2, size: 22),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 14,
                      color: SwarmColors.ink100,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 11.5,
                      color: SwarmColors.ink500,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(
              Icons.chevron_right,
              color: SwarmColors.ink500,
            ),
          ],
        ),
      ),
    );
  }
}
