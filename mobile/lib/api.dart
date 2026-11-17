import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Server origin, e.g. https://api.example.com. Set once from the admin Settings screen.
class Config {
  static String baseUrl = const String.fromEnvironment('API_URL');
  static late SharedPreferences _p;

  static Future<void> load() async {
    _p = await SharedPreferences.getInstance();
    baseUrl = _p.getString('baseUrl') ?? baseUrl;
  }

  static Future<void> setBaseUrl(String v) async {
    baseUrl = v.trim().replaceAll(RegExp(r'/+$'), '');
    await _p.setString('baseUrl', baseUrl);
  }

  static String get api => '$baseUrl/api/v1';
}

class ApiError implements Exception {
  ApiError(this.status, this.code, this.message, [this.body = const {}]);
  final int status;
  final String code;
  final String message;
  final Map<String, dynamic> body;
  @override
  String toString() => message;
}

const _generic = 'Something went wrong. Please check the internet connection and try again.';

Future<dynamic> _send(Future<http.Response> Function() call) async {
  http.Response res;
  try {
    res = await call().timeout(const Duration(seconds: 30));
  } on Exception {
    throw ApiError(0, 'NETWORK', _generic);
  }
  if (res.statusCode == 204) return null;
  final data = res.body.isEmpty ? <String, dynamic>{} : jsonDecode(res.body);
  if (res.statusCode >= 400) {
    final m = data is Map<String, dynamic> ? data : <String, dynamic>{};
    throw ApiError(res.statusCode, '${m['error'] ?? 'ERROR'}', '${m['message'] ?? 'Request failed'}', m);
  }
  return data;
}

final _device = jsonEncode({
  'platform': Platform.operatingSystem,
  'language': Platform.localeName,
  'timezone': DateTime.now().timeZoneName,
});

/// Public signing API, one instance per customer session.
class SignApi {
  SignApi(this.token);
  final String token;
  String? session;

  Uri _u(String path) => Uri.parse('${Config.api}/sign/${Uri.encodeComponent(token)}$path');

  Future<dynamic> call(String path, {bool post = false, Object? body, bool auth = false}) {
    final h = {
      'x-device-info': _device,
      if (body != null) 'content-type': 'application/json',
      if (auth && session != null) 'authorization': 'Bearer $session',
    };
    return _send(() => post
        ? http.post(_u(path), headers: h, body: body == null ? null : jsonEncode(body))
        : http.get(_u(path), headers: h));
  }
}

/// Staff API. The server uses cookie + CSRF-header auth, so keep the cookies by hand.
class StaffApi {
  StaffApi._();
  static final i = StaffApi._();
  final _jar = <String, String>{};

  bool get signedIn => _jar.containsKey('csrf');

  void _store(http.Response r) {
    final raw = r.headers['set-cookie'];
    if (raw == null) return;
    for (final c in raw.split(RegExp(r',(?=\s*[^;,\s]+=)'))) {
      final kv = c.split(';').first.trim().split('=');
      if (kv.length < 2) continue;
      final v = kv.sublist(1).join('=');
      v.isEmpty ? _jar.remove(kv[0]) : _jar[kv[0]] = v;
    }
  }

  Future<dynamic> call(String method, String path, {Object? body}) {
    final h = {
      if (body != null) 'content-type': 'application/json',
      if (_jar.isNotEmpty) 'cookie': _jar.entries.map((e) => '${e.key}=${e.value}').join('; '),
      if (method != 'GET' && _jar['csrf'] != null) 'x-csrf-token': Uri.decodeComponent(_jar['csrf']!),
    };
    final req = http.Request(method, Uri.parse('${Config.api}$path'))..headers.addAll(h);
    if (body != null) req.body = jsonEncode(body);
    return _send(() async {
      final r = await http.Response.fromStream(await req.send());
      _store(r);
      return r;
    });
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    _jar.clear();
    return await call('POST', '/auth/login', body: {'email': email, 'password': password})
        as Map<String, dynamic>;
  }

  Future<void> logout() async {
    try {
      await call('POST', '/auth/logout');
    } finally {
      _jar.clear();
    }
  }
}
