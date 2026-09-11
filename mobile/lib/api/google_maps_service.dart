import 'dart:convert';
import 'dart:math' as math;

import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:http/http.dart' as http;

import '../config/app_config.dart';

class PlaceResult {
  final String title;
  final String subtitle;
  final LatLng location;
  final String? placeId;

  const PlaceResult({
    required this.title,
    required this.subtitle,
    required this.location,
    this.placeId,
  });
}

class RouteResult {
  final List<LatLng> polyline;
  final int distanceMeters;
  final int durationSeconds;
  final String? summary;
  final List<RouteStep> steps;
  final LatLngBounds? bounds;

  const RouteResult({
    required this.polyline,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.steps,
    this.summary,
    this.bounds,
  });

  String get distanceLabel {
    if (distanceMeters >= 1000) {
      final km = distanceMeters / 1000;
      return '${km.toStringAsFixed(km < 10 ? 1 : 0)} km';
    }
    return '$distanceMeters m';
  }

  String get durationLabel {
    final m = (durationSeconds / 60).round();
    if (m < 60) return '$m min';
    final h = m ~/ 60;
    final rest = m % 60;
    return rest == 0 ? '${h}h' : '${h}h$rest';
  }
}

class RouteStep {
  final String instruction;
  final String? maneuver;
  final int distanceMeters;
  final int durationSeconds;
  final LatLng start;
  final LatLng end;

  const RouteStep({
    required this.instruction,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.start,
    required this.end,
    this.maneuver,
  });
}

enum TravelMode { driving, walking, bicycling, transit }

class GoogleMapsService {
  static const _geocodeUrl = 'https://maps.googleapis.com/maps/api/geocode/json';
  static const _directionsUrl =
      'https://maps.googleapis.com/maps/api/directions/json';

  bool get hasKey => !AppConfig.isMapsKeyMissing;

  /// Forward geocoding — query free text → list of matches.
  /// Falls back to a local Moroccan-city list when offline / no key.
  Future<List<PlaceResult>> geocode(String query) async {
    final q = query.trim();
    if (q.isEmpty) return [];

    if (hasKey) {
      try {
        final uri = Uri.parse(_geocodeUrl).replace(queryParameters: {
          'address': q,
          'key': AppConfig.googleMapsApiKey,
          'language': 'fr',
          'region': 'ma',
        });
        final res = await http.get(uri).timeout(const Duration(seconds: 8));
        if (res.statusCode == 200) {
          final body = jsonDecode(res.body) as Map<String, dynamic>;
          if (body['status'] == 'OK') {
            final results = (body['results'] as List?) ?? [];
            return results.map((r) {
              final m = r as Map<String, dynamic>;
              final loc = (m['geometry']?['location']) as Map<String, dynamic>;
              final formatted = m['formatted_address']?.toString() ?? q;
              final parts = formatted.split(',');
              return PlaceResult(
                title: parts.first.trim(),
                subtitle: parts.length > 1
                    ? parts.sublist(1).join(',').trim()
                    : '',
                location: LatLng(
                  (loc['lat'] as num).toDouble(),
                  (loc['lng'] as num).toDouble(),
                ),
                placeId: m['place_id'] as String?,
              );
            }).toList();
          }
        }
      } catch (_) {
        // fall through to local
      }
    }

    return _localFallback(q);
  }

  /// Directions API → polyline + steps + ETA.
  ///
  /// On web, the classic Directions Web Service does not allow CORS, so the
  /// HTTP call will fail. In that case we fall back to a straight-line
  /// polyline + haversine distance + a 60 km/h driving estimate, so the UI
  /// still shows a usable route and ETA.
  Future<RouteResult?> directions({
    required LatLng origin,
    required LatLng destination,
    TravelMode mode = TravelMode.driving,
    bool alternatives = false,
  }) async {
    if (!hasKey) return _straightLineFallback(origin, destination, mode);
    try {
      final result = await _httpDirections(origin, destination, mode, alternatives);
      if (result != null) return result;
    } catch (_) {
      // CORS or network — fall through to fallback.
    }
    return _straightLineFallback(origin, destination, mode);
  }

  Future<RouteResult?> _httpDirections(
    LatLng origin,
    LatLng destination,
    TravelMode mode,
    bool alternatives,
  ) async {
    final uri = Uri.parse(_directionsUrl).replace(queryParameters: {
      'origin': '${origin.latitude},${origin.longitude}',
      'destination': '${destination.latitude},${destination.longitude}',
      'mode': mode.name,
      'alternatives': alternatives ? 'true' : 'false',
      'language': 'fr',
      'region': 'ma',
      'key': AppConfig.googleMapsApiKey,
    });
    final res = await http.get(uri).timeout(const Duration(seconds: 10));
    if (res.statusCode != 200) return null;
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (body['status'] != 'OK') return null;
    final routes = body['routes'] as List?;
    if (routes == null || routes.isEmpty) return null;
    final route = routes.first as Map<String, dynamic>;
    final overview = route['overview_polyline']?['points'] as String?;
    final legs = (route['legs'] as List?) ?? [];
    if (legs.isEmpty || overview == null) return null;
    final leg = legs.first as Map<String, dynamic>;
    final distance = (leg['distance']?['value'] as num?)?.toInt() ?? 0;
    final duration = (leg['duration']?['value'] as num?)?.toInt() ?? 0;
    final stepsRaw = (leg['steps'] as List?) ?? [];
    final steps = stepsRaw.map((s) {
      final m = s as Map<String, dynamic>;
      final start = m['start_location'] as Map<String, dynamic>;
      final end = m['end_location'] as Map<String, dynamic>;
      return RouteStep(
        instruction: _stripHtml(m['html_instructions']?.toString() ?? ''),
        maneuver: m['maneuver'] as String?,
        distanceMeters: (m['distance']?['value'] as num?)?.toInt() ?? 0,
        durationSeconds: (m['duration']?['value'] as num?)?.toInt() ?? 0,
        start: LatLng(
          (start['lat'] as num).toDouble(),
          (start['lng'] as num).toDouble(),
        ),
        end: LatLng(
          (end['lat'] as num).toDouble(),
          (end['lng'] as num).toDouble(),
        ),
      );
    }).toList();

    LatLngBounds? bounds;
    final bb = route['bounds'] as Map<String, dynamic>?;
    if (bb != null) {
      final ne = bb['northeast'] as Map<String, dynamic>;
      final sw = bb['southwest'] as Map<String, dynamic>;
      bounds = LatLngBounds(
        southwest: LatLng(
          (sw['lat'] as num).toDouble(),
          (sw['lng'] as num).toDouble(),
        ),
        northeast: LatLng(
          (ne['lat'] as num).toDouble(),
          (ne['lng'] as num).toDouble(),
        ),
      );
    }

    return RouteResult(
      polyline: decodePolyline(overview),
      distanceMeters: distance,
      durationSeconds: duration,
      summary: route['summary'] as String?,
      steps: steps,
      bounds: bounds,
    );
  }

  /// Build a usable route from a straight line between two points.
  /// Used when the Directions Web Service is unreachable (CORS on web).
  RouteResult _straightLineFallback(
    LatLng origin,
    LatLng destination,
    TravelMode mode,
  ) {
    final km = GeoMath.kmBetween(origin, destination);
    final meters = (km * 1000).round();

    // Average speed assumption per mode (km/h).
    final speedKmh = switch (mode) {
      TravelMode.driving => 60.0,
      TravelMode.bicycling => 16.0,
      TravelMode.walking => 5.0,
      TravelMode.transit => 30.0,
    };
    final seconds = ((km / speedKmh) * 3600).round();

    // Add a few interpolated waypoints so the polyline isn't a bare segment.
    final points = <LatLng>[origin];
    const samples = 24;
    for (var i = 1; i < samples; i++) {
      final t = i / samples;
      points.add(LatLng(
        origin.latitude + (destination.latitude - origin.latitude) * t,
        origin.longitude + (destination.longitude - origin.longitude) * t,
      ));
    }
    points.add(destination);

    final bounds = LatLngBounds(
      southwest: LatLng(
        math.min(origin.latitude, destination.latitude),
        math.min(origin.longitude, destination.longitude),
      ),
      northeast: LatLng(
        math.max(origin.latitude, destination.latitude),
        math.max(origin.longitude, destination.longitude),
      ),
    );

    final midLat = (origin.latitude + destination.latitude) / 2;
    final midLng = (origin.longitude + destination.longitude) / 2;
    final mid = LatLng(midLat, midLng);

    return RouteResult(
      polyline: points,
      distanceMeters: meters,
      durationSeconds: seconds,
      summary: 'estimé (ligne directe)',
      bounds: bounds,
      steps: [
        RouteStep(
          instruction: 'Continuer vers la destination',
          distanceMeters: meters ~/ 2,
          durationSeconds: seconds ~/ 2,
          start: origin,
          end: mid,
          maneuver: 'straight',
        ),
        RouteStep(
          instruction: 'Arrivée',
          distanceMeters: meters - (meters ~/ 2),
          durationSeconds: seconds - (seconds ~/ 2),
          start: mid,
          end: destination,
          maneuver: null,
        ),
      ],
    );
  }

  /// Decode Google's polyline encoding format.
  static List<LatLng> decodePolyline(String encoded) {
    final list = <LatLng>[];
    int index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
      int b, shift = 0, result = 0;
      do {
        b = encoded.codeUnitAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lat += (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
      shift = 0;
      result = 0;
      do {
        b = encoded.codeUnitAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lng += (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
      list.add(LatLng(lat / 1e5, lng / 1e5));
    }
    return list;
  }

  String _stripHtml(String s) {
    return s
        .replaceAll(RegExp(r'<[^>]+>'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  static const _moroccanCities = <PlaceResult>[
    PlaceResult(
      title: 'Rabat',
      subtitle: 'Rabat-Salé-Kénitra, Maroc',
      location: LatLng(34.0209, -6.8416),
    ),
    PlaceResult(
      title: 'Casablanca',
      subtitle: 'Casablanca-Settat, Maroc',
      location: LatLng(33.5731, -7.5898),
    ),
    PlaceResult(
      title: 'Marrakech',
      subtitle: 'Marrakech-Safi, Maroc',
      location: LatLng(31.6295, -7.9811),
    ),
    PlaceResult(
      title: 'Tanger',
      subtitle: 'Tanger-Tétouan-Al Hoceïma, Maroc',
      location: LatLng(35.7595, -5.8340),
    ),
    PlaceResult(
      title: 'Fès',
      subtitle: 'Fès-Meknès, Maroc',
      location: LatLng(34.0181, -5.0078),
    ),
    PlaceResult(
      title: 'Agadir',
      subtitle: 'Souss-Massa, Maroc',
      location: LatLng(30.4278, -9.5981),
    ),
    PlaceResult(
      title: 'Aéroport Mohammed V',
      subtitle: 'Nouaceur, Casablanca',
      location: LatLng(33.3675, -7.5898),
    ),
    PlaceResult(
      title: 'Casa Voyageurs',
      subtitle: 'Gare ferroviaire, Casablanca',
      location: LatLng(33.5965, -7.5546),
    ),
    PlaceResult(
      title: 'Morocco Mall',
      subtitle: 'Aïn Diab, Casablanca',
      location: LatLng(33.5953, -7.6815),
    ),
    PlaceResult(
      title: 'Mosquée Hassan II',
      subtitle: 'Boulevard de la Corniche, Casablanca',
      location: LatLng(33.6082, -7.6326),
    ),
  ];

  List<PlaceResult> _localFallback(String query) {
    final q = query.toLowerCase();
    return _moroccanCities
        .where(
          (p) =>
              p.title.toLowerCase().contains(q) ||
              p.subtitle.toLowerCase().contains(q),
        )
        .toList();
  }
}

class GeoMath {
  /// Crude great-circle distance in km, good enough for trip headers.
  static double kmBetween(LatLng a, LatLng b) {
    const r = 6371.0;
    final dLat = _toRad(b.latitude - a.latitude);
    final dLng = _toRad(b.longitude - a.longitude);
    final lat1 = _toRad(a.latitude);
    final lat2 = _toRad(b.latitude);
    final h = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1) * math.cos(lat2) *
            math.sin(dLng / 2) * math.sin(dLng / 2);
    final c = 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h));
    return r * c;
  }

  static double _toRad(double deg) => deg * math.pi / 180.0;
}
