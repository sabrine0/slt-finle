import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';

class PlaceSuggestion {
  final String title;
  final String subtitle;
  final double? lat;
  final double? lng;

  const PlaceSuggestion({
    required this.title,
    required this.subtitle,
    this.lat,
    this.lng,
  });
}

/// Place autocomplete — tries Google Places API first, then falls back
/// to a local Casablanca-flavored mock list so the UI keeps working even
/// without a key or network.
class PlacesService {
  static const _placesUrl =
      'https://maps.googleapis.com/maps/api/place/autocomplete/json';

  Future<List<PlaceSuggestion>> autocomplete(String query) async {
    if (query.trim().isEmpty) return [];

    if (!AppConfig.isMapsKeyMissing) {
      try {
        final uri = Uri.parse(_placesUrl).replace(queryParameters: {
          'input': query,
          'key': AppConfig.googleMapsApiKey,
          'language': 'fr',
          'components': 'country:ma',
        });
        final res = await http.get(uri).timeout(const Duration(seconds: 4));
        if (res.statusCode == 200) {
          final body = jsonDecode(res.body) as Map<String, dynamic>;
          final preds = (body['predictions'] as List?) ?? [];
          if (preds.isNotEmpty) {
            return preds.map((p) {
              final m = p as Map<String, dynamic>;
              final struct = m['structured_formatting'] as Map<String, dynamic>?;
              return PlaceSuggestion(
                title: struct?['main_text'] as String? ??
                    m['description'] as String? ??
                    '',
                subtitle: struct?['secondary_text'] as String? ?? '',
              );
            }).toList();
          }
        }
      } catch (_) {
        // fall through to mock
      }
    }

    return _mockSearch(query);
  }

  static const _mockPlaces = <PlaceSuggestion>[
    PlaceSuggestion(
      title: 'Aéroport Mohammed V',
      subtitle: 'Nouaceur, Casablanca',
    ),
    PlaceSuggestion(
      title: 'Casa Voyageurs',
      subtitle: 'Gare ferroviaire, Casablanca',
    ),
    PlaceSuggestion(title: 'Morocco Mall', subtitle: 'Aïn Diab, Casablanca'),
    PlaceSuggestion(title: 'Anfa Place', subtitle: 'Boulevard de la Corniche'),
    PlaceSuggestion(title: 'Twin Center', subtitle: 'Maârif, Casablanca'),
    PlaceSuggestion(
      title: 'Mosquée Hassan II',
      subtitle: 'Boulevard de la Corniche',
    ),
    PlaceSuggestion(title: 'CHU Ibn Rochd', subtitle: 'Hay Hassani'),
    PlaceSuggestion(title: 'Marina Casablanca', subtitle: 'Sidi Belyout'),
  ];

  List<PlaceSuggestion> _mockSearch(String query) {
    final q = query.toLowerCase();
    return _mockPlaces
        .where(
          (p) =>
              p.title.toLowerCase().contains(q) ||
              p.subtitle.toLowerCase().contains(q),
        )
        .toList();
  }
}
