# STLS — Smart Traffic Light System

Deck — interface walkthrough
Version 2026-04-24 · project: STLS Pilot Casablanca

Use each `##` heading as one PowerPoint slide. Content below is the
speaker notes / slide body. Screenshots to add in the PPT go into the
`[SCREENSHOT: …]` placeholders.

---

## Slide 1 — Cover

**STLS — Smart Traffic Light System**
Plateforme de supervision, d'ingénierie et d'assistance IA pour feux tricolores.

- Client pilote : Casablanca / Société Région Aménagement
- Stack : Next.js 16 (frontend) + NestJS 11 (backend) + Go runtime controller + PostgreSQL
- Statut : MVP opérateur + ingénierie + dossiers + AI Assist

---

## Slide 2 — Agenda

1. Architecture (high-level)
2. Command Platform — poste opérateur temps réel
3. Projects — espace projet
4. Studio Landing — catalogue des contrôleurs
5. Studio Workbench — IDE d'ingénierie
6. Controller Workspace — flux live par contrôleur
7. AutoCAD Plan — plan topographique vectoriel
8. Dossier Régulation & Câblage — exports PDF
9. Zone Builder — créer un nouveau contrôleur
10. Proposal Workspace — espace de travail de la proposition
11. AI Assist — recommandation trafic (Gemini + règles)
12. Override reason-coded flow — commande auditée
13. Engineering Studio — inventaire ingénierie
14. Roadmap & prochaines étapes

---

## Slide 3 — Architecture

```
┌──────────────────────────────────────────────────────────┐
│  CLIENTS                                                  │
│  Opérateur (Command Platform)  ·  Ingénieur (Studio)     │
└──────────────┬──────────────────────────┬────────────────┘
               │ HTTPS + WebSocket        │ HTTPS
               ▼                          ▼
┌──────────────────────────────────────────────────────────┐
│  STLS BACKEND (NestJS 11)                                 │
│  auth · traffic · intersection-runtime · engineering      │
│  controller-manager · overrides · projects · audit        │
│  traffic-intelligence (Gemini + Google Traffic)           │
└──────────────┬─────────────┬────────────┬────────────────┘
           Postgres      NATS/events   Object store
                              │
                              ▼
                   ┌──────────────────────┐
                   │  Controller Runtime  │
                   │  (Go, per cabinet)   │
                   └──────────┬───────────┘
                              ▼
                  Signal heads · detectors · cabinet
```

- Séparation nette **authoring** (Studio) vs **operating** (Command Platform).
- `controller-runtime` en Go tourne en local sur chaque carrefour ; HMAC + JWT + fail-safe.
- AI conseille — jamais commande directe ; chaque décision passe par override audité.

---

## Slide 4 — Command Platform  ·  `/`

**Pour qui** : opérateurs 24/7 / superviseur / police
**But** : voir l'état du réseau en temps réel, intervenir immédiatement

Éléments clés :
- Carte du Maroc avec **polygones régionaux** coloriés (vert/jaune/rouge selon santé)
- **Drill-down** : pays → région → ville → district → carrefour
- **NavRail** + **TopBar** avec sélecteur de scénario (Normal / Peak / Emergency)
- **AlertsFeed** : pile d'alarmes critiques (son optionnel)
- **KPI cards** : incidents · nodes · controllers · throughput (vph)
- **SelectedAreaPanel** : contrôles opérateur (override, force green, mode)
- **AI Assist panel** intégré par carrefour (voir slide 11)
- **Env badge** · theme toggle · reason-coded override modal

[SCREENSHOT: carte Maroc avec zones colorées + alertes + KPIs]

---

## Slide 5 — Projects  ·  `/projects`

**Pour qui** : PM / BE / contrôleur clients
**But** : catalogue des projets par organisation

- Seeded : `Tomorrow Morocco → STLS Pilot — Casablanca → Casablanca-Centre`
- Hiérarchie **Organization → Project → Site → Intersection**
- Chaque carte de projet : client ref · statut · nb sites · nb carrefours · organisation
- Navigation rapide vers Command / Studio / Engineering

[SCREENSHOT: cartes de projets en grille]

---

## Slide 6 — Studio Landing  ·  `/studio`

**Pour qui** : ingénieur trafic / BE
**But** : atlas interactif des contrôleurs du projet

Composants :
- **Google Maps plein écran** style Command Platform (dark + zones)
- Chaque contrôleur = marqueur circulaire (vert/jaune/rouge/gris selon connexion)
- **Lignes de corridor** entre contrôleurs du même quartier, couleur = pire état
- **Polygones ADM1** : toutes les régions du Maroc avec aggregat de santé
- Top-right : filtres All / Online / Degraded / Offline · Light/Dark · **+ Zone** · **Workbench**
- Top-left : VIEW · ZONES · FLOW (légende)

[SCREENSHOT: studio full-map avec corridors]

---

## Slide 7 — Studio Workbench  ·  `/studio/workbench`

**Pour qui** : traffic engineer (BE)
**But** : IDE d'ingénierie — configurer un carrefour end-to-end

Structure IDE 3-panneaux :
- **Project Explorer** (gauche) — Country → Region → City → Intersections
  - Les **propositions locales** apparaissent dans la ville correspondante avec un tag **Prop**
- **Editor Workspace** (centre) — onglets Diagram · Live · Identity · Approaches · Lanes · Signal groups · Movements · Phases & Stages · Detectors · Modes · Controller
- **Control Panel** (droite) — Operator Control, Manual override, Control mode (Adaptive / Fixed / Manual / Flash Y / Emergency / Fail-safe), Force phase, Force green, Action log
- **Panneaux repliables** : toggle `⟨ Explorer` et `⟩ Panel` dans l'en-tête
- **Export Régulation / Câblage** → PDF @react-pdf/renderer

[SCREENSHOT: workbench avec intersection Maarif / Zerktouni ouverte]

---

## Slide 8 — Controller Workspace  ·  `/studio/controllers/[id]`  /  `/studio/programmer/[id]`

**Pour qui** : programmateur / technicien
**But** : espace de travail live par contrôleur

- **Chip strip** en haut — TOUS les contrôleurs du projet, état live, cliquable
- **Left pane** — détails contrôleur, mode, env, runtime, active plan, uptime
- **Right pane — Live signal flow** :
  - Schéma intersection N/E/S/W avec feux lumineux animés
  - Timeline du cycle (phases colorées, active highlightée)
  - **Force a phase** button par phase + **Release** button
  - Polling 1 s via `/intersections/:code/state`

[SCREENSHOT: controller workspace avec chip strip + live flow]

---

## Slide 9 — AutoCAD Plan  ·  `/studio/autocad/[id]`

**Pour qui** : BE topographe / dessinateur
**But** : plan d'aménagement vectoriel style GroupéRyX

- **SVG plein écran** : routes, trottoirs, passages piétons, lignes d'arrêt, feux, supports, boucles, chambres, câbles, armoire
- **Data model complet** : CivilPlan · RoadArm · Lane · Crosswalk · StopLine · SignalSupport · SignalHead · DetectorLoop · CableChamber · CableRun · ControllerCabinet
- **Sample intersection INT-CAS-006** : 16 supports (A–P), 6 boucles, 8 chambres, 22 tirages câbles, armoire C04
- **Toolbar** : 8 layer toggles (Roads / Lane markings / Crosswalks / Supports / Loops / Chambers / Cables / Labels)
- **North arrow** + **scale bar** (0–5–10 m) + échelle 1:200
- **3 boutons export** : Plan PDF · Dossier Régulation · Dossier Câblage
- Dark & Light themes

[SCREENSHOT: AutoCAD SVG avec tous les layers actifs]

---

## Slide 10 — Dossiers Régulation & Câblage

**Pour qui** : maître d'ouvrage / archive BE
**But** : livrable PDF style GroupéRyX

Génération **pur vecteur** via `@react-pdf/renderer` — aucune tuile Google dans le PDF.

**Dossier Régulation** (A4 + A3 plan) :
1. Page de garde (SOCIÉTÉ RÉGION AMÉNAGEMENT box, révisions, préparé/vérifié)
2. Identité du carrefour (code, GPS, contrôleur, firmware)
3. Inventaire équipement signalisation (potences, poteaux, potelets, R11v/R12/R14)
4. Entrées contrôleur
5. Plan d'aménagement (A3 landscape, vectoriel)
6. Phasage (Min vert / Jaune / Rouge dég. / Groupes vert)
7. Plans de feux (Code / Nom / Statut / Cycle / Décalage)
8. Observations & hypothèses

**Dossier Câblage** (A4 + A3 plan) :
1. Page de garde
2. Plan de câblage (A3)
3. Carnet de câblage — détail (Départ, Support, Type, Équipement, Câble, Repère, Long., Cheminement)
4. Liaison boucles
5. Quantitatif câbles (U1000 R2v, Blindé LIYCY, Fibre)
6. Chambres de tirage
7. I/O contrôleur (Bornier, Mnémo, Référence câble, Destination)

Nom fichier : `Dossier_regulation_INT-CAS-006_20260424.pdf` etc.

[SCREENSHOT: première page + page plan du PDF]

---

## Slide 11 — Zone Builder  ·  `/studio/zones`

**Pour qui** : ingénieur qui prospecte un nouveau carrefour
**But** : délimiter une zone sur Google Maps, auto-remplir depuis le géocodeur, enregistrer la proposition

Style **TopoExport** :
- Google Map plein écran (dark/light)
- Rectangle zone avec **4 poignées** aux coins, draggable
- **Dimensions live** (largeur × hauteur × km²) via haversine
- Panneau droit : Carte vectorielle 2D · Modélisation 3D (DXF / IFC+ / OBJ / glTF / STL) · Layers (Routes, Bâtiments, Traversées piétons, Voies ferrées, Hydrographie, Végétation, Courbes de niveau)
- Bouton primaire **+ Ajouter contrôleur** → ouvre modal avec **auto-remplissage Google Maps Geocoder**
  - Rue principale ← route
  - Intersection name ← `route / sublocality`
  - Code ← `INT-<CITY>-<STREET>` généré
- Après save : redirection vers le workspace de la proposition
- **Visualiser** : fit-bounds + pulse animation

[SCREENSHOT: rectangle sur Casablanca + panneau droit style TopoExport]

---

## Slide 12 — Proposal Workspace  ·  `/studio/zones/proposals/[id]`

**Pour qui** : ingénieur qui vient de proposer une zone
**But** : espace dédié à la proposition avant qu'elle devienne un vrai carrefour

- **Map preview** : rectangle + marker centre (Google Maps)
- **Identité** card (code · nom · rue · coordinates · dimensions · timestamp) avec bouton **Modifier**
- **Prochaines étapes** :
  1. Valider la zone avec le BE (✓ quand audit synced)
  2. Créer le carrefour réel (endpoint à venir)
  3. Ouvrir l'atelier AutoCAD
  4. Générer dossiers régulation & câblage
- **Actions** : revenir · supprimer · sync state badge
- Persistance **localStorage** (`stls.zone-builder.proposals`) + audit sync via `logOverride`
- La proposition apparaît **dans l'arbre Workbench** sous sa ville, avec tag `Prop`

[SCREENSHOT: proposal workspace avec map + étapes]

---

## Slide 13 — AI Assist  ·  Command Platform right panel

**Pour qui** : opérateur
**But** : obtenir une recommandation trafic contextuelle sans jamais perdre le contrôle

Backend : module `traffic-intelligence` avec 3 services
- `GoogleTrafficService` — Distance Matrix API (4 corridors N/E/S/W ~500 m)
- `AiRecommendationService` — Gemini 1.5 Flash JSON ou **fallback rule-based** si `GEMINI_API_KEY` absent
- `AiSafetyValidatorService` — dernière porte avant la sortie

Règles sécurité (15 tests unitaires):
- Advisory mode → `requiresHumanApproval: true` toujours
- Real-mode intersection → approbation humaine toujours
- Override manuel / emergency / flash / fail-safe → action downgradée à `no_action`
- `targetPhaseId` inconnu → `no_action`
- Durée clampée `[min_green, 60 s]`
- Conflict matrix vérifiée avant toute proposition
- Tout passe par `@AuditAction` → trace audit

Panel UI (3 onglets) :
- **Recommendation** — badge mode/source, action chip, risk chip, `Human approval required`, safety warnings
- **Context** — Google traffic corridors, runtime state, operator override
- **History** — dernières 25 recommandations par carrefour

Contrat JSON strict :
```json
{
  "intersectionId": "INT-001",
  "action": "force_phase|extend_phase|reduce_phase|release|no_action",
  "targetPhaseId": "ph-1",
  "durationSeconds": 15,
  "reason": "…",
  "confidence": 0.8,
  "riskLevel": "low|medium|high",
  "requiresHumanApproval": true,
  "safetyWarnings": ["…"],
  "source": "gemini|rule-based|fallback",
  "generatedAt": "2026-04-24T…"
}
```

[SCREENSHOT: AI Assist panel avec recommendation + apply button]

---

## Slide 14 — Override reason-coded flow

**Pour qui** : tous les opérateurs
**But** : aucune commande sans raison — auditabilité totale

- Tout force phase / force green / mode change ouvre la **modal reason-coded**
- Reasons : Incident · Emergency vehicle · Congestion relief · Maintenance · Event · Pedestrian safety · Fault recovery · Drill · Other (requires note)
- Durée optionnelle (presets : 60 s / 2 min / 5 min / 10 min / 30 min)
- Note libre (500 char max)
- Sur confirmation : **persiste dans** `OverrideCommandEntity` + déclenche la commande runtime
- Endpoint : `POST /overrides/:intersectionCode`

L'AI Assist réutilise **exactement la même modal** — l'IA remplit la note avec son `reason`, l'opérateur choisit le code et confirme. Rien ne court-circuite cette porte.

[SCREENSHOT: override reason modal avec AI-prefilled detail]

---

## Slide 15 — Engineering Studio  ·  `/engineering`

**Pour qui** : BE / inventory
**But** : liste plate de tous les carrefours avec metadata ingénierie

- Chaque carte : code, nom, district, mode courant, phases count, timing plans count, controllers (real / sim), deployment active
- Drill-down vers `/engineering/intersections/[id]` pour les détails
- `/engineering/controllers` : inventaire contrôleurs (connection state, firmware, HMAC, last seen)

[SCREENSHOT: engineering studio grid]

---

## Slide 16 — Écran permanents

| Écran | Route | Rôle | Persona |
|---|---|---|---|
| Command Platform | `/` | Supervision temps réel | Opérateur 24/7 |
| Projects | `/projects` | Catalogue projets | PM / BE |
| Studio Landing | `/studio` | Atlas contrôleurs | Ingénieur |
| Studio Workbench | `/studio/workbench` | IDE ingénierie | BE |
| Controller Workspace | `/studio/controllers/[id]` | Flux live par contrôleur | Tech / BE |
| AutoCAD Plan | `/studio/autocad/[id]` | Plan topographique | BE topographe |
| Dossier Preview | `/studio/autocad/[id]/dossier/[kind]` | Aperçu HTML imprimable | BE |
| Zone Builder | `/studio/zones` | Créer nouveau carrefour | Ingénieur prospection |
| Proposal Workspace | `/studio/zones/proposals/[id]` | Suivi proposition | Ingénieur |
| Engineering Inventory | `/engineering` | Liste inventaire | BE |
| Controller Inventory | `/engineering/controllers` | Contrôleurs inventaire | Ops |

---

## Slide 17 — Sécurité & audit (trame rouge)

- Zero-trust : JWT obligatoire sauf en mode dev
- Permissions granulaires : `command-platform.read` · `.control` · `engineering.author` · `engineering.approve`
- **Chaque commande** passe par reason code + opérateur + IP → `OverrideCommandEntity`
- **Chaque recommandation AI** loggée avec `AuditAction` + recorded in memory ring
- AI **jamais** auto-apply en real mode (belt-and-braces)
- Police / emergency override sacré : AI suppressed
- Conflict matrix validée côté client, côté AI safety, côté runtime (triple défense)

---

## Slide 18 — Roadmap (extrait)

**Fait** :
- Sprint 1 : projets / sites / intersections, reason-coded override, env badge, audit logs
- Sprint 2 : AutoCAD vectoriel, dossiers PDF pur vecteur, zone builder
- Sprint 3 : AI Assist advisory + safety validator + override integration

**À venir** :
- `POST /engineering/intersections` → promotion proposal → real intersection
- Conflict matrix editor (UI grid)
- Simulation (dry-run plan de feux avant deploy)
- SSO / LDAP en prod
- Fleet rollout avec firmware OTA signé HMAC

---

## Slide 19 — Stack technique

- **Frontend** : Next.js 16 · React 19 · Tailwind v4 · TypeScript 5 · @react-google-maps/api · @react-pdf/renderer
- **Backend** : NestJS 11 · TypeORM 0.3 · PostgreSQL · Passport JWT · Gemini 1.5 · Google Distance Matrix
- **Controller runtime** : Go · HMAC · JWT · offline-capable
- **Build** : 100 % typecheck + lint + unit tests OK
- **Déploiement actuel** : Cloudflare tunnel pour review superviseur (temporaire)

---

## Slide 20 — Contact / Q&A

STLS Studio — demo & code walkthrough disponible
Contact : akarim@tomorrow.ma
