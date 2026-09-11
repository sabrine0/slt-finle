import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' show LatLng;

import '../api/google_maps_service.dart';
import '../state/trip_state.dart';
import '../theme/swarm_colors.dart';
import '../theme/swarm_theme.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _ctrl = TextEditingController();
  final _focus = FocusNode();
  final _service = GoogleMapsService();
  Timer? _debounce;
  List<PlaceResult> _results = [];
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance
        .addPostFrameCallback((_) => _focus.requestFocus());
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onChanged(String q) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(q));
    setState(() {});
  }

  Future<void> _search(String q) async {
    if (q.trim().length < 2) {
      setState(() => _results = []);
      return;
    }
    setState(() => _loading = true);
    final res = await _service.geocode(q);
    if (!mounted) return;
    setState(() {
      _results = res;
      _loading = false;
    });
  }

  Future<void> _pick(PlaceResult p) async {
    await TripState.instance.setDestination(p);
    if (!mounted) return;
    context.go('/home');
  }

  @override
  Widget build(BuildContext context) {
    final recents = const <PlaceResult>[
      PlaceResult(
        title: 'Rabat',
        subtitle: 'Capitale, Maroc',
        location: LatLng(34.0209, -6.8416),
      ),
      PlaceResult(
        title: 'Aéroport Mohammed V',
        subtitle: 'Nouaceur',
        location: LatLng(33.3675, -7.5898),
      ),
      PlaceResult(
        title: 'Marrakech',
        subtitle: 'Marrakech-Safi',
        location: LatLng(31.6295, -7.9811),
      ),
    ];
    return Scaffold(
      backgroundColor: context.bgDeep,
      appBar: AppBar(
        backgroundColor: context.bgBase,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        title: TextField(
          controller: _ctrl,
          focusNode: _focus,
          onChanged: _onChanged,
          onSubmitted: _search,
          decoration: InputDecoration(
            hintText: 'Rechercher une destination',
            hintStyle: TextStyle(color: context.ink500),
            border: InputBorder.none,
          ),
          style: TextStyle(color: context.ink100, fontSize: 16),
        ),
        actions: [
          if (_ctrl.text.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.close),
              onPressed: () {
                _ctrl.clear();
                _search('');
              },
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _ctrl.text.isEmpty
              ? _RecentsList(items: recents, onTap: _pick)
              : _results.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                          'Aucun résultat pour « ${_ctrl.text} »',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: context.ink500),
                        ),
                      ),
                    )
                  : ListView.separated(
                      itemCount: _results.length,
                      separatorBuilder: (_, __) => Divider(
                        height: 1,
                        color: context.hairline,
                      ),
                      itemBuilder: (context, i) {
                        final p = _results[i];
                        return ListTile(
                          leading: const Icon(
                            Icons.place_outlined,
                            color: SwarmColors.swarmBlue2,
                          ),
                          title: Text(
                            p.title,
                            style: TextStyle(color: context.ink100),
                          ),
                          subtitle: Text(
                            p.subtitle,
                            style: TextStyle(
                              color: context.ink500,
                              fontSize: 12,
                            ),
                          ),
                          trailing: const Icon(Icons.north_west, size: 18),
                          onTap: () => _pick(p),
                        );
                      },
                    ),
    );
  }
}

class _RecentsList extends StatelessWidget {
  const _RecentsList({required this.items, required this.onTap});

  final List<PlaceResult> items;
  final ValueChanged<PlaceResult> onTap;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 8),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
          child: Text(
            'Suggestions',
            style: SwarmTheme.mono(
              size: 11,
              color: context.ink500,
              letterSpacing: 0.6,
            ),
          ),
        ),
        for (final r in items)
          ListTile(
            leading: Icon(Icons.history, color: context.ink500),
            title: Text(
              r.title,
              style: TextStyle(color: context.ink100, fontSize: 14.5),
            ),
            subtitle: Text(
              r.subtitle,
              style: TextStyle(color: context.ink500, fontSize: 12),
            ),
            onTap: () => onTap(r),
          ),
      ],
    );
  }
}
