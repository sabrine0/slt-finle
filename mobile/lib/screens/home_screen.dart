import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../api/agents_service.dart';
import '../config/app_config.dart';
import '../main.dart' show themeController;
import '../state/trip_state.dart';
import '../theme/swarm_colors.dart';
import '../theme/swarm_theme.dart';
import '../widgets/map_style.dart';
import '../widgets/swarm_primitives.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  GoogleMapController? _map;
  final _agents = AgentsService();
  AgentRun? _topRun;
  bool _liveAgents = false;

  static const _initial = CameraPosition(
    target: LatLng(AppConfig.defaultLat, AppConfig.defaultLng),
    zoom: AppConfig.defaultZoom,
  );

  @override
  void initState() {
    super.initState();
    _fetchRecommendation();
    TripState.instance.addListener(_onTripChanged);
  }

  @override
  void dispose() {
    TripState.instance.removeListener(_onTripChanged);
    super.dispose();
  }

  void _onTripChanged() {
    if (!mounted) return;
    setState(() {});
    final route = TripState.instance.route;
    if (route != null && _map != null && route.bounds != null) {
      _map!.animateCamera(
        CameraUpdate.newLatLngBounds(route.bounds!, 60),
      );
    } else {
      final dest = TripState.instance.destination;
      if (dest != null && _map != null) {
        _map!.animateCamera(
          CameraUpdate.newLatLngZoom(dest.location, 11),
        );
      }
    }
  }

  Future<void> _fetchRecommendation() async {
    try {
      final runs = await _agents.recent();
      if (!mounted) return;
      setState(() {
        _topRun = runs.isNotEmpty ? runs.first : null;
        _liveAgents = runs.isNotEmpty;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _liveAgents = false);
    }
  }

  Set<Marker> _buildMarkers() {
    final trip = TripState.instance;
    final markers = <Marker>{};
    if (trip.origin != null) {
      markers.add(Marker(
        markerId: const MarkerId('origin'),
        position: trip.origin!.location,
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
        infoWindow: InfoWindow(title: trip.origin!.title, snippet: 'Départ'),
      ));
    }
    if (trip.destination != null) {
      markers.add(Marker(
        markerId: const MarkerId('destination'),
        position: trip.destination!.location,
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
        infoWindow: InfoWindow(
          title: trip.destination!.title,
          snippet: trip.destination!.subtitle,
        ),
      ));
    }
    return markers;
  }

  Set<Polyline> _buildPolylines(BuildContext context) {
    final route = TripState.instance.route;
    if (route == null) return const {};
    return {
      Polyline(
        polylineId: const PolylineId('route-shadow'),
        points: route.polyline,
        color: Colors.black.withValues(alpha: 0.5),
        width: 10,
      ),
      Polyline(
        polylineId: const PolylineId('route'),
        points: route.polyline,
        color: SwarmColors.swarmBlue2,
        width: 6,
        startCap: Cap.roundCap,
        endCap: Cap.roundCap,
      ),
    };
  }

  @override
  Widget build(BuildContext context) {
    final dark = context.isDark;
    final trip = TripState.instance;
    return Scaffold(
      extendBodyBehindAppBar: true,
      body: Stack(
        children: [
          if (AppConfig.isMapsKeyMissing)
            _MissingKeyPlaceholder()
          else
            GoogleMap(
              initialCameraPosition: _initial,
              style: dark ? MapStyle.dark : MapStyle.light,
              myLocationEnabled: true,
              myLocationButtonEnabled: false,
              zoomControlsEnabled: false,
              compassEnabled: false,
              mapToolbarEnabled: false,
              markers: _buildMarkers(),
              polylines: _buildPolylines(context),
              onMapCreated: (c) => _map = c,
            ),
          // Top search bar
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
              child: Material(
                elevation: 6,
                shadowColor: Colors.black26,
                borderRadius: BorderRadius.circular(28),
                color: context.bgBase,
                child: InkWell(
                  borderRadius: BorderRadius.circular(28),
                  onTap: () => context.push('/search'),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.search, color: context.ink300),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            trip.destination?.title ?? 'Où veux-tu aller ?',
                            style: TextStyle(
                              color: trip.destination != null
                                  ? context.ink100
                                  : context.ink500,
                              fontSize: 15,
                              fontWeight: trip.destination != null
                                  ? FontWeight.w500
                                  : FontWeight.w400,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (trip.destination != null)
                          IconButton(
                            onPressed: () {
                              TripState.instance.clear();
                              setState(() {});
                            },
                            icon: const Icon(Icons.close, size: 18),
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(
                              minWidth: 32,
                              minHeight: 32,
                            ),
                            tooltip: 'Effacer',
                          ),
                        IconButton(
                          onPressed: () => themeController.toggle(),
                          icon: Icon(
                            dark ? Icons.light_mode : Icons.dark_mode,
                            size: 20,
                          ),
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(
                            minWidth: 32,
                            minHeight: 32,
                          ),
                        ),
                        const SizedBox(width: 4),
                        GestureDetector(
                          onTap: () => context.go('/profile'),
                          child: Container(
                            width: 32,
                            height: 32,
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: LinearGradient(
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
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          // Right column: FABs
          Positioned(
            right: 14,
            bottom: trip.hasRoute ? 280 : 240,
            child: Column(
              children: [
                _MapFab(
                  icon: Icons.my_location,
                  onTap: () async {
                    if (_map == null) return;
                    await _map!.animateCamera(
                      CameraUpdate.newCameraPosition(_initial),
                    );
                  },
                ),
                const SizedBox(height: 10),
                _MapFab(
                  icon: Icons.add,
                  onTap: () => _map?.animateCamera(CameraUpdate.zoomIn()),
                ),
                const SizedBox(height: 4),
                _MapFab(
                  icon: Icons.remove,
                  onTap: () => _map?.animateCamera(CameraUpdate.zoomOut()),
                ),
              ],
            ),
          ),
          // Bottom: route info + scenarios, or recommendation if no route
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 8),
                child: trip.hasRoute
                    ? _RouteSummaryCard(trip: trip)
                    : trip.loading
                        ? _LoadingCard()
                        : _RecommendationCard(
                            topRun: _topRun,
                            liveAgents: _liveAgents,
                          ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RouteSummaryCard extends StatelessWidget {
  const _RouteSummaryCard({required this.trip});
  final TripState trip;

  @override
  Widget build(BuildContext context) {
    final route = trip.route!;
    return Material(
      color: context.bgBase,
      elevation: 12,
      shadowColor: Colors.black38,
      borderRadius: BorderRadius.circular(20),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Icon(Icons.place, size: 18, color: context.ink500),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    trip.destination!.title,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: context.ink100,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  route.durationLabel,
                  style: const TextStyle(
                    color: SwarmColors.swarmBlue2,
                    fontSize: 28,
                    fontWeight: FontWeight.w700,
                    height: 1,
                  ),
                ),
                const SizedBox(width: 10),
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(
                    '· ${route.distanceLabel}',
                    style: TextStyle(
                      color: context.ink300,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
            if (route.summary != null) ...[
              const SizedBox(height: 4),
              Text(
                'via ${route.summary}',
                style: TextStyle(color: context.ink500, fontSize: 12.5),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () => context.go('/scenarios'),
                    icon: const Icon(Icons.tune, size: 18),
                    label: const Text('Scénarios'),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () => context.push('/navigation'),
                    icon: const Icon(Icons.navigation, size: 18),
                    label: const Text('Démarrer'),
                    style: FilledButton.styleFrom(
                      backgroundColor: SwarmColors.safeGreen,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _LoadingCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.bgBase,
      elevation: 12,
      borderRadius: BorderRadius.circular(20),
      child: const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(child: CircularProgressIndicator()),
      ),
    );
  }
}

class _RecommendationCard extends StatelessWidget {
  const _RecommendationCard({required this.topRun, required this.liveAgents});

  final AgentRun? topRun;
  final bool liveAgents;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.bgBase,
      elevation: 12,
      shadowColor: Colors.black38,
      borderRadius: BorderRadius.circular(20),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const SwarmMark(size: 22),
                const SizedBox(width: 8),
                Text(
                  'SWARM · CASABLANCA',
                  style: SwarmTheme.mono(
                    size: 10.5,
                    color: context.ink500,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(width: 6),
                if (liveAgents)
                  const SwarmChip(
                    label: 'LIVE',
                    tone: SwarmChipTone.green,
                  ),
                const Spacer(),
                const PulseDot(size: 6),
                const SizedBox(width: 6),
                Text(
                  liveAgents ? 'agents live' : 'offline',
                  style: TextStyle(fontSize: 11, color: context.ink300),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              topRun?.message ??
                  topRun?.title ??
                  'Cherche une destination pour démarrer.',
              style: TextStyle(
                color: context.ink100,
                fontSize: 14.5,
                fontWeight: FontWeight.w500,
                height: 1.3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MapFab extends StatelessWidget {
  const _MapFab({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.bgBase,
      elevation: 4,
      shadowColor: Colors.black26,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(icon, color: context.ink100, size: 22),
        ),
      ),
    );
  }
}

class _MissingKeyPlaceholder extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      color: context.bgDeep,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.key_off, size: 56, color: context.ink500),
              const SizedBox(height: 16),
              Text(
                'Google Maps API key manquante',
                style: TextStyle(
                  color: context.ink100,
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
