import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../config/app_config.dart';
import '../state/trip_state.dart';
import '../theme/swarm_colors.dart';
import '../theme/swarm_theme.dart';
import '../widgets/map_style.dart';

class NavigationScreen extends StatefulWidget {
  const NavigationScreen({super.key});

  @override
  State<NavigationScreen> createState() => _NavigationScreenState();
}

class _NavigationScreenState extends State<NavigationScreen> {
  GoogleMapController? _map;
  int _stepIndex = 0;

  @override
  void initState() {
    super.initState();
    TripState.instance.addListener(_onTripChange);
  }

  @override
  void dispose() {
    TripState.instance.removeListener(_onTripChange);
    super.dispose();
  }

  void _onTripChange() {
    if (!mounted) return;
    setState(() {});
  }

  IconData _maneuverIcon(String? maneuver) {
    switch (maneuver) {
      case 'turn-right':
      case 'turn-slight-right':
      case 'turn-sharp-right':
        return Icons.turn_right;
      case 'turn-left':
      case 'turn-slight-left':
      case 'turn-sharp-left':
        return Icons.turn_left;
      case 'uturn-right':
      case 'uturn-left':
        return Icons.u_turn_left;
      case 'roundabout-left':
      case 'roundabout-right':
        return Icons.roundabout_right;
      case 'merge':
        return Icons.merge_type;
      case 'fork-right':
        return Icons.fork_right;
      case 'fork-left':
        return Icons.fork_left;
      case 'ramp-right':
        return Icons.ramp_right;
      case 'ramp-left':
        return Icons.ramp_left;
      case 'straight':
      default:
        return Icons.straight;
    }
  }

  @override
  Widget build(BuildContext context) {
    final trip = TripState.instance;
    final route = trip.route;
    final dark = context.isDark;

    if (route == null) {
      return Scaffold(
        backgroundColor: context.bgDeep,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.alt_route, size: 64, color: context.ink500),
                const SizedBox(height: 16),
                Text(
                  'Aucun itinéraire actif',
                  style: TextStyle(
                    color: context.ink100,
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Cherche une destination depuis la carte pour démarrer la navigation.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.ink500),
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: () => context.go('/home'),
                  icon: const Icon(Icons.search),
                  label: const Text('Chercher une destination'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final step = route.steps.isNotEmpty
        ? route.steps[_stepIndex.clamp(0, route.steps.length - 1)]
        : null;

    final remainingDistance = route.steps
        .skip(_stepIndex)
        .fold<int>(0, (s, e) => s + e.distanceMeters);
    final remainingDuration = route.steps
        .skip(_stepIndex)
        .fold<int>(0, (s, e) => s + e.durationSeconds);

    return Scaffold(
      backgroundColor: const Color(0xFF040714),
      body: Stack(
        children: [
          GoogleMap(
            initialCameraPosition: CameraPosition(
              target: route.polyline.isNotEmpty
                  ? route.polyline.first
                  : const LatLng(AppConfig.defaultLat, AppConfig.defaultLng),
              zoom: 15,
              tilt: 60,
            ),
            style: dark ? MapStyle.dark : MapStyle.light,
            myLocationEnabled: true,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            compassEnabled: false,
            mapToolbarEnabled: false,
            polylines: {
              Polyline(
                polylineId: const PolylineId('nav-route-bg'),
                points: route.polyline,
                color: Colors.black.withValues(alpha: 0.5),
                width: 12,
              ),
              Polyline(
                polylineId: const PolylineId('nav-route'),
                points: route.polyline,
                color: SwarmColors.swarmBlue2,
                width: 8,
                startCap: Cap.roundCap,
                endCap: Cap.roundCap,
              ),
            },
            markers: {
              if (trip.origin != null)
                Marker(
                  markerId: const MarkerId('origin'),
                  position: trip.origin!.location,
                  icon: BitmapDescriptor.defaultMarkerWithHue(
                    BitmapDescriptor.hueGreen,
                  ),
                ),
              if (trip.destination != null)
                Marker(
                  markerId: const MarkerId('destination'),
                  position: trip.destination!.location,
                  icon: BitmapDescriptor.defaultMarkerWithHue(
                    BitmapDescriptor.hueRed,
                  ),
                  infoWindow: InfoWindow(
                    title: trip.destination!.title,
                  ),
                ),
            },
            onMapCreated: (c) {
              _map = c;
              if (route.bounds != null) {
                Future.delayed(const Duration(milliseconds: 400), () {
                  _map?.animateCamera(
                    CameraUpdate.newLatLngBounds(route.bounds!, 80),
                  );
                });
              }
            },
          ),
          // Top: current step
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 0),
              child: Column(
                children: [
                  Material(
                    color: context.bgBase,
                    elevation: 8,
                    shadowColor: Colors.black54,
                    borderRadius: BorderRadius.circular(22),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 14,
                      ),
                      child: Row(
                        children: [
                          IconButton(
                            onPressed: () => context.go('/home'),
                            icon: const Icon(Icons.close),
                          ),
                          const SizedBox(width: 4),
                          Container(
                            width: 52,
                            height: 52,
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                colors: [
                                  SwarmColors.swarmBlue2,
                                  SwarmColors.swarmBlue,
                                ],
                              ),
                              borderRadius: BorderRadius.circular(14),
                              boxShadow: [
                                BoxShadow(
                                  color: SwarmColors.swarmBlue2.withValues(
                                    alpha: 0.5,
                                  ),
                                  blurRadius: 14,
                                  offset: const Offset(0, 6),
                                ),
                              ],
                            ),
                            child: Icon(
                              step != null
                                  ? _maneuverIcon(step.maneuver)
                                  : Icons.flag,
                              color: Colors.white,
                              size: 28,
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  step != null
                                      ? '${step.distanceMeters} m'
                                      : 'Arrivée',
                                  style: TextStyle(
                                    color: context.ink100,
                                    fontSize: 22,
                                    fontWeight: FontWeight.w700,
                                    height: 1,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  step?.instruction ?? 'Vous êtes arrivé',
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: context.ink300,
                                    fontSize: 13.5,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (step != null && _stepIndex + 1 < route.steps.length) ...[
                    const SizedBox(height: 8),
                    Material(
                      color: context.bgElev1,
                      elevation: 4,
                      borderRadius: BorderRadius.circular(14),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        child: Row(
                          children: [
                            Icon(
                              _maneuverIcon(route.steps[_stepIndex + 1].maneuver),
                              color: context.ink300,
                              size: 16,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              'Puis · ',
                              style: SwarmTheme.mono(
                                size: 10.5,
                                color: context.ink500,
                              ),
                            ),
                            Expanded(
                              child: Text(
                                route.steps[_stepIndex + 1].instruction,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: context.ink300,
                                  fontSize: 12.5,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          // Bottom: ETA + step controls
          Positioned(
            left: 14,
            right: 14,
            bottom: 24,
            child: Material(
              color: context.bgBase,
              elevation: 12,
              borderRadius: BorderRadius.circular(22),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 18,
                  vertical: 14,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'TEMPS · DISTANCE · ETA',
                            style: SwarmTheme.mono(
                              size: 10,
                              color: context.ink500,
                              letterSpacing: 0.6,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${_humanDuration(remainingDuration)} · ${_humanDistance(remainingDistance)}',
                            style: TextStyle(
                              fontSize: 18,
                              color: context.ink100,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton.outlined(
                      onPressed: _stepIndex > 0
                          ? () => setState(() => _stepIndex--)
                          : null,
                      icon: const Icon(Icons.skip_previous),
                    ),
                    const SizedBox(width: 6),
                    IconButton.outlined(
                      onPressed: _stepIndex + 1 < route.steps.length
                          ? () => setState(() => _stepIndex++)
                          : null,
                      icon: const Icon(Icons.skip_next),
                    ),
                    const SizedBox(width: 6),
                    IconButton(
                      onPressed: () => context.push('/bilan'),
                      icon: const Icon(
                        Icons.stop_circle,
                        color: SwarmColors.dangerRed,
                        size: 32,
                      ),
                      tooltip: 'Terminer',
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _humanDuration(int seconds) {
    final m = (seconds / 60).round();
    if (m < 60) return '$m min';
    final h = m ~/ 60;
    final r = m % 60;
    return r == 0 ? '${h}h' : '${h}h$r';
  }

  String _humanDistance(int meters) {
    if (meters >= 1000) {
      final km = meters / 1000;
      return '${km.toStringAsFixed(km < 10 ? 1 : 0)} km';
    }
    return '$meters m';
  }
}
