# STLS — Boss Demo Recording Guide

This guide is a step-by-step script for a 5–7 minute screen recording.
Each step has a target, what to show, and a one-line script to read.

## Setup before recording

Make sure all three services are running. Open three terminals (or
just confirm in one) and check:

```bash
curl -s http://127.0.0.1:4010/meta                 # backend up
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/   # frontend up = 200
```

If anything is down, start in this order:
1. PGlite bridge   → `node .pglite-bridge.mjs`
2. Backend         → `npm run dev:backend`
3. Frontend        → `npm run dev:frontend`

Open Windows Game Bar (Win+G) or OBS to record. Pick the screen with
the browser + a terminal side-by-side.

---

## Recording flow (read aloud as you go)

### Intro (15–20 s)

> "Bonjour, voici STLS — le Smart Traffic Light System pour le Royaume du Maroc.
> C'est une plateforme de gestion temps-réel des contrôleurs de carrefour,
> avec un backend NestJS qui sert de source de vérité unique, un frontend
> Next.js pour les opérateurs, et deux agents intelligents qui supportent
> la décision et l'optimisation des feux."

Screen: code editor briefly showing the project tree
(`backend/`, `frontend/`, `controller-runtime/`).

### Step 1 — Run the A-to-Z smoke test (1 min)

In the terminal:

```bash
bash "scripts/demo-end-to-end.sh"
```

Read aloud while it runs:

> "On commence par lancer le test bout-en-bout. Il valide la santé du
> backend, la topologie (villes, zones, liens), les métriques d'ingénierie,
> les snapshots de prédiction par intersection / zone / ville, l'agent
> de prédiction trafic, l'agent d'optimisation des feux, et la disponibilité
> du frontend. Au total, dix-sept vérifications."

When the green summary appears: **17 / 17 PASS — system fully operational.**

### Step 2 — Show the dashboard (1 min)

Open `http://localhost:3000/`.

Read aloud:
- "Voici le tableau de bord opérateur — vue Royaume du Maroc, 170 carrefours,
   158 contrôleurs, 10 incidents actifs, 2600 véhicules par heure."
- Toggle the **LIGHT/DEV** button → both themes work.
- Click on Casablanca-Settat region → city markers appear.
- Click El Jadida → only El Jadida intersections show.

### Step 3 — Switch to "Graphe contrôleurs" (1 min)

Click **Graphe contrôleurs** tab.

- "Le graphe contrôleurs ne montre que les contrôleurs de la ville
   sélectionnée — chaque ville est un sous-réseau autonome."
- Show the animated background (drifting AI grid + scan line).
- Show the flowing particles on links.
- Hover one node → label + halo pulses.

### Step 4 — Backend prediction in action (1 min)

In the terminal, open `prediction-snapshots`:

```bash
curl -s 'http://127.0.0.1:4010/prediction-snapshots/intersections/INT-CAS-001?horizon=H%2B15' | head -c 800
```

Read aloud:
> "Le moteur de prédiction calcule pour chaque carrefour les métriques
> d'ingénierie : flux véh/h, densité véh/km, vitesse moyenne, file
> d'attente en mètres et en véhicules, délai de contrôle, saturation
> X = demande / capacité, et un score de confiance."

Highlight in the JSON: `flowVehiclesPerHour`, `densityVehiclesPerKm`,
`saturation`, `capacityVehiclesPerHour`, `queueLengthMetres`, `confidence`.

### Step 5 — Decision-support agent (45 s)

```bash
curl -s 'http://127.0.0.1:4010/traffic-intelligence/intersection/INT-CAS-001'
```

Read aloud:
> "L'agent de prédiction trafic prend les métriques et produit une
> décision : niveau prévu (smooth / pressure / congestion), tendance
> (improving / stable / worsening), score de risque sur 100, action
> recommandée à l'opérateur, et le raisonnement pas-à-pas pour la
> traçabilité réglementaire."

Highlight: `predictedCongestionLevel`, `riskScore`, `recommendedAction`,
`rationale[]`.

### Step 6 — Active control agent (45 s)

```bash
curl -s -X POST 'http://127.0.0.1:4010/traffic-control/intersection/INT-CAS-001/optimize?horizon=H%2B15'
```

Read aloud:
> "L'agent d'optimisation des feux propose un nouveau plan de feux :
> longueur de cycle ajustée, temps de vert recommandé par phase,
> ordre de priorité des phases. La logique vient de l'ingénierie
> trafic — pas de boîte noire IA, chaque règle est auditable."

Highlight: `currentCycleSeconds → recommendedCycleSeconds`,
`phases[].direction / recommendedGreenSeconds / priorityRank`,
`rationale[]`, `requiresOperatorReview`.

### Step 7 — Closing (20 s)

> "À retenir :
>   • Backend = source de vérité — 100 % des décisions s'appuient sur
>     des données issues de la base de données.
>   • Pas de fausses données dans le frontend.
>   • Deux agents règle-basés en place — prédiction et optimisation —
>     prêts à être étendus avec une couche IA si nécessaire.
>   • Toute action de contrôle reste validée par l'opérateur :
>     l'agent recommande, l'humain applique."

Stop recording. Save under `STLS-demo-YYYYMMDD.mp4`.

---

## Recovery tips during the recording

- If a curl fails, check the backend terminal for the error and re-run
  the script. The PGlite DB sometimes needs ~3 s to warm up.
- The `+` in `?horizon=H+15` must be URL-encoded as `%2B`.
- The browser cache can hold an old page after a hot-reload — use
  Ctrl + Shift + R.
