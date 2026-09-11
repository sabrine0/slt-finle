import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_client.dart';

class AuthSession {
  final String accessToken;
  final String? refreshToken;
  final Map<String, dynamic>? user;

  const AuthSession({
    required this.accessToken,
    this.refreshToken,
    this.user,
  });

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        if (refreshToken != null) 'refreshToken': refreshToken,
        if (user != null) 'user': user,
      };
}

/// Persists JWT tokens in secure storage and exposes a current-session
/// listenable so screens can react to login/logout.
class AuthService extends ChangeNotifier {
  AuthService._();
  static final instance = AuthService._();

  static const _kAccess = 'swarm.auth.access';
  static const _kRefresh = 'swarm.auth.refresh';

  final _secure = const FlutterSecureStorage();
  AuthSession? _session;
  Map<String, dynamic>? _profile;

  AuthSession? get session => _session;
  Map<String, dynamic>? get profile => _profile;
  bool get isAuthenticated => _session != null;
  String? token() => _session?.accessToken;

  Future<void> bootstrap() async {
    final access = await _secure.read(key: _kAccess);
    final refresh = await _secure.read(key: _kRefresh);
    if (access != null && access.isNotEmpty) {
      _session = AuthSession(accessToken: access, refreshToken: refresh);
      // Wire the global token provider so ApiClient picks it up.
      ApiClient.globalTokenProvider = token;
      // Pull profile in background; don't block boot.
      unawaited(refreshProfile());
    }
  }

  Future<void> login(String email, String password) async {
    final res = await ApiClient.instance.post(
      '/auth/login',
      body: {'email': email, 'password': password},
    );
    if (res is! Map) {
      throw ApiException('Réponse de login inattendue', body: res);
    }
    final access = res['accessToken'] as String?;
    final refresh = res['refreshToken'] as String?;
    if (access == null) {
      throw ApiException('Token manquant dans la réponse', body: res);
    }
    _session = AuthSession(accessToken: access, refreshToken: refresh);
    ApiClient.globalTokenProvider = token;
    await _secure.write(key: _kAccess, value: access);
    if (refresh != null) {
      await _secure.write(key: _kRefresh, value: refresh);
    }
    notifyListeners();
    await refreshProfile();
  }

  Future<void> refreshProfile() async {
    if (_session == null) return;
    try {
      final res = await ApiClient.instance.get('/auth/profile');
      if (res is Map) {
        _profile = Map<String, dynamic>.from(res);
        notifyListeners();
      }
    } catch (e) {
      // Don't crash if profile is unavailable — keep token until we hit a 401.
      if (e is ApiException && e.status == 401) {
        await logout();
      }
    }
  }

  Future<void> logout() async {
    final refresh = _session?.refreshToken;
    _session = null;
    _profile = null;
    ApiClient.globalTokenProvider = () => null;
    await _secure.delete(key: _kAccess);
    await _secure.delete(key: _kRefresh);
    notifyListeners();
    if (refresh != null) {
      try {
        await ApiClient.instance.post('/auth/logout', body: {
          'refreshToken': refresh,
        });
      } catch (_) {/* best effort */}
    }
  }
}

// Fire-and-forget without lints complaining.
void unawaited(Future<void> _) {}
