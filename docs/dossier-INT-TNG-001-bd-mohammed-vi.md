# STLS – Smart Traffic Light System

## DOSSIER CARREFOUR INT-TNG-001 : Bd Mohammed VI / Av. d'Espagne

---

## 1. Page de garde

| | |
|---|---|
| **Projet** | STLS – Smart Traffic Light System |
| **Carrefour** | INT-TNG-001 — Bd Mohammed VI × Av. d'Espagne |
| **Quartier** | Marshan, Tanger |
| **Coordonnées** | 35.784900 N, −5.813600 W |
| **Maître d'ouvrage** | _Commune de Tanger – Service Mobilité_ |
| **Maître d'œuvre** | _Bureau d'études STLS_ |
| **Entreprise** | _STLS Engineering_ |
| **Code document** | STLS-DOE-RGL-TNG-001-A |
| **Date d'émission** | 11/05/2026 |
| **Indice** | A |
| **Modification** | Première émission |
| **Rédacteur** | A. Karim — Studio Engineer |
| **Vérificateur** | _Chef de projet régulation_ |
| **Approbateur** | _Directeur technique mobilité_ |
| **Classement GED** | STLS / TNG / INT-001 / DOE / RGL |

### Codification GED

| Champ | Valeur | Description |
|---|---|---|
| Projet | STLS | Smart Traffic Light System |
| Site | TNG | Tanger |
| Sous-ensemble | INT-001 | Carrefour n° 001 |
| Phase | DOE | Dossier d'Ouvrage Exécuté |
| Type | RGL | Régulation |
| Indice | A | Première émission |

### Historique des révisions

| Indice | Date | Objet | Rédacteur | Vérificateur | Approbateur |
|:---:|---|---|---|---|---|
| A | 11/05/2026 | Première émission | A. Karim | _en attente_ | _en attente_ |

---

## 2. Sommaire

1. Page de garde
2. Sommaire
3. Plan de situation
4. Plan d'aménagement du carrefour
5. Détection
6. Interface système
7. Description physique
8. Fonctionnement
9. Phasage
10. Capacité
11. Diagrammes
12. Conditions de micro-régulation
13. Fonctionnements manuels
14. Affectation DIASER / API variables
15. Équipements

---

## 3. Plan de situation

Le carrefour **INT-TNG-001** est implanté à l'intersection du **Boulevard Mohammed VI** (axe principal Est–Ouest, classification voirie primaire) et de l'**Avenue d'Espagne** (axe secondaire Nord–Sud, classification voirie collectrice), dans le quartier de **Marshan** au sein de la commune de Tanger.

### 3.1 Localisation

| Donnée | Valeur |
|---|---|
| Commune | Tanger |
| Préfecture | Tanger-Assilah |
| Région | Tanger-Tétouan-Al Hoceïma |
| Quartier | Marshan |
| Latitude | 35.784900° N |
| Longitude | −5.813600° W |
| Altitude indicative | 75 m |
| Système de référence | WGS 84 |

### 3.2 Carrefours et contrôleurs voisins

À l'échelle du corridor Bd Mohammed VI, les équipements voisins (à intégrer ultérieurement dans le plan de coordination de feux) sont :

| Distance (m) | Carrefour | Type |
|---:|---|---|
| ~250 m Est | _À identifier_ — Bd Mohammed VI / Rue Ibn Sina | Carrefour à feux secondaire |
| ~400 m Ouest | _À identifier_ — Bd Mohammed VI / Av. Khalid Ibn Walid | Carrefour à feux secondaire |
| ~150 m Sud | _À identifier_ — Av. d'Espagne / Rue Imam Mouslim | Priorité à droite |

> _Image à insérer : capture Google Maps (vue satellite + vue plan) avec repérage des carrefours voisins et orientation Nord._
>
> _Fichier source attendu : `dossiers/INT-TNG-001/plan-situation.svg`._

### 3.3 Contexte trafic

Le carrefour s'inscrit dans un axe à dominante urbaine dense, supportant un trafic mixte (véhicules particuliers, transports en commun ponctuels, piétons fréquents en heures de pointe). Aucune ligne de tramway n'est exploitée sur cet axe au présent indice ; le scope est par conséquent **standard** (régulation VP + piéton).

---

## 4. Plan d'aménagement du carrefour

### 4.1 Géométrie générale

Le carrefour est de type **+ (cruciforme)** à quatre branches d'accès, raccordement classique sans îlot central. Les branches sont notées **N, S, E, W** dans le sens trigonométrique en partant du Nord.

| Branche | Direction | Fonction | Largeur chaussée (m) | Nbr de voies | Stationnement |
|:---:|---|---|:---:|:---:|:---:|
| N | Av. d'Espagne — Nord | Entrée + sortie | 7.0 | 1 + 1 | Non |
| S | Av. d'Espagne — Sud | Entrée + sortie | 7.0 | 1 + 1 | Non |
| E | Bd Mohammed VI — Est | Entrée + sortie | 10.5 | 2 + 2 | Non |
| W | Bd Mohammed VI — Ouest | Entrée + sortie | 10.5 | 2 + 2 | Non |

### 4.2 Voies de circulation par approche

| Approche | Code voie | Mouvements autorisés |
|---|:---:|---|
| Est (entrée) | E1 | Tout droit + tourne-à-droite |
| Est (entrée) | E2 | Tourne-à-gauche |
| Ouest (entrée) | W1 | Tout droit + tourne-à-droite |
| Ouest (entrée) | W2 | Tourne-à-gauche |
| Nord (entrée) | N1 | Tout droit + tourne-à-droite |
| Sud (entrée) | S1 | Tout droit + tourne-à-droite |

### 4.3 Traversées piétonnes

| Code | Branche traversée | Type | Distance traversée (m) | Refuge central |
|:---:|---|---|:---:|:---:|
| P-NS | Av. d'Espagne (S) | Marquée 2 + 2 zébrures | 7.0 | Non |
| P-EW | Bd Mohammed VI (W) | Marquée 2 + 2 zébrures | 10.5 | Oui (1.50 m) |
| P-NS2 | Av. d'Espagne (N) | Marquée 2 + 2 zébrures | 7.0 | Non |
| P-EW2 | Bd Mohammed VI (E) | Marquée 2 + 2 zébrures | 10.5 | Oui (1.50 m) |

### 4.4 Inventaire des feux

| Code | Type | Approche | Mouvements desservis | Hauteur (m) | Support |
|:---:|---|---|---|:---:|---|
| V1 | Tricolore Ø200 | E | Tout droit + droite | 3.50 | Potence |
| V2 | Tricolore Ø200 | E | Tourne-à-gauche | 3.50 | Potence |
| V3 | Tricolore Ø200 | W | Tout droit + droite | 3.50 | Potence |
| V4 | Tricolore Ø200 | W | Tourne-à-gauche | 3.50 | Potence |
| V5 | Tricolore Ø200 | N | Tout droit + droite | 3.50 | Mât simple |
| V6 | Tricolore Ø200 | S | Tout droit + droite | 3.50 | Mât simple |
| P1 | Piéton Ø200 + son | P-NS | — | 2.50 | Mât simple |
| P2 | Piéton Ø200 + son | P-EW | — | 2.50 | Mât simple |
| P3 | Piéton Ø200 + son | P-NS2 | — | 2.50 | Mât simple |
| P4 | Piéton Ø200 + son | P-EW2 | — | 2.50 | Mât simple |

> _Image à insérer : Plan d'aménagement échelle 1/200 (DXF + PDF) — couches : voirie, marquage, traversées piétonnes, supports de feux, chambres, fourreaux._
>
> _Fichier source attendu : `dossiers/INT-TNG-001/plan-amenagement.dxf`._

---

## 5. Détection

### 5.1 Détection véhicules

La détection véhicules est assurée par boucles inductives noyées dans la chaussée, dimensionnées pour les sollicitations d'extension de phase et de comptage entrant requis par le mode adaptatif et le moteur d'intelligence STLS.

| Code boucle | Voie desservie | Type | Position | Fonction principale |
|:---:|:---:|---|---|---|
| BCL-E1 | E1 | 1.5 m × 2.0 m | Présence + 25 m amont | Présence + prolongation vert |
| BCL-E2 | E2 | 1.5 m × 2.0 m | Présence + 25 m amont | Présence (tourne-à-gauche) |
| BCL-W1 | W1 | 1.5 m × 2.0 m | Présence + 25 m amont | Présence + prolongation vert |
| BCL-W2 | W2 | 1.5 m × 2.0 m | Présence + 25 m amont | Présence (tourne-à-gauche) |
| BCL-N1 | N1 | 1.5 m × 2.0 m | Présence + 15 m amont | Présence + appel de phase |
| BCL-S1 | S1 | 1.5 m × 2.0 m | Présence + 15 m amont | Présence + appel de phase |

### 5.2 Détection piétons

| Code | Branche | Type | Mode d'appel |
|:---:|---|---|---|
| BP-P1 | P-NS | Bouton-poussoir piéton illuminé | Appel manuel |
| BP-P2 | P-EW | Bouton-poussoir piéton illuminé | Appel manuel |
| BP-P3 | P-NS2 | Bouton-poussoir piéton illuminé | Appel manuel |
| BP-P4 | P-EW2 | Bouton-poussoir piéton illuminé | Appel manuel |

Chaque bouton-poussoir est doté d'un retour visuel ("appel enregistré") conforme aux préconisations d'accessibilité PMR ; la durée minimale de vert piéton est dimensionnée pour une vitesse de marche de 1.0 m/s.

### 5.3 Priorité véhicules d'urgence / police

L'intégration des véhicules prioritaires (police, SAMU, protection civile) s'effectue par l'**Agent EmergencyVehicleAgent** du moteur STLS (voir §6), lequel peut forcer un couloir vert sur réception d'un évènement signé par la centrale opérateur. À ce stade, aucune détection physique (gyrophare optique, RFID embarqué) n'est déployée sur le carrefour ; l'appel transite par l'**API d'override** sécurisée par signature HMAC.

### 5.4 Priorité tramway / bus (optionnel)

Non applicable au présent indice (aucune ligne de TC en site propre desservant le carrefour). Une réserve de codification SigFer est néanmoins maintenue pour une éventuelle évolution.

### 5.5 Zones de détection — synthèse

| ID | Code | Type | Coordonnées (X, Y) m | Surface utile (m²) |
|:---:|:---:|---|:---:|:---:|
| 1 | BCL-E1 | Boucle inductive | (+12.0, +1.7) | 3.00 |
| 2 | BCL-E2 | Boucle inductive | (+12.0, +5.0) | 3.00 |
| 3 | BCL-W1 | Boucle inductive | (−12.0, −1.7) | 3.00 |
| 4 | BCL-W2 | Boucle inductive | (−12.0, −5.0) | 3.00 |
| 5 | BCL-N1 | Boucle inductive | (0.0, +12.0) | 3.00 |
| 6 | BCL-S1 | Boucle inductive | (0.0, −12.0) | 3.00 |
| 7 | BP-P1 | BP piéton | (+5.0, −1.0) | — |
| 8 | BP-P2 | BP piéton | (+1.0, −5.0) | — |
| 9 | BP-P3 | BP piéton | (−5.0, +1.0) | — |
| 10 | BP-P4 | BP piéton | (−1.0, +5.0) | — |

Repère origine (0, 0) : centre géométrique du carrefour, axe X aligné Est positif, axe Y aligné Nord positif.

---

## 6. Interface système

Le carrefour INT-TNG-001 est piloté par l'architecture distribuée STLS, qui sépare strictement la **décision** (couche IA + opérateur) de l'**exécution** (couche contrôleur de feux). Cette section décrit les interfaces logicielles entre les couches.

### 6.1 Architecture générale

```
                ┌──────────────────────────────────────┐
                │  Dashboard opérateur (Next.js / web) │
                │  · supervision temps réel            │
                │  · interface police / manuel         │
                └─────────────┬────────────────────────┘
                              │ HTTPS + WebSocket
                ┌─────────────▼────────────────────────┐
                │  Backend STLS (NestJS / PostgreSQL)  │
                │  · API REST + auth JWT               │
                │  · Agents IA (city, zone, inter.)    │
                │  · Validation commandes              │
                │  · Audit lifecycle                   │
                └─────────────┬────────────────────────┘
                              │ HTTP + HMAC signé
                ┌─────────────▼────────────────────────┐
                │  Controller-runtime (Go, on-site)    │
                │  · State machine                     │
                │  · Watchdog + heartbeat              │
                │  · Vérification HMAC                 │
                │  · Mode offline autonome             │
                └─────────────┬────────────────────────┘
                              │ GPIO / Modbus / série
                ┌─────────────▼────────────────────────┐
                │  Contrôleur de feux (ATC INT-TNG-001)│
                │  · Sorties feux (relais SSR)         │
                │  · Entrées boucles + BP              │
                │  · Alimentation + secours            │
                └──────────────────────────────────────┘
```

### 6.2 Interfaces principales

| Interface | Direction | Protocole | Authentification | Description |
|---|---|---|---|---|
| Opérateur → Backend | ↓ | HTTPS / REST | JWT + permission `intersections.command` | Soumission d'overrides manuels et de plans |
| Backend → Opérateur | ↑ | WebSocket | JWT + scope ressource | Diffusion temps réel des évènements |
| Agents IA → Backend | ↔ | Intra-process | Aucun (même process) | Décisions de régulation, requêtes de prédiction |
| Backend → Controller-runtime | ↓ | HTTPS / REST | HMAC SHA-256 sur payload | Commandes signées, expirables |
| Controller-runtime → Backend | ↑ | HTTPS / REST | HMAC SHA-256 + nonce | Heartbeat, télémetrie, ACK commande |
| Controller-runtime → Hardware | ↓ | GPIO / Modbus | — | Application physique des phases |

### 6.3 Cycle de vie d'une commande

Toute commande à destination du contrôleur suit le cycle de vie suivant (table `traffic_commands` + audit `audit_logs`) :

1. **queued** — Décision validée par un agent ou un opérateur, commande mise en file.
2. **dispatched** — Le poller du controller-runtime a tiré la commande, dispatch lancé.
3. **acknowledged** — Le matériel a confirmé l'application (signal de retour SSR ou ACK contrôleur).
4. **failed** — Échec d'application (retour `ok:false` du driver), avec note d'échec horodatée.
5. **superseded** — Commande remplacée par une commande plus prioritaire avant exécution.

À chaque transition, une entrée d'audit est inscrite avec : auteur, scope, payload résumé, résultat, latence.

### 6.4 Validation des commandes

Avant `queued`, toute commande passe les vérifications suivantes :

- **Conformité au scope** — la cible appartient bien au périmètre opérateur (carrefour, zone ou ville).
- **Vérification de conflit** — la phase forcée n'entre pas en conflit avec une phase active selon la matrice §9.4.
- **Limites temporelles** — `recommendedHoldSeconds` est dans la plage configurée (5 à 60 s).
- **Vérification d'override** — le mode actuel autorise la commande (un mode `manual` opérateur bloque les agents IA).
- **Signature HMAC** — pour les commandes provenant du backend vers le runtime, signature et nonce vérifiés.

---

## 7. Description physique

### 7.1 Affectation des entrées contrôleur

Les entrées du contrôleur reçoivent les signaux des boucles, des boutons-poussoirs et des entrées système (heure, sélecteurs, watchdog). 24 entrées disponibles, 12 utilisées au présent indice.

| Entrée n° | Code source | Type signal | Niveau actif | Fonction | Filtrage |
|:---:|:---:|---|:---:|---|---|
| IN-01 | BCL-E1 | Tout-ou-rien | NF (boucle libre) | Présence E1 | 50 ms |
| IN-02 | BCL-E2 | Tout-ou-rien | NF | Présence E2 | 50 ms |
| IN-03 | BCL-W1 | Tout-ou-rien | NF | Présence W1 | 50 ms |
| IN-04 | BCL-W2 | Tout-ou-rien | NF | Présence W2 | 50 ms |
| IN-05 | BCL-N1 | Tout-ou-rien | NF | Présence N1 | 50 ms |
| IN-06 | BCL-S1 | Tout-ou-rien | NF | Présence S1 | 50 ms |
| IN-07 | BP-P1 | Impulsion | NO | Appel piéton P-NS | 100 ms |
| IN-08 | BP-P2 | Impulsion | NO | Appel piéton P-EW | 100 ms |
| IN-09 | BP-P3 | Impulsion | NO | Appel piéton P-NS2 | 100 ms |
| IN-10 | BP-P4 | Impulsion | NO | Appel piéton P-EW2 | 100 ms |
| IN-11 | SEL-MAN | Tout-ou-rien | NO | Sélecteur mode manuel (armoire) | — |
| IN-12 | WDG-IN | Front | — | Retour watchdog | — |
| IN-13 à IN-24 | RÉS | — | — | _Réserve d'évolution_ | — |

### 7.2 Affectation des sorties contrôleur

24 sorties relais SSR ; les 16 premières servent aux feux, les suivantes au contrôle système (clignotant, défaut, retour état).

| Sortie n° | Lampe | Feu | Couleur | Charge nominale (W) |
|:---:|:---:|:---:|:---:|:---:|
| OUT-01 | L1 | V1 | Rouge | 60 |
| OUT-02 | L2 | V1 | Jaune | 60 |
| OUT-03 | L3 | V1 | Vert | 60 |
| OUT-04 | L4 | V2 | Rouge | 60 |
| OUT-05 | L5 | V2 | Jaune | 60 |
| OUT-06 | L6 | V2 | Vert + flèche gauche | 60 |
| OUT-07 | L7 | V3 | Rouge | 60 |
| OUT-08 | L8 | V3 | Jaune | 60 |
| OUT-09 | L9 | V3 | Vert | 60 |
| OUT-10 | L10 | V4 | Rouge | 60 |
| OUT-11 | L11 | V4 | Jaune | 60 |
| OUT-12 | L12 | V4 | Vert + flèche gauche | 60 |
| OUT-13 | L13 | V5 | Rouge | 60 |
| OUT-14 | L14 | V5 | Jaune | 60 |
| OUT-15 | L15 | V5 | Vert | 60 |
| OUT-16 | L16 | V6 | Rouge + Jaune + Vert (multiplex) | 60 |
| OUT-17 | LP1 | P1 | Rouge piéton | 25 |
| OUT-18 | LP2 | P1 | Vert piéton | 25 |
| OUT-19 | LP3 | P2 | Rouge piéton | 25 |
| OUT-20 | LP4 | P2 | Vert piéton | 25 |
| OUT-21 | — | — | Retour défaut centrale | 5 |
| OUT-22 | — | — | Voyant "manuel armé" | 5 |
| OUT-23 | — | — | Test lampes (toutes rouges) | — |
| OUT-24 | RÉS | — | _Réserve_ | — |

### 7.3 Affectation des lignes de feux

Mapping lampe ↔ ligne ↔ feu, utilisé pour la maintenance et la vérification au cahier de recettes.

| Ligne n° | Code feu | Type | Mouvement |
|:---:|:---:|---|---|
| 1 | V1 | VP | E — tout droit + droite |
| 2 | V2 | VP | E — gauche |
| 3 | V3 | VP | W — tout droit + droite |
| 4 | V4 | VP | W — gauche |
| 5 | V5 | VP | N — tout droit + droite |
| 6 | V6 | VP | S — tout droit + droite |
| 7 | P1 | PIE | Traversée P-NS |
| 8 | P2 | PIE | Traversée P-EW |
| 9 | P3 | PIE | Traversée P-NS2 |
| 10 | P4 | PIE | Traversée P-EW2 |

### 7.4 Capteurs et caméras

Aucune caméra de comptage n'est installée au présent indice. Une réserve de prises RJ-45 + alimentation PoE est posée sur la potence Est pour intégration ultérieure.

### 7.5 Équipement contrôleur

| Équipement | Référence | Quantité | Localisation |
|---|---|:---:|---|
| Contrôleur | ATC INT-TNG-001 (firmware v1.0.0) | 1 | Armoire trottoir Sud-Est |
| Carte d'extension E/S | ATC-IO-24 | 1 | Armoire |
| Convertisseur RS-485 / Ethernet | _selon offre_ | 1 | Armoire |
| Watchdog hardware | Intégré au contrôleur | 1 | — |

### 7.6 Réseau / IP

| Élément | Adresse | VLAN | Description |
|---|---|:---:|---|
| Contrôleur ATC | _à attribuer (DHCP réservé)_ | 41 | Plan IP STLS / Tanger |
| Controller-runtime (RPi local) | 192.168.41.10 | 41 | Service Go on-site |
| Lien WAN (4G / fibre) | _IP opérateur_ | — | Tunnel WireGuard vers backend cloud |
| Backend STLS (cloud) | api.stls.local | — | Endpoint REST + WebSocket |

### 7.7 Alimentation et secours

| Élément | Valeur | Commentaire |
|---|---|---|
| Tension réseau | 230 V AC ± 10 %, 50 Hz | Branchement disjoncteur 32 A dédié |
| Protection amont | Disjoncteur différentiel 30 mA | Conforme NF C 15-100 |
| Onduleur (UPS) | 1500 VA, autonomie ≥ 30 min | Marque _à valider_ |
| Battery-backed contrôleur | Non | Repli sur clignotant jaune si secteur HS > 5 s |
| Repli sur perte secteur | Clignotant orange autonome | Câblage hard-wired indépendant du contrôleur |
| Mise à la terre | < 5 Ω | Mesure systématique en recette |

---

## 8. Fonctionnement

### 8.1 Principe général

Le carrefour fonctionne en boucle fermée à plusieurs niveaux :

- **Niveau local** : cycle de feux exécuté par le contrôleur ATC selon le plan actif, avec lecture des entrées en temps réel pour les actions de prolongation / appel.
- **Niveau site (controller-runtime)** : surveillance, watchdog, application des commandes signées du backend, fallback autonome si le backend est injoignable.
- **Niveau supervision (backend + IA)** : adaptation en continu du plan de feux selon le contexte (heure, saturation, demande piétonne, incidents), validation des commandes opérateur, conservation des audits.

### 8.2 Mode normal — cycle fixe

Plan de feux à cycle fixe de 90 s, déployé en heures creuses (HC) et utilisé comme mode de référence pour la recette du carrefour. La séquence détaillée est décrite au §9.

| Paramètre | Valeur |
|---|---|
| Cycle total | 90 s |
| Phase 1 (E–W) vert | 32 s |
| Interphase 1 → 2 | 5 s (3 jaune + 2 all-red) |
| Phase 2 (E–W gauche) vert | 12 s |
| Interphase 2 → 3 | 5 s |
| Phase 3 (N–S) vert | 26 s |
| Interphase 3 → 1 | 5 s |
| Vert piéton P-EW | 18 s (en phase 1) |
| Vert piéton P-NS | 14 s (en phase 3) |

### 8.3 Mode adaptatif

Le mode adaptatif (sélectionné par défaut hors HC) ajuste les durées de vert ±20 % autour des valeurs nominales selon trois signaux :

- **Demande détectée** (boucle BCL-* active dans les 3 dernières secondes) → prolongation de phase jusqu'à `maxGreen`.
- **Appel piéton** (BP-P*) → garantie d'au moins un vert piéton dans le cycle suivant.
- **Décision IA agent (`IntersectionManagerAgent`)** → recommandation de cycle ou de split, validée par les contraintes locales du contrôleur.

### 8.4 Mode police / manuel

Activable depuis le tableau de bord opérateur ou par sélecteur physique en armoire (entrée IN-11). Suspend toute décision automatique ; l'opérateur sélectionne la phase active via les boutons "Force phase" (ph-1 / ph-2 / ph-3) du panneau de contrôle. Une commande d'override est inscrite en audit avec auteur, durée et motif.

### 8.5 Mode urgence

Déclenché par l'agent `EmergencyVehicleAgent` ou par un opérateur ayant la permission `emergency.override`. Le carrefour bascule en couloir vert sur la branche désignée pour une durée bornée (≤ 60 s), interphase minimale incluse, puis retour à un cycle de récupération.

### 8.6 Mode dégradé / fallback

| Évènement déclencheur | Comportement |
|---|---|
| Perte de communication backend > 30 s | Le controller-runtime applique le dernier plan validé en autonomie, journalise localement. |
| Perte de communication runtime > 60 s | Le contrôleur ATC bascule en cycle fixe HC. |
| Défaut alimentation > 5 s | Bascule sur clignotant orange autonome (câblage indépendant). |
| Détecteur en défaut | La voie est traitée comme "demande continue" (sécurité). |
| Bouton-poussoir en défaut | Le BP est ignoré ; un vert piéton est garanti à chaque cycle. |

### 8.7 Mode régulation assistée par IA

Le `CityTrafficManagerAgent` peut recommander :

- Un changement de plan de feux (HPM / HPS / HC / HM) selon l'horaire et la saturation observée.
- Un offset coordonné avec les carrefours voisins du corridor Mohammed VI.
- Une priorité passagère sur une branche en cas d'incident en aval.

Toutes ces recommandations sont **proposées**, jamais imposées : elles transitent par le contrôleur de validation (§6.4) et peuvent être bloquées par le mode manuel.

---

## 9. Phasage

### 9.1 Définition des phases

Le carrefour comporte **3 phases véhicules** et **2 phases piétons concomitantes**.

| Phase | Mouvements véhicules | Mouvements piétons | Compatibilité |
|:---:|---|---|---|
| **Phase 1** | E + W tout droit + droite | P-EW + P-EW2 (vert piéton) | Mouvements concourants non conflictuels |
| **Phase 2** | E + W tourne-à-gauche | — | Mouvements protégés |
| **Phase 3** | N + S tout droit + droite | P-NS + P-NS2 (vert piéton) | Mouvements concourants non conflictuels |

### 9.2 Interphases

| De → Vers | Durée jaune | Durée all-red | Durée totale |
|:---:|:---:|:---:|:---:|
| Phase 1 → Phase 2 | 3 s | 2 s | 5 s |
| Phase 2 → Phase 3 | 3 s | 2 s | 5 s |
| Phase 3 → Phase 1 | 3 s | 2 s | 5 s |

L'all-red garantit l'évacuation complète des véhicules engagés à 50 km/h sur la branche la plus longue (10.5 m de chaussée + 2.0 m de marge = 12.5 m ⇒ 0.9 s effectif). La valeur retenue de 2 s offre une marge de sécurité confortable.

### 9.3 Temps de vert mini / maxi

| Phase | Vert min (s) | Vert max (s) | Vert recommandé HC (s) | Vert recommandé HPM (s) |
|:---:|:---:|:---:|:---:|:---:|
| Phase 1 | 18 | 50 | 32 | 45 |
| Phase 2 | 8 | 25 | 12 | 18 |
| Phase 3 | 14 | 40 | 26 | 35 |

### 9.4 Matrice de conflit

Lecture : `✕` = phases incompatibles (jamais simultanées), `●` = phases compatibles, `–` = sans objet.

| | Ph.1 | Ph.2 | Ph.3 | P-EW | P-NS |
|:---:|:---:|:---:|:---:|:---:|:---:|
| **Ph.1** | – | ✕ | ✕ | ● | ✕ |
| **Ph.2** | ✕ | – | ✕ | ✕ | ✕ |
| **Ph.3** | ✕ | ✕ | – | ✕ | ● |
| **P-EW** | ● | ✕ | ✕ | – | ✕ |
| **P-NS** | ✕ | ✕ | ● | ✕ | – |

### 9.5 Règles de sécurité

- Jamais deux phases véhicules conflictuelles allumées en vert simultanément.
- Vert piéton interdit conjointement à une phase véhicule traversant le passage piéton concerné.
- Tout passage entre deux phases conflictuelles passe obligatoirement par l'interphase complète (jaune + all-red).
- En cas d'incohérence détectée (deux verts conflictuels), bascule clignotant orange et alerte critique.

---

## 10. Capacité

### 10.1 Hypothèses de trafic (campagne de relevés _à conduire_)

| Direction | Heure de pointe matin (HPM) — véh/h | Heure de pointe soir (HPS) — véh/h | Hors-pointe (HC) — véh/h |
|---|:---:|:---:|:---:|
| E → W | 950 | 1 020 | 410 |
| W → E | 880 | 980 | 380 |
| N → S | 220 | 240 | 95 |
| S → N | 240 | 260 | 100 |
| E ↑ gauche | 150 | 170 | 60 |
| W ↑ gauche | 170 | 180 | 70 |

> _Les valeurs ci-dessus sont indicatives et destinées à être remplacées par les comptages issus de la campagne de relevés terrain (24 h ouvré + samedi)._

### 10.2 Saturation et capacité de réserve

Calcul HPM, débit de saturation nominal **1 800 véh/h/voie** pour voie large urbaine, ajusté à 1 700 véh/h/voie pour les tourne-à-gauche en raison du temps perdu.

| Approche | Demande HPM (véh/h) | Voies équivalentes | Capacité offerte (véh/h) | Taux saturation |
|---|:---:|:---:|:---:|:---:|
| E tout droit + droite | 950 | 1.6 (45 s vert × 1 800 / 90 s) | 1 440 | **66 %** |
| W tout droit + droite | 880 | 1.6 | 1 440 | **61 %** |
| E gauche | 150 | 0.36 (18 s vert × 1 700 / 90 s) | 340 | **44 %** |
| W gauche | 170 | 0.36 | 340 | **50 %** |
| N + S | 460 | 0.78 (35 s vert × 1 800 / 90 s) | 700 | **66 %** |

### 10.3 Files d'attente et délais (estimation Webster)

| Approche | Délai moyen estimé (s) | File 95 % (m) |
|---|:---:|:---:|
| E tout droit | 24 | 35 |
| W tout droit | 22 | 32 |
| E gauche | 38 | 18 |
| W gauche | 42 | 22 |
| N + S | 28 | 16 |

### 10.4 Conclusion

Le dimensionnement HPM offre une réserve moyenne de **34 %** en capacité, ce qui permet d'absorber les variations saisonnières et la croissance trafic (≤ 3 % / an sur l'horizon 5 ans). Le mode adaptatif et la régulation IA pourront récupérer du vert sur les phases sous-utilisées en HC pour améliorer les délais piétons.

---

## 11. Diagrammes

### 11.1 Plan normal (HC, cycle 90 s)

```
Phase 1 (E/W TD+D)  ████████████████████████ 32s 
Interphase 1→2          ▒▒▒▒▒ 5s
Phase 2 (E/W gauche)              ████████ 12s
Interphase 2→3                            ▒▒▒▒▒ 5s
Phase 3 (N/S)                                  ████████████████ 26s
Interphase 3→1                                                  ▒▒▒▒▒ 5s
```

### 11.2 Plan HPM (cycle 120 s)

```
Phase 1 (E/W TD+D)  ██████████████████████████████ 45s 
Interphase 1→2                                    ▒▒▒▒▒ 5s
Phase 2 (E/W gauche)                                       ████████████ 18s
Interphase 2→3                                                          ▒▒▒▒▒ 5s
Phase 3 (N/S)                                                                ████████████████████████ 35s
Interphase 3→1                                                                                       ▒▒▒▒▒ 5s
Marge adaptation                                                                                            ███ 7s
```

### 11.3 Plan d'urgence (couloir vert axe principal)

```
Phase forcée 1 (E/W TD+D)  ████████████████████████████████████████████████ 60s max
Bouclage retour cycle normal au prochain point bas du cycle.
```

### 11.4 Plan dégradé (clignotant orange autonome)

```
Toutes lampes véhicules :   ██  ░░  ██  ░░  ██  ░░  ██  ░░  ...  (50 % cyclique 1 Hz)
Lampes piétons :            éteintes
```

> _Diagrammes finaux à insérer en format vectoriel (`dossiers/INT-TNG-001/timing-diagrams.svg`)._

---

## 12. Conditions de micro-régulation

### 12.1 Prolongation de vert

Une phase peut être prolongée tant que :

- Une boucle de présence est active dans la voie concernée, **ET**
- Le vert courant est **strictement inférieur** au vert maximum de la phase, **ET**
- Aucun appel piéton ne fait passer le temps d'attente piéton au-delà de la consigne (60 s en HPM, 45 s en HC).

Pas d'incrément : **2 s par activation** de boucle, jusqu'au plafond `maxGreen`.

### 12.2 Raccourcissement de vert

Le vert d'une phase peut être raccourci si :

- Aucune boucle de présence n'a été activée pendant 4 s consécutives sur les voies concernées, **ET**
- Le vert minimum a été dépassé, **ET**
- Au moins un appel piéton ou véhicule est en attente sur une autre branche.

### 12.3 Conditions d'application des commandes IA

Une recommandation IA est appliquée si **toutes** les conditions suivantes sont vérifiées :

| Vérification | Critère |
|---|---|
| Authentification | Décision portée par un agent enregistré (ID + horodatage) |
| Périmètre | `scope` de la décision ⊆ scope du carrefour |
| Cohérence matrice | Phase recommandée ∈ matrice de conflit §9.4 |
| Borne temporelle | Durée recommandée ∈ [vert_min, vert_max] de la phase |
| Verrou opérateur | Aucun mode `manual` ou `emergency` actif |
| Disponibilité contrôleur | `connectionState` ≠ `offline` |
| Fenêtre TTL | Commande appliquée dans les 30 s suivant émission |

### 12.4 Contraintes de sécurité non négociables

- Vert minimum véhicule : 8 s (jamais raccourci, même sur commande IA ou opérateur).
- Vert piéton minimum : dimensionné sur 1.0 m/s + 4 s d'avertissement clignotant.
- Interphase complète obligatoire entre toute paire de phases conflictuelles.
- Pas de saut de phase autorisé entre deux phases véhicules sans passage par all-red.

---

## 13. Fonctionnements manuels

### 13.1 Sélection manuelle de phase (police)

L'opérateur dispose des actions suivantes depuis le panneau "Operator Control" du dashboard :

| Action | Effet | Audit |
|---|---|---|
| `Force phase ph-1` | Bascule en Phase 1 (E/W tout droit) après interphase | Inscription `override-command` |
| `Force phase ph-2` | Bascule en Phase 2 (E/W gauche) après interphase | Idem |
| `Force phase ph-3` | Bascule en Phase 3 (N/S) après interphase | Idem |
| `Force green N/S/E/W` | Vert sur direction désignée pour 30 s par défaut (configurable) | Idem + journal motif |
| `Release override` | Libère le contrôle manuel ; reprise progressive du mode automatique | Idem |

### 13.2 Couloir d'urgence

Activable par opérateur autorisé (permission `emergency.override`) ou par l'agent IA `EmergencyVehicleAgent`. Force le vert sur la branche désignée, durée bornée 60 s maximum. Une notification est diffusée à toute la chaîne de supervision.

### 13.3 Comportement de repli

| Évènement | Comportement |
|---|---|
| Perte télécommande > 30 s | Reprise du dernier plan automatique sain |
| Refus d'override par le contrôleur | Retour mode adaptatif + alerte critique opérateur |
| Override expiré (TTL atteint) | Retour automatique au plan en cours, journalisation |
| Conflit détecté en run-time | Bascule clignotant orange, alerte critique, blocage du mode auto jusqu'à acquittement |

---

## 14. Affectation DIASER / API variables

L'organisation des variables suit la convention DIASER (Description Intégrée des Asservissements Signalisation Et Régulation) adaptée au modèle STLS, avec une mappe directe vers les variables API du backend.

### 14.1 Entrées (`I_*`)

| Code DIASER | Source physique | Type | Description |
|:---:|:---:|:---:|---|
| I_BCL_E1 | IN-01 | BOOL | Présence boucle E1 |
| I_BCL_E2 | IN-02 | BOOL | Présence boucle E2 |
| I_BCL_W1 | IN-03 | BOOL | Présence boucle W1 |
| I_BCL_W2 | IN-04 | BOOL | Présence boucle W2 |
| I_BCL_N1 | IN-05 | BOOL | Présence boucle N1 |
| I_BCL_S1 | IN-06 | BOOL | Présence boucle S1 |
| I_BP_P1 | IN-07 | BOOL impuls. | Appel piéton P-NS |
| I_BP_P2 | IN-08 | BOOL impuls. | Appel piéton P-EW |
| I_BP_P3 | IN-09 | BOOL impuls. | Appel piéton P-NS2 |
| I_BP_P4 | IN-10 | BOOL impuls. | Appel piéton P-EW2 |
| I_SEL_MAN | IN-11 | BOOL | Sélecteur manuel armoire |
| I_WDG_RET | IN-12 | BOOL | Retour watchdog |

### 14.2 Sorties (`O_*`)

| Code DIASER | Destination physique | Type | Description |
|:---:|:---:|:---:|---|
| O_V1_R / O_V1_J / O_V1_V | OUT-01 / 02 / 03 | BOOL | Feu V1 (rouge / jaune / vert) |
| O_V2_R / O_V2_J / O_V2_V | OUT-04 / 05 / 06 | BOOL | Feu V2 |
| O_V3_R / O_V3_J / O_V3_V | OUT-07 / 08 / 09 | BOOL | Feu V3 |
| O_V4_R / O_V4_J / O_V4_V | OUT-10 / 11 / 12 | BOOL | Feu V4 |
| O_V5_R / O_V5_J / O_V5_V | OUT-13 / 14 / 15 | BOOL | Feu V5 |
| O_V6_TOUT | OUT-16 | BYTE | Feu V6 multiplexé |
| O_P1_R / O_P1_V | OUT-17 / 18 | BOOL | Piéton P1 |
| O_P2_R / O_P2_V | OUT-19 / 20 | BOOL | Piéton P2 |
| O_DEF | OUT-21 | BOOL | Retour défaut centrale |
| O_MAN_VOY | OUT-22 | BOOL | Voyant manuel armé |
| O_TEST | OUT-23 | BOOL | Test lampes |

### 14.3 Variables internes (`V_*`)

| Code | Type | Description |
|:---:|:---:|---|
| V_PHASE_ACT | INT | Numéro de phase en cours (1, 2, 3 ou 0 = transition) |
| V_VERT_RESTANT | INT | Temps de vert restant en secondes |
| V_CYCLE_NUM | INT | Numéro de cycle depuis dernier reset |
| V_PLAN_ACTIF | STRING | Code plan actif (HC / HPM / HPS / HM / MAN / URG / DGR) |
| V_DEMANDE_PIE | BITMAP | Bitmap d'appels piétons (P1..P4) |
| V_OVERRIDE_ID | UUID | ID d'override en cours, null si automatique |

### 14.4 Variables de commande (`C_*`)

| Code | Type | Description | Sortie matérielle |
|:---:|:---:|---|---|
| C_FORCE_PHASE | INT | Force phase 1, 2 ou 3 | Bascule de phase |
| C_PROLONG | INT | Prolongation en secondes | Ajout au vert courant |
| C_LIBERE | BOOL | Libère l'override courant | — |
| C_BASCULE_PLAN | STRING | Bascule plan (HPM/HPS/HC/HM) | — |
| C_TEST_LAMPES | BOOL | Lancer cycle test lampes | OUT-23 |

### 14.5 Variables d'état (`S_*`) — diffusées vers le backend

| Code | Type | Période | Description |
|:---:|:---:|:---:|---|
| S_HEARTBEAT | TIMESTAMP | 1 s | Date dernier heartbeat |
| S_PHASE_HISTO | ARRAY[10] | Sur évt | Dernières 10 transitions de phase |
| S_DEFAUTS | BITMAP | Sur évt | Bitmap défauts actifs (lampe, boucle, watchdog) |
| S_TELEMETRIE | OBJECT | 5 s | File, débit, saturation par branche |

Toutes les variables `S_*` sont transmises au backend STLS via l'API REST + WebSocket décrits au §6.2, et conservées dans la table `traffic_observations` pour l'apprentissage des agents IA.

---

## 15. Équipements

### 15.1 Liste détaillée

| Élément | Référence / Marque | Quantité | Caractéristiques principales | Localisation |
|---|---|:---:|---|---|
| Contrôleur de feux | ATC INT-TNG-001 | 1 | 24 entrées / 24 sorties SSR, ATC, firmware v1.0.0 | Armoire trottoir SE |
| Carte E/S | ATC-IO-24 | 1 | TOR 24 V DC | Armoire |
| Raspberry Pi / industrial PC | RPi 4 8 Go ou _équivalent industriel_ | 1 | Hôte du service `controller-runtime` (Go) | Armoire |
| ESP32 (prototype LED) | ESP32-DevKitC | 1 | Bench-test interne uniquement | Atelier STLS |
| Relais de puissance | Finder 39.61 ou éq. | 24 | SSR 230 V AC, 5 A, optoisolé | Fond armoire |
| Feux véhicules tricolores | LED 230 V Ø200 | 6 | Source LED haute luminosité, anti-fantôme | Potences + mâts |
| Feux piétons | LED 230 V Ø200 + son | 4 | Avec module sonore PMR | Mâts piétons |
| Boucles inductives | Cuivre émaillé 1.5 mm² | 6 | Boucles 1.5 × 2.0 m, 3 tours, scellées résine | Chaussée |
| Boutons-poussoirs piétons | BP NF illuminé | 4 | Retour visuel "appel enregistré" | Mâts piétons |
| Onduleur (UPS) | 1500 VA on-line | 1 | Autonomie ≥ 30 min charge nominale | Armoire |
| Disjoncteur tête | 32 A courbe C + diff. 30 mA | 1 | Conforme NF C 15-100 | Armoire |
| Switch industriel | 8 ports + 1 SFP | 1 | -40 °C / +75 °C | Armoire |
| Modem 4G de secours | _selon offre opérateur_ | 1 | Tunnel WireGuard vers backend | Armoire |
| Caméra de comptage | _réserve fourreau + PoE_ | 0 (réserve) | Évolution ultérieure | Potence Est |
| Mise à la terre | Piquets cuivre 1.5 m | 2 | < 5 Ω | Pied armoire |

### 15.2 Schéma armoire (synthétique)

```
┌────────────────────────────────────────────┐
│  Armoire trottoir SE — INT-TNG-001         │
│                                            │
│  ┌──────────┐  ┌────────────┐  ┌────────┐ │
│  │ Disj.    │  │  UPS 1.5   │  │ Switch │ │
│  │ tête     │→ │  kVA       │→ │ ind.   │ │
│  └──────────┘  └────┬───────┘  └────┬───┘ │
│                     │                │     │
│             ┌───────▼──────┐   ┌─────▼──┐ │
│             │  RPi 4 +     │←──│ Modem  │ │
│             │  runtime Go  │   │ 4G/WG  │ │
│             └───────┬──────┘   └────────┘ │
│                     │ GPIO/RS-485                 │
│             ┌───────▼──────┐                       │
│             │  ATC INT-001 │                       │
│             │  v1.0.0      │                       │
│             └─┬──────────┬─┘                       │
│      ┌────────┘          └─────────┐               │
│      │ Entrées             Sorties │               │
│      │ (boucles + BP)      (lampes)│               │
└──────┼───────────────────────────────────────────────┘
       │                              │
   ▼ Chaussée                     ▼ Lampes feux
```

> _Schéma armoire détaillé (DXF + nomenclature) à insérer en annexe._

### 15.3 Conditions environnementales

| Paramètre | Plage de fonctionnement |
|---|:---:|
| Température armoire | −10 °C à +50 °C |
| Humidité relative | ≤ 95 % sans condensation |
| Tenue IP armoire | IP54 |
| Tenue IK | IK10 |
| Plage tension secteur | 187–253 V AC |

---

### Fin du dossier — Indice A

> Document généré par le module **Étude carrefour AI** de STLS et complété manuellement. Les sections marquées _à valider_ ou _à conduire_ nécessitent confirmation terrain avant émission en indice B.
