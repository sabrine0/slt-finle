import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/swarm_colors.dart';
import '../theme/swarm_theme.dart';

class ShellScreen extends StatelessWidget {
  const ShellScreen({super.key, required this.child});

  final Widget child;

  static const _tabs = [
    _Tab(route: '/home', icon: Icons.map_outlined, activeIcon: Icons.map, label: 'Carte'),
    _Tab(route: '/scenarios', icon: Icons.route_outlined, activeIcon: Icons.route, label: 'Scénarios'),
    _Tab(route: '/copilot', icon: Icons.auto_awesome_outlined, activeIcon: Icons.auto_awesome, label: 'Copilote'),
    _Tab(route: '/profile', icon: Icons.person_outline, activeIcon: Icons.person, label: 'Profil'),
  ];

  int _indexOf(String location) {
    for (var i = 0; i < _tabs.length; i++) {
      if (location.startsWith(_tabs[i].route)) return i;
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final index = _indexOf(location);
    final dark = context.isDark;

    return Scaffold(
      extendBody: true,
      body: child,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: dark ? const Color(0xE6101A2E) : Colors.white,
          border: Border(top: BorderSide(color: context.hairline)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: List.generate(_tabs.length, (i) {
                final t = _tabs[i];
                final active = i == index;
                return Expanded(
                  child: InkWell(
                    onTap: () => context.go(t.route),
                    borderRadius: BorderRadius.circular(SwarmRadius.sm),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            active ? t.activeIcon : t.icon,
                            color: active
                                ? SwarmColors.swarmBlue2
                                : context.ink500,
                            size: 22,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            t.label,
                            style: TextStyle(
                              fontSize: 10.5,
                              color: active ? context.ink100 : context.ink500,
                              fontWeight: active
                                  ? FontWeight.w600
                                  : FontWeight.w400,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
        ),
      ),
    );
  }
}

class _Tab {
  const _Tab({
    required this.route,
    required this.icon,
    required this.activeIcon,
    required this.label,
  });

  final String route;
  final IconData icon;
  final IconData activeIcon;
  final String label;
}
