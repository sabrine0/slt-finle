import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import 'api/auth_service.dart';
import 'router/app_router.dart';
import 'theme/swarm_theme.dart';
import 'theme/theme_controller.dart';

late ThemeController themeController;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Disable network fetch of Google Fonts — fall back to bundled / system fonts.
  // Avoids "Failed to fetch" errors when offline or fonts.gstatic.com is blocked.
  GoogleFonts.config.allowRuntimeFetching = false;
  themeController = await ThemeController.load();
  await AuthService.instance.bootstrap();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(statusBarColor: Colors.transparent),
  );
  runApp(const SwarmApp());
}

class SwarmApp extends StatelessWidget {
  const SwarmApp({super.key});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: themeController,
      builder: (context, _) {
        return MaterialApp.router(
          title: 'SWARM-Traffic AI',
          debugShowCheckedModeBanner: false,
          theme: SwarmTheme.light(),
          darkTheme: SwarmTheme.dark(),
          themeMode: themeController.mode,
          routerConfig: appRouter,
        );
      },
    );
  }
}
