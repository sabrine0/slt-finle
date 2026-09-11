# SWARM-Traffic AI — Mobile (Copilote Cognitif B2C)

App mobile Flutter pour le **Copilote Cognitif** du système SWARM-Traffic AI v9.0 (Tomorrow Systems).

> Waze cherche le chemin le plus rapide. SWARM-Traffic AI cherche le chemin le plus **intelligent** — pour chaque humain, chaque véhicule, chaque territoire.

## Position dans la plateforme STLS

Ce module est le 2e niveau de la plateforme cognitive :

| Niveau | Cible | Module |
|--------|-------|--------|
| MVP Territoire (Decision Engine) | B2G — collectivités | `frontend/` + `backend/` |
| Copilote Cognitif | B2C — conducteur | **`mobile/`** ← ce dossier |
| Controller Runtime | Edge — Go | `controller-runtime/` |

À terme, le mobile consomme l'API NestJS exposée par `backend/`. Pour l'instant il fonctionne en **standalone avec données mock** (cf. screens).

## Stack

- Flutter 3.35+
- Dart 3.9+
- `go_router` — navigation
- `google_fonts` — Inter + JetBrains Mono

## Écrans implémentés (squelettes)

| # | Écran | Route | Source design |
|---|-------|-------|---------------|
| 1 | Splash / Boot sequence | `/splash` | `screens-mobile-a.jsx#1` |
| 2 | Onboarding | `/onboarding` | `screens-mobile-a.jsx#2` |
| 3 | Home Dashboard | `/home` | `screens-mobile-a.jsx#3` |
| 4 | Scenario Engine | `/scenarios` | `screens-mobile-a.jsx#4` |
| 5 | Navigation Mode | `/navigation` | `screens-mobile-a.jsx#5` |
| 6 | Park & Continue | `/park` | `screens-mobile-b.jsx#6` |
| 7 | AI Copilot Chat | `/copilot` | `screens-mobile-b.jsx#7` |
| 8 | Profile / Gamification | `/profile` | `screens-mobile-b.jsx#8` |
| 10 | Bilan post-trajet | `/bilan` | `screens-mobile-c.jsx#10` |
| 11 | Vehicle Knowledge Graph | `/vehicle` | `screens-mobile-c.jsx#11` |
| 12 | User Profile Editor | `/profile/edit` | `screens-mobile-c.jsx#12` |
| 13 | Ramadan Mode | `/ramadan` | `screens-mobile-c.jsx#13` |
| 14 | Multimodal Comparison | `/multimodal` | `screens-mobile-c.jsx#14` |

## Design system

Tokens portés depuis `AMI traffic/swarm.css` :

- `lib/theme/swarm_colors.dart` — palette (swarm-blue, eco-teal, stress-violet, safe-green, ink-*)
- `lib/theme/swarm_theme.dart` — typography (Inter + JetBrains Mono), spacing, radius
- `lib/widgets/swarm_primitives.dart` — GlassCard, SwarmChip, PulseDot, SwarmMark, LiveEyebrow, boutons
- `lib/widgets/swarm_background.dart` — gradient + neural background animé
- `lib/widgets/city_map.dart` — carte placeholder (à remplacer par Mapbox/MapLibre en Phase Hybrid)

## Lancement

```bash
cd mobile
flutter pub get
flutter run
```

Ou depuis la racine STLS :

```bash
npm run dev:mobile
```

## Prochaines étapes (roadmap)

| Horizon | Étape |
|---------|-------|
| Court (0–3 mois) | Carte réelle (Mapbox/MapLibre GL Native) + géoloc + 1er scénario calculé |
| Court | Wiring backend NestJS (auth + endpoint `/scenarios`) |
| Moyen (3–12 mois) | Park & Continue avec données P+R réelles + intégration tram Casablanca |
| Moyen | Vehicle Knowledge Graph dynamique (sync depuis backend) |
| Long | V2X / crowd sensing — Phase Living Swarm |
