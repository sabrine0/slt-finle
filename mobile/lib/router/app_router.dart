import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../screens/splash_screen.dart';
import '../screens/onboarding_screen.dart';
import '../screens/home_screen.dart';
import '../screens/scenario_screen.dart';
import '../screens/navigation_screen.dart';
import '../screens/park_screen.dart';
import '../screens/copilot_screen.dart';
import '../screens/profile_screen.dart';
import '../screens/bilan_screen.dart';
import '../screens/vehicle_screen.dart';
import '../screens/user_profile_edit_screen.dart';
import '../screens/ramadan_screen.dart';
import '../screens/login_screen.dart';
import '../screens/multimodal_screen.dart';
import '../screens/search_screen.dart';
import '../screens/shell_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/splash',
  routes: [
    GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
    GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
    GoRoute(path: '/onboarding', builder: (_, __) => const OnboardingScreen()),
    GoRoute(path: '/navigation', builder: (_, __) => const NavigationScreen()),
    GoRoute(path: '/park', builder: (_, __) => const ParkScreen()),
    GoRoute(path: '/bilan', builder: (_, __) => const BilanScreen()),
    GoRoute(path: '/vehicle', builder: (_, __) => const VehicleScreen()),
    GoRoute(path: '/profile/edit', builder: (_, __) => const UserProfileEditScreen()),
    GoRoute(path: '/ramadan', builder: (_, __) => const RamadanScreen()),
    GoRoute(path: '/multimodal', builder: (_, __) => const MultimodalScreen()),
    GoRoute(path: '/search', builder: (_, __) => const SearchScreen()),
    ShellRoute(
      builder: (context, state, child) => ShellScreen(child: child),
      routes: [
        GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
        GoRoute(path: '/scenarios', builder: (_, __) => const ScenarioScreen()),
        GoRoute(path: '/copilot', builder: (_, __) => const CopilotScreen()),
        GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
      ],
    ),
  ],
  errorBuilder: (context, state) => Scaffold(
    body: Center(child: Text('Route introuvable: ${state.uri}')),
  ),
);
