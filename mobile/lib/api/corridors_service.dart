import 'api_client.dart';

class Corridor {
  final String id;
  final String name;
  final String? description;
  final String? status;
  final Map<String, dynamic> raw;

  Corridor({
    required this.id,
    required this.name,
    this.description,
    this.status,
    required this.raw,
  });

  factory Corridor.fromJson(Map<String, dynamic> j) {
    return Corridor(
      id: (j['id'] ?? j['_id'] ?? '').toString(),
      name: (j['name'] ?? j['label'] ?? 'Corridor sans nom').toString(),
      description: j['description'] as String? ?? j['summary'] as String?,
      status: j['status'] as String?,
      raw: j,
    );
  }
}

class CorridorsService {
  Future<List<Corridor>> list() async {
    final res = await ApiClient.instance.get('/corridors');
    if (res is! List) return [];
    return res
        .whereType<Map<String, dynamic>>()
        .map(Corridor.fromJson)
        .toList();
  }
}
