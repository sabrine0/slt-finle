import 'dart:convert';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/http.dart' as http;

import '../config/app_config.dart';

class ApiException implements Exception {
  final int? status;
  final String message;
  final dynamic body;
  ApiException(this.message, {this.status, this.body});

  @override
  String toString() => 'ApiException($status): $message';
}

/// Thin HTTP client wrapping http.Client with:
/// - JSON encoding/decoding
/// - Auth bearer header
/// - Common error handling
class ApiClient {
  ApiClient({http.Client? client, String? Function()? tokenProvider})
      : _client = client ?? http.Client(),
        _tokenProvider = tokenProvider ?? (() => null);

  final http.Client _client;
  final String? Function() _tokenProvider;

  static final ApiClient instance = ApiClient();
  static String? Function() globalTokenProvider = () => null;

  String get baseUrl {
    final isAndroid = !kIsWeb && Platform.isAndroid;
    return AppConfig.apiBaseUrl(isAndroid: isAndroid);
  }

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final base = Uri.parse(baseUrl);
    return base.replace(
      path: path.startsWith('/') ? path : '/$path',
      queryParameters: query?.map((k, v) => MapEntry(k, '$v')),
    );
  }

  Map<String, String> _headers({bool jsonBody = false}) {
    final token = _tokenProvider() ?? globalTokenProvider();
    return {
      'Accept': 'application/json',
      if (jsonBody) 'Content-Type': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    final res = await _client
        .get(_uri(path, query), headers: _headers())
        .timeout(const Duration(seconds: 12));
    return _decode(res);
  }

  Future<dynamic> post(String path, {Object? body}) async {
    final res = await _client
        .post(
          _uri(path),
          headers: _headers(jsonBody: true),
          body: body == null ? null : jsonEncode(body),
        )
        .timeout(const Duration(seconds: 15));
    return _decode(res);
  }

  Future<dynamic> patch(String path, {Object? body}) async {
    final res = await _client
        .patch(
          _uri(path),
          headers: _headers(jsonBody: true),
          body: body == null ? null : jsonEncode(body),
        )
        .timeout(const Duration(seconds: 15));
    return _decode(res);
  }

  dynamic _decode(http.Response res) {
    final ok = res.statusCode >= 200 && res.statusCode < 300;
    dynamic body;
    if (res.body.isNotEmpty) {
      try {
        body = jsonDecode(res.body);
      } catch (_) {
        body = res.body;
      }
    }
    if (!ok) {
      final msg = body is Map && body['message'] != null
          ? body['message'].toString()
          : 'HTTP ${res.statusCode}';
      throw ApiException(msg, status: res.statusCode, body: body);
    }
    return body;
  }
}
