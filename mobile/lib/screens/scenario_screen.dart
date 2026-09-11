import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../api/corridors_service.dart';
import '../state/trip_state.dart';
import '../theme/swarm_colors.dart';
import '../theme/swarm_theme.dart';
import '../widgets/swarm_background.dart';
import '../widgets/swarm_primitives.dart';

class ScenarioScreen extends StatefulWidget {
  const ScenarioScreen({super.key});

  @override
  State<ScenarioScreen> createState() => _ScenarioScreenState();
}

class _Scenario {
  const _Scenario({
    required this.id,
    required this.name,
    required this.desc,
    required this.color,
    required this.tone,
    required this.deltaMinutes,
    required this.co2PerKm,
    required this.stress,
    required this.safety,
    this.badge,
  });

  final String id;
  final String name;
  final String desc;
  final Color color;
  final SwarmChipTone tone;
  final int deltaMinutes;
  final double co2PerKm;
  final int stress;
  final int safety;
  final String? badge;

  /// Format display time = baseDurationSeconds + deltaMinutes*60.
  String timeLabel(int baseDurationSeconds) {
    final total = (baseDurationSeconds + deltaMinutes * 60).clamp(60, 1 << 31);
    final m = (total / 60).round();
    if (m < 60) return '$m min';
    final h = m ~/ 60;
    final r = m % 60;
    return r == 0 ? '${h}h' : '${h}h$r';
  }

  String deltaLabel() {
    if (deltaMinutes == 0) return '0';
    return deltaMinutes > 0 ? '+$deltaMinutes' : '$deltaMinutes';
  }

  String co2Label(int distanceMeters) {
    final kg = (distanceMeters / 1000.0) * co2PerKm;
    if (kg < 1) return '${(kg * 1000).round()}g';
    return '${kg.toStringAsFixed(1)}kg';
  }
}

class _ScenarioScreenState extends State<ScenarioScreen> {
  String _active = 'safe';
  final _corridorsService = CorridorsService();
  List<Corridor> _corridors = [];
  bool _loadingCorridors = false;
  String? _corridorsError;

  @override
  void initState() {
    super.initState();
    _fetchCorridors();
  }

  Future<void> _fetchCorridors() async {
    setState(() {
      _loadingCorridors = true;
      _corridorsError = null;
    });
    try {
      final c = await _corridorsService.list();
      if (!mounted) return;
      setState(() {
        _corridors = c;
        _loadingCorridors = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _corridorsError = e.status == 401
            ? 'Non authentifié — connexion requise'
            : 'Backend STLS injoignable';
        _loadingCorridors = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _corridorsError = 'Backend STLS injoignable';
        _loadingCorridors = false;
      });
    }
  }

  final _scenarios = const [
    _Scenario(
      id: 'safe',
      name: 'Trajet sécurisé',
      desc: 'Évite les zones accidentogènes',
      color: SwarmColors.safeGreen,
      tone: SwarmChipTone.green,
      deltaMinutes: 3,
      co2PerKm: 0.142,
      stress: 12,
      safety: 96,
      badge: 'Recommandé',
    ),
    _Scenario(
      id: 'eco',
      name: 'Éco-trajet',
      desc: "Moins de carburant, moins d'usure",
      color: SwarmColors.ecoTeal,
      tone: SwarmChipTone.teal,
      deltaMinutes: 6,
      co2PerKm: 0.088,
      stress: 22,
      safety: 88,
      badge: '−38% CO₂',
    ),
    _Scenario(
      id: 'low',
      name: 'Apaisé',
      desc: "Trajet calme, peu d'intersections",
      color: SwarmColors.stressViolet,
      tone: SwarmChipTone.violet,
      deltaMinutes: 9,
      co2PerKm: 0.150,
      stress: 8,
      safety: 92,
    ),
    _Scenario(
      id: 'family',
      name: 'Famille',
      desc: 'Sièges enfants · pauses prévues',
      color: SwarmColors.alertAmber,
      tone: SwarmChipTone.amber,
      deltaMinutes: 5,
      co2PerKm: 0.140,
      stress: 14,
      safety: 94,
    ),
    _Scenario(
      id: 'rain',
      name: 'Mode pluie',
      desc: 'Évite les zones inondables',
      color: SwarmColors.swarmBlue2,
      tone: SwarmChipTone.blue,
      deltaMinutes: 8,
      co2PerKm: 0.145,
      stress: 18,
      safety: 90,
    ),
    _Scenario(
      id: 'park',
      name: 'Park & Tram',
      desc: "Voiture jusqu'au P+R, tram ensuite",
      color: SwarmColors.ecoTeal,
      tone: SwarmChipTone.teal,
      deltaMinutes: -2,
      co2PerKm: 0.040,
      stress: 10,
      safety: 95,
      badge: 'Optimal',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        const SwarmBackground(),
        SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 8, 14, 0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    SwarmGhostButton(
                      label: '←',
                      onPressed: () => context.go('/home'),
                    ),
                    Row(
                      children: [
                        const PulseDot(size: 6),
                        const SizedBox(width: 6),
                        Text(
                          'SCÉNARIOS · VIVANT',
                          style: SwarmTheme.mono(size: 10, letterSpacing: 1),
                        ),
                      ],
                    ),
                    const SwarmGhostButton(label: '···'),
                  ],
                ),
              ),
              const _TripHeaderCard(),
              _BackendStatusBanner(
                loading: _loadingCorridors,
                error: _corridorsError,
                liveCount: _corridors.length,
                onRetry: _fetchCorridors,
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(14, 8, 14, 100),
                  children: [
                    if (_corridors.isNotEmpty) ...[
                      for (final c in _corridors)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _CorridorCard(corridor: c),
                        ),
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Row(
                          children: [
                            Expanded(child: Divider(color: context.hairline)),
                            const SizedBox(width: 10),
                            Text(
                              'PROFILS COGNITIFS',
                              style: SwarmTheme.mono(
                                size: 10,
                                color: context.ink500,
                                letterSpacing: 0.8,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(child: Divider(color: context.hairline)),
                          ],
                        ),
                      ),
                    ],
                    for (var i = 0; i < _scenarios.length; i++) ...[
                      _ScenarioCard(
                        scenario: _scenarios[i],
                        active: _scenarios[i].id == _active,
                        onTap: () =>
                            setState(() => _active = _scenarios[i].id),
                        baseDurationSeconds:
                            TripState.instance.route?.durationSeconds ?? 1800,
                        baseDistanceMeters:
                            TripState.instance.route?.distanceMeters ?? 15000,
                      ),
                      const SizedBox(height: 10),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
        Positioned(
          left: 14,
          right: 14,
          bottom: 18,
          child: SwarmPrimaryButton(
            label: TripState.instance.destination == null
                ? 'Choisir une destination'
                : 'Démarrer ce scénario',
            icon: Icons.navigation,
            expand: true,
            onPressed: () {
              if (TripState.instance.destination == null) {
                context.push('/search');
              } else {
                context.push('/navigation');
              }
            },
          ),
        ),
      ],
    );
  }
}

class _ScenarioCard extends StatelessWidget {
  const _ScenarioCard({
    required this.scenario,
    required this.active,
    required this.onTap,
    required this.baseDurationSeconds,
    required this.baseDistanceMeters,
  });

  final _Scenario scenario;
  final bool active;
  final VoidCallback onTap;
  final int baseDurationSeconds;
  final int baseDistanceMeters;

  int get _baseDurationSeconds => baseDurationSeconds;
  int get _baseDistanceMeters => baseDistanceMeters;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      halo: active,
      onTap: onTap,
      radius: SwarmRadius.lg,
      borderColor: active ? scenario.color.withValues(alpha: 0.5) : null,
      gradient: active
          ? LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [scenario.color.withValues(alpha: 0.18), const Color(0x990F172A)],
            )
          : null,
      child: Stack(
        children: [
          Positioned(
            left: -14,
            top: -14,
            bottom: -14,
            child: Container(
              width: 3,
              color: scenario.color.withValues(alpha: active ? 1 : 0.4),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Wrap(
                          spacing: 8,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Text(
                              scenario.name,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                                color: SwarmColors.ink100,
                              ),
                            ),
                            if (scenario.badge != null)
                              SwarmChip(label: scenario.badge!, tone: scenario.tone),
                          ],
                        ),
                        const SizedBox(height: 3),
                        Text(
                          scenario.desc,
                          style: const TextStyle(
                            fontSize: 11.5,
                            color: SwarmColors.ink500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        scenario.timeLabel(_baseDurationSeconds),
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w600,
                          color: scenario.color,
                        ),
                      ),
                      Text(
                        'Δ ${scenario.deltaLabel()} min',
                        style: SwarmTheme.mono(size: 10.5),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 12),
              const Divider(color: SwarmColors.hairline, height: 1),
              const SizedBox(height: 12),
              Row(
                children: [
                  _Metric(
                    icon: Icons.eco,
                    label: 'CO₂',
                    value: scenario.co2Label(_baseDistanceMeters),
                  ),
                  _Metric(
                    icon: Icons.psychology_alt,
                    label: 'Stress',
                    value: '${scenario.stress}%',
                    color: scenario.stress < 15
                        ? SwarmColors.safeGreen
                        : scenario.stress < 25
                            ? SwarmColors.alertAmber
                            : SwarmColors.dangerRed,
                  ),
                  _Metric(
                    icon: Icons.shield_outlined,
                    label: 'Sécurité',
                    value: '${scenario.safety}',
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({
    required this.icon,
    required this.label,
    required this.value,
    this.color,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 11, color: SwarmColors.ink500),
              const SizedBox(width: 4),
              Text(
                label.toUpperCase(),
                style: SwarmTheme.mono(size: 9.5, letterSpacing: 0.6),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: TextStyle(
              fontSize: 13,
              color: color ?? SwarmColors.ink100,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

class _BackendStatusBanner extends StatelessWidget {
  const _BackendStatusBanner({
    required this.loading,
    required this.error,
    required this.liveCount,
    required this.onRetry,
  });

  final bool loading;
  final String? error;
  final int liveCount;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final hasLive = liveCount > 0 && error == null;
    final color = hasLive
        ? SwarmColors.safeGreen
        : (error != null ? SwarmColors.alertAmber : SwarmColors.swarmBlue2);
    final label = loading
        ? 'Connexion STLS…'
        : error != null
            ? error!
            : hasLive
                ? '$liveCount corridors live STLS'
                : 'Aucun corridor backend';
    return Padding(
      padding: const EdgeInsets.fromLTRB(22, 4, 22, 6),
      child: Row(
        children: [
          if (loading)
            const SizedBox(
              width: 10,
              height: 10,
              child: CircularProgressIndicator(strokeWidth: 1.6),
            )
          else
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
              ),
            ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label,
              style: SwarmTheme.mono(
                size: 10.5,
                color: color,
                letterSpacing: 0.5,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (error != null)
            TextButton(
              onPressed: onRetry,
              style: TextButton.styleFrom(
                minimumSize: const Size(0, 28),
                padding: const EdgeInsets.symmetric(horizontal: 8),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Text(
                'Réessayer',
                style: SwarmTheme.mono(
                  size: 10.5,
                  color: context.ink100,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _CorridorCard extends StatelessWidget {
  const _CorridorCard({required this.corridor});

  final Corridor corridor;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      halo: true,
      radius: SwarmRadius.lg,
      borderColor: SwarmColors.safeGreen.withValues(alpha: 0.4),
      child: Stack(
        children: [
          Positioned(
            left: -14,
            top: -14,
            bottom: -14,
            child: Container(width: 3, color: SwarmColors.safeGreen),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const SwarmChip(
                    label: 'LIVE STLS',
                    tone: SwarmChipTone.green,
                  ),
                  const SizedBox(width: 8),
                  if (corridor.status != null)
                    SwarmChip(label: corridor.status!.toUpperCase()),
                  const Spacer(),
                  Text(
                    '#${corridor.id}',
                    style: SwarmTheme.mono(
                      size: 10,
                      color: context.ink500,
                      letterSpacing: 0.4,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                corridor.name,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: context.ink100,
                ),
              ),
              if (corridor.description != null) ...[
                const SizedBox(height: 4),
                Text(
                  corridor.description!,
                  style: TextStyle(fontSize: 12.5, color: context.ink500),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _TripHeaderCard extends StatelessWidget {
  const _TripHeaderCard();

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: TripState.instance,
      builder: (context, _) {
        final trip = TripState.instance;
        return Padding(
          padding: const EdgeInsets.fromLTRB(22, 12, 22, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'DE · VERS',
                style: SwarmTheme.mono(
                  size: 11,
                  color: context.ink500,
                  letterSpacing: 0.8,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                trip.destination == null
                    ? 'Pas de destination — cherche un lieu'
                    : '${trip.origin?.title ?? "Ma position"} → ${trip.destination!.title}',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                  color: context.ink100,
                ),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  if (trip.route != null)
                    SwarmChip(
                      label: trip.route!.durationLabel,
                      tone: SwarmChipTone.blue,
                    ),
                  if (trip.route != null)
                    SwarmChip(
                      label: trip.route!.distanceLabel,
                      tone: SwarmChipTone.teal,
                    ),
                  const SwarmChip(label: 'SWARM v1.0', tone: SwarmChipTone.blue),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}
