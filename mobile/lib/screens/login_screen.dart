import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../api/auth_service.dart';
import '../main.dart' show themeController;
import '../theme/swarm_colors.dart';
import '../theme/swarm_theme.dart';
import '../widgets/swarm_background.dart';
import '../widgets/swarm_primitives.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController(text: 'admin@stls.local');
  final _password = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _loading = false;
  String? _error;
  bool _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await AuthService.instance.login(_email.text.trim(), _password.text);
      if (mounted) context.go('/home');
    } on ApiException catch (e) {
      setState(() => _error = _humanizeError(e));
    } catch (e) {
      setState(() => _error = 'Connexion impossible — backend joignable ?');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _humanizeError(ApiException e) {
    if (e.status == 401) return 'Email ou mot de passe incorrect.';
    if (e.status == 404) return 'Endpoint /auth/login introuvable sur le backend.';
    if (e.status == null) {
      return "Backend injoignable. Vérifie qu'il tourne sur ${ApiClient.instance.baseUrl}.";
    }
    return e.message;
  }

  @override
  Widget build(BuildContext context) {
    final dark = context.isDark;
    return Scaffold(
      body: Stack(
        children: [
          const SwarmBackground(),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 32),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            const SwarmMark(size: 36),
                            const SizedBox(width: 10),
                            Text(
                              'SWARM',
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                                color: context.ink100,
                                letterSpacing: 0.4,
                              ),
                            ),
                          ],
                        ),
                        IconButton(
                          onPressed: themeController.toggle,
                          icon: Icon(dark ? Icons.light_mode : Icons.dark_mode),
                          tooltip: 'Thème',
                        ),
                      ],
                    ),
                    const SizedBox(height: 40),
                    Text(
                      'Connexion',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w700,
                        color: context.ink100,
                        height: 1.1,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Accède à ton copilote cognitif territorial.',
                      style: TextStyle(color: context.ink500, fontSize: 14),
                    ),
                    const SizedBox(height: 32),
                    TextFormField(
                      controller: _email,
                      autofillHints: const [AutofillHints.email],
                      keyboardType: TextInputType.emailAddress,
                      style: TextStyle(color: context.ink100),
                      decoration: _decoration(context, 'Email', Icons.mail_outline),
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) return 'Requis';
                        if (!v.contains('@')) return 'Email invalide';
                        return null;
                      },
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _password,
                      autofillHints: const [AutofillHints.password],
                      obscureText: _obscure,
                      style: TextStyle(color: context.ink100),
                      decoration: _decoration(
                        context,
                        'Mot de passe',
                        Icons.lock_outline,
                        suffix: IconButton(
                          onPressed: () => setState(() => _obscure = !_obscure),
                          icon: Icon(
                            _obscure ? Icons.visibility : Icons.visibility_off,
                            color: context.ink500,
                          ),
                        ),
                      ),
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Requis';
                        return null;
                      },
                      onFieldSubmitted: (_) => _submit(),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          color: SwarmColors.dangerRed.withValues(alpha: 0.14),
                          border: Border.all(
                            color: SwarmColors.dangerRed.withValues(alpha: 0.5),
                          ),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.error_outline,
                              size: 16,
                              color: SwarmColors.dangerRed,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _error!,
                                style: TextStyle(
                                  color: context.ink100,
                                  fontSize: 12.5,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 22),
                    FilledButton(
                      onPressed: _loading ? null : _submit,
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      child: _loading
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : const Text(
                              'Se connecter',
                              style: TextStyle(fontWeight: FontWeight.w600),
                            ),
                    ),
                    const SizedBox(height: 14),
                    TextButton(
                      onPressed: _loading
                          ? null
                          : () {
                              // Skip login — mock mode for screens that don't depend on backend.
                              context.go('/home');
                            },
                      child: Text(
                        "Continuer sans compte (mode démo)",
                        style: TextStyle(color: context.ink300, fontSize: 13),
                      ),
                    ),
                    const Spacer(),
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.dns, size: 12, color: context.ink500),
                          const SizedBox(width: 6),
                          Text(
                            ApiClient.instance.baseUrl,
                            style: SwarmTheme.mono(
                              size: 10,
                              color: context.ink500,
                              letterSpacing: 0.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  InputDecoration _decoration(
    BuildContext context,
    String label,
    IconData icon, {
    Widget? suffix,
  }) {
    return InputDecoration(
      labelText: label,
      labelStyle: TextStyle(color: context.ink500),
      prefixIcon: Icon(icon, color: context.ink500, size: 20),
      suffixIcon: suffix,
      filled: true,
      fillColor: context.bgElev1,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: context.hairline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: context.hairline),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(
          color: SwarmColors.swarmBlue2,
          width: 1.5,
        ),
      ),
    );
  }
}
