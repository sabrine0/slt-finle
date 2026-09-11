import 'package:flutter/material.dart';

import '../api/agents_service.dart';
import '../state/trip_state.dart';
import '../theme/swarm_colors.dart';
import '../theme/swarm_theme.dart';
import '../widgets/swarm_background.dart';
import '../widgets/swarm_primitives.dart';

class CopilotScreen extends StatefulWidget {
  const CopilotScreen({super.key});

  @override
  State<CopilotScreen> createState() => _CopilotScreenState();
}

class _Msg {
  final bool fromAi;
  final String text;
  final DateTime? at;
  const _Msg(this.fromAi, this.text, {this.at});
}

class _CopilotScreenState extends State<CopilotScreen> {
  final _input = TextEditingController();
  final _agents = AgentsService();
  final List<_Msg> _msgs = [];
  bool _loading = false;
  bool _backendOk = false;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    setState(() => _loading = true);
    final intro = _intro();
    _msgs.add(_Msg(true, intro));
    try {
      final runs = await _agents.recent();
      if (!mounted) return;
      _backendOk = true;
      if (runs.isEmpty) {
        _msgs.add(const _Msg(
          true,
          "Aucune alerte trafic en cours. Le réseau est calme.",
        ));
      } else {
        _msgs.add(_Msg(
          true,
          "${runs.length} agents actifs sur le territoire. Dernier événement :",
        ));
        final first = runs.first;
        _msgs.add(_Msg(
          true,
          first.message ?? first.title ?? 'Agent ${first.id}',
          at: first.at,
        ));
      }
    } catch (_) {
      _backendOk = false;
      _msgs.add(const _Msg(
        true,
        "Backend STLS indisponible. Je continue avec mes propres recommandations.",
      ));
    }
    if (mounted) setState(() => _loading = false);
  }

  String _intro() {
    final dest = TripState.instance.destination;
    final user = 'Yasmine';
    if (dest != null) {
      return "Salut $user. Je vois que tu vas vers ${dest.title}. Tu veux que je vérifie le trafic ?";
    }
    return "Salut $user. Pas de destination active. Tu veux que je t'oriente quelque part ?";
  }

  Future<void> _send() async {
    final t = _input.text.trim();
    if (t.isEmpty) return;
    setState(() {
      _msgs.add(_Msg(false, t));
      _input.clear();
      _loading = true;
    });
    try {
      final runs = await _agents.recent();
      if (!mounted) return;
      _backendOk = true;
      String reply;
      final lower = t.toLowerCase();
      if (lower.contains('trafic') ||
          lower.contains('route') ||
          lower.contains('alerte')) {
        reply = runs.isEmpty
            ? 'Aucune alerte trafic active sur Casablanca en ce moment.'
            : '${runs.length} événements actifs. Plus récent : ${runs.first.message ?? runs.first.title ?? "détails au tableau de bord"}.';
      } else if (lower.contains('stress') || lower.contains('calme')) {
        reply = "OK, je privilégie un trajet apaisé avec peu d'intersections.";
      } else if (lower.contains('eco') || lower.contains('carburant')) {
        reply = "Je passe en éco-trajet : -38% CO₂ pour +6 min en moyenne.";
      } else if (lower.contains('rabat') || lower.contains('aller')) {
        reply = "OK. Lance la recherche depuis l'écran carte et je te propose les scénarios.";
      } else {
        reply = "Compris. Je transmets aux agents STLS et je te tiens au courant.";
      }
      setState(() => _msgs.add(_Msg(true, reply)));
    } catch (_) {
      if (!mounted) return;
      _backendOk = false;
      setState(() => _msgs.add(const _Msg(
            true,
            "Le backend ne répond pas — je suis en mode offline.",
          )));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        const SwarmBackground(),
        SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(22, 12, 22, 8),
                child: Row(
                  children: [
                    const SwarmMark(size: 32),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Copilote SWARM',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w600,
                              color: SwarmColors.ink100,
                            ),
                          ),
                          Text(
                            _backendOk
                                ? 'STLS ONLINE · AGENTS LIVE'
                                : 'STLS OFFLINE',
                            style: SwarmTheme.mono(
                              size: 10,
                              color: _backendOk
                                  ? SwarmColors.safeGreen
                                  : SwarmColors.alertAmber,
                              letterSpacing: 0.8,
                            ),
                          ),
                        ],
                      ),
                    ),
                    PulseDot(
                      size: 7,
                      color: _backendOk
                          ? SwarmColors.safeGreen
                          : SwarmColors.alertAmber,
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
                  itemCount: _msgs.length + (_loading ? 1 : 0),
                  itemBuilder: (context, i) {
                    if (i >= _msgs.length) {
                      return const Padding(
                        padding: EdgeInsets.symmetric(vertical: 12),
                        child: Center(
                          child: SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        ),
                      );
                    }
                    final m = _msgs[i];
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: m.fromAi
                            ? MainAxisAlignment.start
                            : MainAxisAlignment.end,
                        children: [
                          if (m.fromAi) ...[
                            const SwarmMark(size: 26),
                            const SizedBox(width: 8),
                          ],
                          Flexible(
                            child: GlassCard(
                              radius: 14,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 10,
                              ),
                              gradient: m.fromAi
                                  ? null
                                  : const LinearGradient(
                                      colors: [
                                        SwarmColors.swarmBlue,
                                        SwarmColors.swarmBlue2,
                                      ],
                                    ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    m.text,
                                    style: const TextStyle(
                                      fontSize: 13.5,
                                      color: SwarmColors.ink100,
                                      height: 1.4,
                                    ),
                                  ),
                                  if (m.at != null) ...[
                                    const SizedBox(height: 4),
                                    Text(
                                      _formatTime(m.at!),
                                      style: SwarmTheme.mono(
                                        size: 9.5,
                                        color: SwarmColors.ink500,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 8, 14, 18),
                child: GlassCard(
                  radius: 26,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 6,
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.mic_none, color: SwarmColors.ink500),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: _input,
                          onSubmitted: (_) => _send(),
                          style: const TextStyle(color: SwarmColors.ink100),
                          decoration: const InputDecoration(
                            hintText: 'Parle à SWARM…',
                            hintStyle: TextStyle(color: SwarmColors.ink500),
                            border: InputBorder.none,
                            isCollapsed: true,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: _send,
                        icon: const Icon(
                          Icons.arrow_upward,
                          color: SwarmColors.swarmBlue2,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _formatTime(DateTime at) {
    final h = at.hour.toString().padLeft(2, '0');
    final m = at.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}
