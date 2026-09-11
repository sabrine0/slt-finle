import 'package:flutter/material.dart';

/// Brand colors — constant across light and dark themes.
class SwarmColors {
  SwarmColors._();

  static const swarmBlue = Color(0xFF1A5FDC);
  static const swarmBlue2 = Color(0xFF2A7BFF);
  static const safeGreen = Color(0xFF10B981);
  static const alertAmber = Color(0xFFF59E0B);
  static const dangerRed = Color(0xFFEF4444);
  static const stressViolet = Color(0xFF8B5CF6);
  static const ecoTeal = Color(0xFF14B8A6);

  // Dark scheme tokens
  static const darkBgDeep = Color(0xFF101A2E);
  static const darkBgBase = Color(0xFF142039);
  static const darkBgElev1 = Color(0xFF1A2745);
  static const darkBgElev2 = Color(0xFF243456);
  static const darkInk100 = Color(0xFFF8FAFC);
  static const darkInk300 = Color(0xFFCBD5E1);
  static const darkInk500 = Color(0xFF64748B);
  static const darkInk700 = Color(0xFF334155);
  static const darkHairline = Color(0x1AA7C8FF);
  static const darkHairlineStrong = Color(0x2EA7C8FF);

  // Light scheme tokens
  static const lightBgDeep = Color(0xFFF8FAFC);
  static const lightBgBase = Color(0xFFFFFFFF);
  static const lightBgElev1 = Color(0xFFFFFFFF);
  static const lightBgElev2 = Color(0xFFF1F5F9);
  static const lightInk100 = Color(0xFF0F172A);
  static const lightInk300 = Color(0xFF334155);
  static const lightInk500 = Color(0xFF64748B);
  static const lightInk700 = Color(0xFF94A3B8);
  static const lightHairline = Color(0x141A5FDC);
  static const lightHairlineStrong = Color(0x33A7C8FF);

  // ── Back-compat aliases used by older widgets (resolve at theme level too) ──
  static const bgDeep = darkBgDeep;
  static const bgBase = darkBgBase;
  static const bgElev1 = darkBgElev1;
  static const bgElev2 = darkBgElev2;
  static const ink100 = darkInk100;
  static const ink300 = darkInk300;
  static const ink500 = darkInk500;
  static const ink700 = darkInk700;
  static const hairline = darkHairline;
  static const hairlineStrong = darkHairlineStrong;
  static const nightNavy = Color(0xFF0F172A);
  static const darkSurface = Color(0xFF1E293B);
  static const ink900 = Color(0xFF0B1220);
  static const calmWarm = Color(0xFFF4F1EA);
}

/// Resolves the right token based on the current ThemeData brightness.
extension SwarmContextColors on BuildContext {
  bool get isDark => Theme.of(this).brightness == Brightness.dark;

  Color get bgDeep => isDark ? SwarmColors.darkBgDeep : SwarmColors.lightBgDeep;
  Color get bgBase => isDark ? SwarmColors.darkBgBase : SwarmColors.lightBgBase;
  Color get bgElev1 => isDark ? SwarmColors.darkBgElev1 : SwarmColors.lightBgElev1;
  Color get bgElev2 => isDark ? SwarmColors.darkBgElev2 : SwarmColors.lightBgElev2;
  Color get ink100 => isDark ? SwarmColors.darkInk100 : SwarmColors.lightInk100;
  Color get ink300 => isDark ? SwarmColors.darkInk300 : SwarmColors.lightInk300;
  Color get ink500 => isDark ? SwarmColors.darkInk500 : SwarmColors.lightInk500;
  Color get ink700 => isDark ? SwarmColors.darkInk700 : SwarmColors.lightInk700;
  Color get hairline => isDark ? SwarmColors.darkHairline : SwarmColors.lightHairline;
  Color get hairlineStrong =>
      isDark ? SwarmColors.darkHairlineStrong : SwarmColors.lightHairlineStrong;
}
