import 'package:flutter/foundation.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../api/google_maps_service.dart';
import '../config/app_config.dart';

class TripState extends ChangeNotifier {
  TripState._();
  static final instance = TripState._();

  final _maps = GoogleMapsService();

  PlaceResult? _origin;
  PlaceResult? _destination;
  RouteResult? _route;
  bool _loading = false;
  String? _error;

  PlaceResult? get origin => _origin;
  PlaceResult? get destination => _destination;
  RouteResult? get route => _route;
  bool get loading => _loading;
  String? get error => _error;
  bool get hasRoute => _route != null;

  /// Origin defaults to Casablanca center if user hasn't set one yet.
  LatLng get originLatLng =>
      _origin?.location ?? const LatLng(AppConfig.defaultLat, AppConfig.defaultLng);

  Future<void> setDestination(PlaceResult dest) async {
    _destination = dest;
    _origin ??= const PlaceResult(
      title: 'Ma position',
      subtitle: 'Casablanca',
      location: LatLng(AppConfig.defaultLat, AppConfig.defaultLng),
    );
    notifyListeners();
    await _recomputeRoute();
  }

  Future<void> setOrigin(PlaceResult origin) async {
    _origin = origin;
    notifyListeners();
    if (_destination != null) await _recomputeRoute();
  }

  void clear() {
    _origin = null;
    _destination = null;
    _route = null;
    _error = null;
    notifyListeners();
  }

  Future<void> _recomputeRoute({TravelMode mode = TravelMode.driving}) async {
    if (_origin == null || _destination == null) return;
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final r = await _maps.directions(
        origin: _origin!.location,
        destination: _destination!.location,
        mode: mode,
      );
      _route = r;
      if (r == null) _error = 'Aucun itinéraire trouvé';
    } catch (e) {
      _route = null;
      _error = 'Directions API : $e';
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> changeMode(TravelMode mode) async {
    await _recomputeRoute(mode: mode);
  }
}
