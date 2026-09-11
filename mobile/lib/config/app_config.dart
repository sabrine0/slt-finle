/// App configuration — fill in your secrets here.
///
/// For production, prefer environment variables via --dart-define :
///   flutter run --dart-define=GOOGLE_MAPS_API_KEY=AIza...
class AppConfig {
  AppConfig._();

  /// Google Maps API key. Required to display the map.
  ///
  /// Get it from: https://console.cloud.google.com/apis/credentials
  /// Make sure these APIs are enabled in your project:
  ///   - Maps SDK for Android
  ///   - Maps SDK for iOS (if you ship iOS)
  ///   - Places API (for autocomplete search)
  ///
  /// Restrict the key to your Android app SHA-1 + package name in production.
  static const googleMapsApiKey = String.fromEnvironment(
    'GOOGLE_MAPS_API_KEY',
    defaultValue: 'PASTE_YOUR_GOOGLE_MAPS_API_KEY_HERE',
  );

  /// True when the placeholder hasn't been replaced yet.
  static bool get isMapsKeyMissing =>
      googleMapsApiKey == 'PASTE_YOUR_GOOGLE_MAPS_API_KEY_HERE' ||
      googleMapsApiKey.isEmpty;

  /// Default city the map opens on.
  static const defaultLat = 33.5731;
  static const defaultLng = -7.5898;
  static const defaultZoom = 12.0;

  /// STLS backend base URL. Configurable via --dart-define=API_BASE_URL=...
  ///
  /// Defaults:
  /// - Android emulator: 10.0.2.2:4010 (host loopback alias)
  /// - Web / desktop / iOS sim: localhost:4010
  ///
  /// Platform-specific default is picked in [apiBaseUrl] below.
  static const _apiBaseUrlOverride = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  static String apiBaseUrl({required bool isAndroid}) {
    if (_apiBaseUrlOverride.isNotEmpty) return _apiBaseUrlOverride;
    return isAndroid ? 'http://10.0.2.2:4010' : 'http://localhost:4010';
  }
}

