import 'api_client.dart';

class AgentRun {
  final String id;
  final String? severity;
  final String? title;
  final String? message;
  final DateTime? at;
  final Map<String, dynamic> raw;

  AgentRun({
    required this.id,
    this.severity,
    this.title,
    this.message,
    this.at,
    required this.raw,
  });

  factory AgentRun.fromJson(Map<String, dynamic> j) {
    DateTime? at;
    final atRaw = j['createdAt'] ?? j['at'] ?? j['runAt'];
    if (atRaw is String) at = DateTime.tryParse(atRaw);

    return AgentRun(
      id: (j['id'] ?? j['_id'] ?? '').toString(),
      severity: j['severity'] as String?,
      title: (j['title'] ?? j['name']) as String?,
      message: (j['message'] ?? j['summary'] ?? j['result']?.toString())
          as String?,
      at: at,
      raw: j,
    );
  }
}

class AgentsService {
  Future<List<AgentRun>> recent({String? severity, String? scope}) async {
    final query = <String, dynamic>{};
    if (severity != null) query['severity'] = severity;
    if (scope != null) query['scope'] = scope;
    final res = await ApiClient.instance.get(
      '/agents/runs/recent',
      query: query.isEmpty ? null : query,
    );
    if (res is! List) return [];
    return res
        .whereType<Map<String, dynamic>>()
        .map(AgentRun.fromJson)
        .toList();
  }
}
