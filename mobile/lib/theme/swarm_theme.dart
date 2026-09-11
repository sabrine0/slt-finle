import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'swarm_colors.dart';

class SwarmTheme {
  SwarmTheme._();

  static TextStyle mono({
    double size = 11,
    Color color = SwarmColors.darkInk500,
    FontWeight weight = FontWeight.w500,
    double letterSpacing = 0.04,
  }) {
    return GoogleFonts.jetBrainsMono(
      fontSize: size,
      color: color,
      fontWeight: weight,
      letterSpacing: letterSpacing,
    );
  }

  static ThemeData dark() {
    final base = ThemeData.dark(useMaterial3: true);
    final textTheme = GoogleFonts.interTextTheme(base.textTheme).apply(
      bodyColor: SwarmColors.darkInk100,
      displayColor: SwarmColors.darkInk100,
    );
    return base.copyWith(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: SwarmColors.darkBgDeep,
      canvasColor: SwarmColors.darkBgDeep,
      colorScheme: const ColorScheme.dark(
        primary: SwarmColors.swarmBlue2,
        secondary: SwarmColors.ecoTeal,
        surface: SwarmColors.darkBgElev1,
        error: SwarmColors.dangerRed,
        onPrimary: SwarmColors.darkInk100,
        onSecondary: SwarmColors.darkInk100,
        onSurface: SwarmColors.darkInk100,
      ),
      textTheme: textTheme,
      iconTheme: const IconThemeData(color: SwarmColors.darkInk300, size: 20),
      dividerColor: SwarmColors.darkHairline,
      splashFactory: InkSparkle.splashFactory,
    );
  }

  static ThemeData light() {
    final base = ThemeData.light(useMaterial3: true);
    final textTheme = GoogleFonts.interTextTheme(base.textTheme).apply(
      bodyColor: SwarmColors.lightInk100,
      displayColor: SwarmColors.lightInk100,
    );
    return base.copyWith(
      brightness: Brightness.light,
      scaffoldBackgroundColor: SwarmColors.lightBgDeep,
      canvasColor: SwarmColors.lightBgDeep,
      colorScheme: const ColorScheme.light(
        primary: SwarmColors.swarmBlue,
        secondary: SwarmColors.ecoTeal,
        surface: SwarmColors.lightBgElev1,
        error: SwarmColors.dangerRed,
        onPrimary: Colors.white,
        onSecondary: Colors.white,
        onSurface: SwarmColors.lightInk100,
      ),
      textTheme: textTheme,
      iconTheme: const IconThemeData(color: SwarmColors.lightInk300, size: 20),
      dividerColor: SwarmColors.lightHairline,
      splashFactory: InkSparkle.splashFactory,
    );
  }
}

class SwarmRadius {
  static const xs = 8.0;
  static const sm = 12.0;
  static const md = 14.0;
  static const lg = 18.0;
  static const xl = 22.0;
}

class SwarmSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 22.0;
  static const xxl = 32.0;
}
