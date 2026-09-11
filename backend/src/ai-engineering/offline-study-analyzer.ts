import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { StudyAnalyzerAdapter } from './study-analyzer.adapter';
import type {
  ApproachBearing,
  ProposalGenerationInput,
} from './proposal-types';
import type {
  ConflictPoint,
  DominantAxis,
  IntersectionClassification,
  IntersectionStudy,
  MapContext,
  ObservedApproach,
  ObservedCrossing,
  ObservedGeometry,
  ObservedPoi,
  ObservedTramLine,
  PedestrianExposure,
  StudyConfidence,
  StudyConstraint,
} from './study-types';

/**
 * Heuristic intersection study engine.
 *
 * When real geometry is supplied (OSM Overpass, DXF, …) the analyzer
 * derives its conclusions from the actual approaches, road classes,
 * lane counts, skew angles and nearby POIs. When the operator
 * provides only coordinates + scope + shape hint, the analyzer falls
 * back to a synthesised 4-branch baseline so the downstream pipeline
 * always has something to reason about.
 *
 * Outputs:
 *   - intersection classification + reason
 *   - 0-10 complexity score
 *   - dominant traffic axis
 *   - estimated pedestrian exposure
 *   - conflict-point map
 *   - engineering constraints (severity-tagged)
 *   - recommended strategy variants (ordered by fit)
 */
@Injectable()
export class OfflineStudyAnalyzer implements StudyAnalyzerAdapter {
  readonly mode = 'offline' as const;

  analyze(
    input: ProposalGenerationInput,
    geometry?: ObservedGeometry,
  ): Promise<IntersectionStudy> {
    const resolvedGeometry = geometry ?? this.synthesiseGeometry(input);
    const classification = this.classify(input, resolvedGeometry);
    const mapContext = this.detectMapContext(input, resolvedGeometry);
    const dominantAxis = this.findDominantAxis(resolvedGeometry);
    const conflicts = this.estimateConflicts(resolvedGeometry);
    const pedestrianExposure = this.estimatePedestrianExposure(
      input,
      resolvedGeometry,
      mapContext,
    );
    const constraints = this.detectConstraints(
      input,
      resolvedGeometry,
      classification,
      pedestrianExposure,
      conflicts,
      mapContext,
    );
    const complexity = this.scoreComplexity(
      input,
      resolvedGeometry,
      classification,
      constraints,
      pedestrianExposure,
    );
    const recommendedVariants = this.recommendVariants(
      input,
      classification,
      constraints,
      complexity.score,
    );
    const confidence = this.computeConfidence(
      geometry,
      classification,
      resolvedGeometry,
      mapContext,
    );

    const generatedAt = new Date();
    const expiresAt = new Date(generatedAt.getTime() + 30 * 60 * 1000);

    return Promise.resolve({
      id: `study_${randomUUID().slice(0, 8)}`,
      name: input.name,
      scope: input.scope,
      latitude: input.latitude,
      longitude: input.longitude,
      observedGeometry: resolvedGeometry,
      classification: classification.kind,
      classificationLabel: classification.label,
      classificationReason: classification.reason,
      mapContext,
      confidence,
      complexityScore: Math.round(complexity.score * 10) / 10,
      complexityBand: complexity.band,
      complexityDrivers: complexity.drivers,
      dominantAxis,
      pedestrianExposure,
      estimatedConflictPoints: conflicts.points,
      totalConflictWeight: conflicts.totalWeight,
      constraints,
      recommendedVariantCodes: recommendedVariants,
      generatedAt: generatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      source: geometry
        ? `offline:heuristic-v1 over ${geometry.source ?? 'observed-geometry'}`
        : 'offline:heuristic-v1 (synthetic-geometry)',
    });
  }

  // =================================================================
  // Geometry synthesis (when no real data is supplied)
  // =================================================================

  private synthesiseGeometry(input: ProposalGenerationInput): ObservedGeometry {
    const shape = input.shapeHint ?? 'cruciform';
    const isBoulevard = /\b(bd|boulevard|avenue)\b/i.test(input.name);
    const isTram = input.scope === 'tram';
    const isPlaza = shape === 'plaza' || /\b(pl\.?|place)\b/i.test(input.name);

    const approaches: ObservedApproach[] = [];
    const crossings: ObservedCrossing[] = [];

    if (shape === 'mini-roundabout' || shape === 'plaza') {
      // Build a more elaborate 4-leg or 5-leg synthetic
      const bearings: ApproachBearing[] = isPlaza
        ? ['N', 'E', 'SE', 'SW', 'W']
        : ['N', 'E', 'S', 'W'];
      for (const bearing of bearings) {
        approaches.push({
          bearing,
          bearingDegrees: this.bearingToDegrees(bearing),
          highwayClass: isBoulevard ? 'secondary' : 'tertiary',
          laneCount: 1,
          widthMeters: 7,
          oneWay: false,
        });
      }
    } else if (shape === 't-junction') {
      for (const bearing of ['E', 'W', 'S'] as ApproachBearing[]) {
        approaches.push({
          bearing,
          bearingDegrees: this.bearingToDegrees(bearing),
          highwayClass: isBoulevard ? 'primary' : 'secondary',
          laneCount: bearing === 'S' ? 1 : 2,
          widthMeters: bearing === 'S' ? 7 : 10.5,
          oneWay: false,
        });
      }
    } else if (shape === 'y-junction') {
      for (const bearing of ['NE', 'SE', 'W'] as ApproachBearing[]) {
        approaches.push({
          bearing,
          bearingDegrees: this.bearingToDegrees(bearing),
          highwayClass: 'secondary',
          laneCount: 1,
          widthMeters: 7,
          oneWay: false,
        });
      }
    } else {
      // cruciform default
      for (const bearing of ['N', 'E', 'S', 'W'] as ApproachBearing[]) {
        const onMainAxis = bearing === 'E' || bearing === 'W';
        approaches.push({
          bearing,
          bearingDegrees: this.bearingToDegrees(bearing),
          highwayClass:
            isBoulevard && onMainAxis
              ? 'primary'
              : onMainAxis
                ? 'secondary'
                : 'tertiary',
          laneCount: onMainAxis ? 2 : 1,
          widthMeters: onMainAxis ? 10.5 : 7,
          oneWay: false,
        });
      }
    }

    for (const approach of approaches) {
      crossings.push({
        type: 'zebra',
        approachBearing: approach.bearing,
        widthMeters: approach.widthMeters,
      });
    }

    const tramLines: ObservedTramLine[] = isTram
      ? [{ axisBearing: 'E', name: 'Ligne tramway (axe principal)' }]
      : [];

    const nearbyPoi: ObservedPoi[] = [];
    if (/\b(med|medina|m[éeè]dina)\b/i.test(input.name)) {
      nearbyPoi.push({ kind: 'market', distanceMeters: 80 });
      nearbyPoi.push({ kind: 'mosque', distanceMeters: 120 });
    }
    if (/\b(gare|station)\b/i.test(input.name)) {
      nearbyPoi.push({ kind: 'station', distanceMeters: 90 });
    }

    return {
      approaches,
      pedestrianCrossings: crossings,
      tramLines,
      nearbyPoi,
      source: 'synthetic-from-input',
    };
  }

  // =================================================================
  // Classification
  // =================================================================

  private classify(
    input: ProposalGenerationInput,
    geometry: ObservedGeometry,
  ): {
    kind: IntersectionClassification;
    label: string;
    reason: string;
  } {
    const approachCount = geometry.approaches.length;
    const hasTram = geometry.tramLines.length > 0 || input.scope === 'tram';
    const skewAngles = this.computeSkewSeverity(geometry.approaches);
    const hasBoulevard = geometry.approaches.some(
      (a) => a.highwayClass === 'primary' || a.highwayClass === 'trunk',
    );
    const isPedestrianHeavy = geometry.nearbyPoi.length >= 2;
    const shape = input.shapeHint;

    if (shape === 'mini-roundabout') {
      return {
        kind: 'mini-roundabout',
        label: 'Mini-giratoire',
        reason: `Topologie ${shape} déclarée. ${approachCount} branches détectées.`,
      };
    }
    if (shape === 'plaza' || approachCount >= 5) {
      return {
        kind: 'plaza',
        label: 'Place urbaine multi-branches',
        reason: `${approachCount} branches détectées — gestion multi-flux requise.`,
      };
    }
    if (hasTram) {
      return {
        kind: 'tramway-intersection',
        label: 'Carrefour intersecté par tramway',
        reason: `Présence de ligne TC en site propre (${geometry.tramLines[0]?.name ?? 'tramway'}). Priorité SigFer requise.`,
      };
    }
    if (approachCount === 3) {
      return {
        kind: 't-junction',
        label: 'Carrefour en T',
        reason: '3 approches détectées formant un T.',
      };
    }
    if (
      shape === 'y-junction' ||
      (approachCount === 3 && skewAngles.maxSkewDeg > 20)
    ) {
      return {
        kind: 'y-junction',
        label: 'Carrefour en Y (oblique)',
        reason: `Approches obliques (skew max ${skewAngles.maxSkewDeg.toFixed(0)}°).`,
      };
    }
    if (skewAngles.maxSkewDeg >= 15 && approachCount === 4) {
      return {
        kind: 'skewed-crossroad',
        label: 'Carrefour cruciforme oblique',
        reason: `Approches non orthogonales (skew max ${skewAngles.maxSkewDeg.toFixed(0)}° vs cardinal). Visibilité réduite.`,
      };
    }
    if (hasBoulevard && approachCount === 4) {
      return {
        kind: 'boulevard-crossing',
        label: 'Traversée de boulevard',
        reason:
          'Axe principal de classe « primary » identifié. Trafic axial dominant, traversée secondaire ortho.',
      };
    }
    if (isPedestrianHeavy) {
      return {
        kind: 'pedestrian-heavy-node',
        label: 'Carrefour à forte demande piétonne',
        reason: `${geometry.nearbyPoi.length} POI piétonnes à < 150 m (${geometry.nearbyPoi
          .map((p) => p.kind)
          .join(', ')}).`,
      };
    }
    if (
      geometry.nearestSignalDistanceMeters !== undefined &&
      geometry.nearestSignalDistanceMeters < 200
    ) {
      return {
        kind: 'corridor-node',
        label: 'Nœud de corridor coordonné',
        reason: `Signal aval à ${Math.round(
          geometry.nearestSignalDistanceMeters,
        )} m — coordination obligatoire.`,
      };
    }
    return {
      kind: 'compact-crossroad',
      label: 'Carrefour cruciforme compact',
      reason: `${approachCount} approches orthogonales, contexte urbain standard.`,
    };
  }

  // =================================================================
  // Skew analysis — measure deviation from perfect cardinal axes
  // =================================================================

  // =================================================================
  // Map context detection (residential / commercial / industrial …)
  // =================================================================

  private detectMapContext(
    input: ProposalGenerationInput,
    geometry: ObservedGeometry,
  ): MapContext {
    const drivers: string[] = [];
    let heavyVehicleScore = 2;
    let kind: MapContext['kind'] = 'unknown';
    let label = 'Contexte indéterminé';

    // 1) Land use polygons (when provided by frontend)
    const lu = geometry.landUses ?? [];
    const closeUses = lu.filter((entry) => entry.distanceMeters < 100);
    const farUses = lu.filter((entry) => entry.distanceMeters < 200);

    const luCount = (target: string) =>
      farUses.filter((entry) => entry.kind === target).length;

    // 2) Highway class signature
    const hasMotorwayLike = geometry.approaches.some(
      (a) => a.highwayClass === 'motorway' || a.highwayClass === 'trunk',
    );
    const hasPrimary = geometry.approaches.some(
      (a) => a.highwayClass === 'primary',
    );
    const allResidential = geometry.approaches.every(
      (a) => a.highwayClass === 'residential' || a.highwayClass === 'unclassified',
    );

    // 3) POI signature
    const poiKinds = new Set(geometry.nearbyPoi.map((p) => p.kind));

    // Classification ladder
    if (hasMotorwayLike || luCount('industrial') >= 2) {
      kind = 'logistics-corridor';
      label = 'Corridor logistique / industriel';
      heavyVehicleScore = 8;
      drivers.push('Axe primaire / autoroute ou zone industrielle');
    } else if (luCount('industrial') >= 1) {
      kind = 'industrial';
      label = 'Zone industrielle';
      heavyVehicleScore = 7;
      drivers.push('Land use industriel à proximité');
    } else if (
      luCount('commercial') >= 1 ||
      luCount('retail') >= 1 ||
      poiKinds.has('shopping') ||
      poiKinds.has('market')
    ) {
      kind = 'commercial';
      label = 'Zone commerçante';
      heavyVehicleScore = 4;
      drivers.push('Commerces / marché à proximité');
    } else if (
      luCount('education') >= 1 ||
      poiKinds.has('school') ||
      poiKinds.has('hospital') ||
      poiKinds.has('mosque') ||
      poiKinds.has('church')
    ) {
      kind = 'institutional';
      label = 'Zone institutionnelle (école / culte / hôpital)';
      heavyVehicleScore = 2;
      drivers.push('POI institutionnels (école, culte, hôpital)');
    } else if (hasPrimary) {
      kind = 'boulevard';
      label = 'Carrefour de boulevard';
      heavyVehicleScore = 5;
      drivers.push('Axe principal de classe primary');
    } else if (closeUses.some((u) => u.kind === 'residential')) {
      kind = 'residential';
      label = 'Quartier résidentiel';
      heavyVehicleScore = 2;
      drivers.push('Land use résidentiel proche');
    } else if (
      allResidential &&
      geometry.approaches.length <= 4 &&
      geometry.nearbyPoi.length === 0
    ) {
      kind = 'rural';
      label = 'Voirie locale / rurale';
      heavyVehicleScore = 3;
      drivers.push('Approches résidentielles + peu de POI');
    } else if (geometry.nearbyPoi.length >= 2) {
      kind = 'mixed-urban';
      label = 'Tissu urbain mixte';
      heavyVehicleScore = 4;
      drivers.push(`${geometry.nearbyPoi.length} POI dans 200 m`);
    }

    // Scope override
    if (input.scope === 'cablage') {
      heavyVehicleScore = Math.max(heavyVehicleScore, 4);
    }

    // Confidence : how strong was the signal ?
    let confidence = 0.4;
    if (lu.length >= 2) confidence += 0.3;
    if (geometry.nearbyPoi.length >= 2) confidence += 0.15;
    if (geometry.source && /OSM/.test(geometry.source)) confidence += 0.15;
    confidence = Math.min(1, confidence);

    return {
      kind,
      label,
      drivers: drivers.length > 0 ? drivers : ['Signal insuffisant'],
      heavyVehicleScore,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  // =================================================================
  // Confidence — aggregate study-level scoring
  // =================================================================

  private computeConfidence(
    rawGeometry: ObservedGeometry | undefined,
    classification: { kind: IntersectionClassification },
    resolvedGeometry: ObservedGeometry,
    mapContext: MapContext,
  ): StudyConfidence {
    // Geometry confidence : 1.0 if OSM, otherwise 0.4 (synthetic).
    const geometry =
      rawGeometry && /OSM/.test(rawGeometry.source ?? '')
        ? 1.0
        : rawGeometry
          ? 0.7
          : 0.4;

    // Classification : higher when multiple signals agree.
    let classificationScore = 0.55;
    if (resolvedGeometry.tramLines.length > 0) classificationScore += 0.2;
    if (resolvedGeometry.hasRoundabout) classificationScore += 0.2;
    if (resolvedGeometry.approaches.length >= 4) classificationScore += 0.1;
    if (
      classification.kind === 'compact-crossroad' ||
      classification.kind === 'unknown' as IntersectionClassification
    )
      classificationScore = 0.45;
    classificationScore = Math.min(1, classificationScore);

    // Pedestrian : high when POIs + land use both inform.
    let pedestrianExposure = 0.5;
    if (resolvedGeometry.nearbyPoi.length >= 2) pedestrianExposure += 0.25;
    if ((resolvedGeometry.landUses ?? []).length >= 1)
      pedestrianExposure += 0.15;
    pedestrianExposure = Math.min(1, pedestrianExposure);

    // Strategy : driven by classification fit + map context confidence.
    const strategy =
      Math.round(((classificationScore + mapContext.confidence) / 2) * 100) /
      100;

    return {
      geometry: Math.round(geometry * 100) / 100,
      classification: Math.round(classificationScore * 100) / 100,
      pedestrianExposure: Math.round(pedestrianExposure * 100) / 100,
      strategy,
    };
  }

  private computeSkewSeverity(approaches: ObservedApproach[]): {
    maxSkewDeg: number;
    avgSkewDeg: number;
  } {
    if (approaches.length === 0) return { maxSkewDeg: 0, avgSkewDeg: 0 };
    let max = 0;
    let sum = 0;
    for (const approach of approaches) {
      const cardinal = this.bearingToDegrees(approach.bearing);
      // Smallest signed deviation from the nominal cardinal angle.
      let diff = Math.abs(approach.bearingDegrees - cardinal);
      if (diff > 180) diff = 360 - diff;
      max = Math.max(max, diff);
      sum += diff;
    }
    return { maxSkewDeg: max, avgSkewDeg: sum / approaches.length };
  }

  // =================================================================
  // Dominant axis
  // =================================================================

  private findDominantAxis(geometry: ObservedGeometry): DominantAxis | null {
    const oppositeMap: Record<ApproachBearing, ApproachBearing> = {
      N: 'S',
      S: 'N',
      E: 'W',
      W: 'E',
      NE: 'SW',
      SW: 'NE',
      NW: 'SE',
      SE: 'NW',
    };
    let best: {
      pair: [ApproachBearing, ApproachBearing];
      score: number;
      reason: string;
    } | null = null;
    for (const approach of geometry.approaches) {
      const opp = oppositeMap[approach.bearing];
      const oppApproach = geometry.approaches.find(
        (entry) => entry.bearing === opp,
      );
      if (!oppApproach) continue;
      const score =
        this.highwayClassWeight(approach.highwayClass) +
        this.highwayClassWeight(oppApproach.highwayClass) +
        approach.laneCount +
        oppApproach.laneCount;
      const reason = `Axe ${approach.bearing}/${opp} — classes ${approach.highwayClass}/${oppApproach.highwayClass}, ${approach.laneCount + oppApproach.laneCount} voies cumulées.`;
      if (!best || score > best.score) {
        best = { pair: [approach.bearing, opp], score, reason };
      }
    }
    if (!best) return null;
    return { bearings: best.pair, reason: best.reason };
  }

  private highwayClassWeight(klass: string): number {
    switch (klass) {
      case 'motorway':
      case 'trunk':
        return 10;
      case 'primary':
        return 7;
      case 'secondary':
        return 5;
      case 'tertiary':
        return 3;
      case 'unclassified':
      case 'residential':
        return 2;
      default:
        return 1;
    }
  }

  // =================================================================
  // Conflict points
  // =================================================================

  private estimateConflicts(geometry: ObservedGeometry): {
    points: ConflictPoint[];
    totalWeight: number;
  } {
    const points: ConflictPoint[] = [];
    let totalWeight = 0;

    // Crossing conflict per orthogonal pair of approaches.
    const orthogonal = (a: ApproachBearing, b: ApproachBearing): boolean => {
      const angleA = this.bearingToDegrees(a);
      const angleB = this.bearingToDegrees(b);
      let diff = Math.abs(angleA - angleB);
      if (diff > 180) diff = 360 - diff;
      return diff >= 60 && diff <= 120;
    };

    for (let i = 0; i < geometry.approaches.length; i += 1) {
      for (let j = i + 1; j < geometry.approaches.length; j += 1) {
        const a = geometry.approaches[i];
        const b = geometry.approaches[j];
        if (!orthogonal(a.bearing, b.bearing)) continue;
        const weight = (a.laneCount + b.laneCount) * 1.2;
        totalWeight += weight;
        points.push({
          id: `conf-${i}-${j}`,
          x: 50 + 30 * Math.cos((a.bearingDegrees * Math.PI) / 180),
          y: 50 - 30 * Math.sin((a.bearingDegrees * Math.PI) / 180),
          weight,
          label: `${a.bearing} TD × ${b.bearing} TD — ${a.laneCount + b.laneCount} voies`,
        });
      }
    }

    // Left-turn diverging conflicts (per approach with ≥2 lanes).
    for (const approach of geometry.approaches) {
      if (approach.laneCount < 2) continue;
      const weight = approach.laneCount * 0.9;
      totalWeight += weight;
      points.push({
        id: `lt-${approach.bearing}`,
        x: 50 + 18 * Math.cos((approach.bearingDegrees * Math.PI) / 180),
        y: 50 - 18 * Math.sin((approach.bearingDegrees * Math.PI) / 180),
        weight,
        label: `${approach.bearing} gauche — divergence`,
      });
    }

    // Pedestrian exposure adds risk weight.
    for (const crossing of geometry.pedestrianCrossings) {
      if (crossing.widthMeters >= 10) {
        const weight = crossing.widthMeters * 0.15;
        totalWeight += weight;
      }
    }

    return { points, totalWeight: Math.round(totalWeight * 10) / 10 };
  }

  // =================================================================
  // Pedestrian exposure
  // =================================================================

  private estimatePedestrianExposure(
    input: ProposalGenerationInput,
    geometry: ObservedGeometry,
    mapContext?: MapContext,
  ): PedestrianExposure {
    let score = 2;
    const drivers: string[] = [];
    if (mapContext) {
      if (mapContext.kind === 'commercial' || mapContext.kind === 'mixed-urban') {
        score += 1.5;
        drivers.push(`Contexte ${mapContext.kind}`);
      }
      if (mapContext.kind === 'institutional') {
        score += 1;
        drivers.push('Contexte institutionnel (école/hôpital)');
      }
      if (mapContext.kind === 'rural' || mapContext.kind === 'logistics-corridor') {
        score -= 1;
        drivers.push(`Contexte ${mapContext.kind} — peu de piétons`);
      }
    }
    // POI count
    for (const poi of geometry.nearbyPoi) {
      if (poi.distanceMeters < 100) {
        score += 1.5;
        drivers.push(
          `${poi.kind}${poi.name ? ` "${poi.name}"` : ''} à ${Math.round(poi.distanceMeters)} m`,
        );
      } else if (poi.distanceMeters < 200) {
        score += 0.75;
      }
    }
    // Wide crossings increase exposure
    const wideCrossings = geometry.pedestrianCrossings.filter(
      (c) => c.widthMeters >= 10,
    ).length;
    if (wideCrossings > 0) {
      score += wideCrossings * 0.8;
      drivers.push(`${wideCrossings} traversée(s) > 10 m`);
    }
    // Scope hints
    if (input.scope === 'tram') {
      score += 1;
      drivers.push('Site de transport en commun — flux quai-trottoir');
    }
    // Name keywords
    const name = input.name.toLowerCase();
    if (/(medina|m[ée]dina|souk|march[ée])/.test(name)) {
      score += 2;
      drivers.push('Contexte commerçant (médina/souk/marché)');
    }
    if (/(ecole|école|lyc[ée]e|coll[èe]ge|universit[ée])/.test(name)) {
      score += 1.5;
      drivers.push('Pôle scolaire/universitaire');
    }
    if (/(gare|station)/.test(name)) {
      score += 1.5;
      drivers.push('Pôle de transport multimodal');
    }
    if (
      input.notes &&
      /pieton|piéton|pedestrian|école|mosqu/i.test(input.notes)
    ) {
      score += 0.75;
      drivers.push('Note ingénieur — contexte piéton signalé');
    }

    const clamped = Math.max(0, Math.min(10, score));
    const level: PedestrianExposure['level'] =
      clamped >= 7
        ? 'critical'
        : clamped >= 5
          ? 'high'
          : clamped >= 3
            ? 'moderate'
            : 'low';
    return {
      score: Math.round(clamped * 10) / 10,
      level,
      drivers: drivers.length > 0 ? drivers : ['Contexte urbain standard'],
    };
  }

  // =================================================================
  // Constraint detection
  // =================================================================

  private detectConstraints(
    input: ProposalGenerationInput,
    geometry: ObservedGeometry,
    classification: { kind: IntersectionClassification },
    pedestrianExposure: PedestrianExposure,
    conflicts: { totalWeight: number },
    mapContext?: MapContext,
  ): StudyConstraint[] {
    const constraints: StudyConstraint[] = [];

    // ----- Roundabout-specific geometry checks -----
    if (
      classification.kind === 'mini-roundabout' ||
      geometry.hasRoundabout
    ) {
      // Deflection — can't measure precisely without DXF, but flag for review.
      constraints.push({
        code: 'insufficient-deflection',
        severity: 'warning',
        title: 'Déflection à vérifier',
        description:
          "Vérifier que chaque entrée présente une déflection >= 4° pour réduire la vitesse d'entrée. Une déflection insuffisante augmente le risque de pertes de contrôle dans l'anneau.",
        recommendedMitigation: [
          "Mesure géométrique sur plan terrain (rayon, angle d'entrée)",
          "Ajout d'îlots séparateurs si manquants",
          'Rétrécissement de la voie d\'entrée à 3.0-3.5 m',
        ],
      });
      // Pedestrian setback for roundabouts
      if (pedestrianExposure.score >= 4) {
        constraints.push({
          code: 'pedestrian-refuge-absent',
          severity: 'warning',
          title: 'Refuge piétons à valider',
          description:
            "Les traversées au giratoire doivent être positionnées en retrait du céder-le-passage (5-7 m) avec un refuge sur l'îlot séparateur. Vérifier la présence et la dimension du refuge.",
          recommendedMitigation: [
            "Ilôt séparateur >= 2 m de large",
            'Retrait des passages 5-7 m du céder-le-passage',
            "Marquage piéton renforcé (zébrures + bandes haptiques)",
          ],
        });
      }
    }

    // ----- Sight distance (skew + speed) -----
    const skewForSight = this.computeSkewSeverity(geometry.approaches);
    const maxSpeed = Math.max(
      ...geometry.approaches.map((a) => a.speedKph ?? 50),
    );
    if (skewForSight.maxSkewDeg >= 20 && maxSpeed >= 50) {
      constraints.push({
        code: 'sight-distance-risk',
        severity: 'warning',
        title: 'Distance de visibilité réduite',
        description: `Approches obliques (${skewForSight.maxSkewDeg.toFixed(0)}°) avec vitesse ${maxSpeed} km/h — la triangle de visibilité doit être validée (norme 2 × 30 m minimum à 50 km/h).`,
        recommendedMitigation: [
          'Triangle de visibilité 50×30 m à dégager (mobilier, végétation)',
          'Implantation feu sur potence (visibilité complémentaire)',
          'Réduction vitesse approche par marquage ou ralentisseur',
        ],
      });
    }

    // ----- Oversized crossing without refuge -----
    const oversizedCrossings = geometry.pedestrianCrossings.filter(
      (c) => c.widthMeters >= 14 && c.type !== 'refuge',
    );
    if (oversizedCrossings.length > 0) {
      constraints.push({
        code: 'oversized-crossing',
        severity: 'critical',
        title: 'Traversée surdimensionnée sans refuge',
        description: `${oversizedCrossings.length} traversée(s) >= 14 m sans refuge central — temps d'exposition piétons supérieur à 14 s à 1.0 m/s. Refuge central obligatoire ou réduction de chaussée.`,
        recommendedMitigation: [
          "Création d'un refuge central >= 2 m",
          'Réduction du nombre de voies traversées',
          'Vert piéton scindé en 2 (passage en 2 temps)',
        ],
      });
    }

    // ----- Heavy vehicle exposure from map context -----
    if (mapContext && mapContext.heavyVehicleScore >= 6) {
      constraints.push({
        code: 'heavy-vehicle-exposure',
        severity: mapContext.heavyVehicleScore >= 8 ? 'critical' : 'warning',
        title: 'Forte exposition poids lourds',
        description: `Contexte ${mapContext.kind} — exposition PL ${mapContext.heavyVehicleScore}/10. Vérifier rayons de giration (>= 12 m intérieur pour PL standard), longueurs de stockage en gauche, et durées de vert minimum (déchirage long).`,
        recommendedMitigation: [
          'Rayons de giration >= 12 m intérieur, 25 m extérieur',
          'Vert min ≥ 12 s sur axes PL',
          'Vérifier débord PL sur l\'îlot central (giratoire)',
        ],
      });
    }


    // Tram priority
    if (geometry.tramLines.length > 0 || input.scope === 'tram') {
      constraints.push({
        code: 'tram-priority-required',
        severity: 'critical',
        title: 'Priorité tramway requise',
        description:
          "Une ligne tramway en site propre intersecte le carrefour. L'agent IA `EmergencyVehicleAgent` " +
          'doit recevoir les annonces SigFer AT-IN/AT-OUT pour forcer une phase TC dédiée.',
        recommendedMitigation: [
          'Phase TC dédiée (≥ 10 s) sur appel SigFer',
          'Annonces 120 m amont + 20 m aval',
          'Bascule prioritaire avec respect des verts minimum véhicules',
        ],
      });
    }

    // Long pedestrian crossings
    const longCrossings = geometry.pedestrianCrossings.filter(
      (c) => c.widthMeters >= 10,
    );
    if (longCrossings.length > 0) {
      constraints.push({
        code: 'long-pedestrian-crossing',
        severity: 'warning',
        title: 'Traversées piétonnes longues',
        description: `${longCrossings.length} traversée(s) de ${longCrossings
          .map((c) => `${c.widthMeters.toFixed(1)} m`)
          .join(
            ', ',
          )} — vert piéton + dégagement à dimensionner pour 1.0 m/s ; refuge central recommandé.`,
        recommendedMitigation: [
          'Vert piéton ≥ longueur / 1.0 m/s',
          'Clignotant + 4 s d’avertissement',
          'Refuge central pour > 10 m',
        ],
      });
    }

    // Skew / visibility
    const skew = this.computeSkewSeverity(geometry.approaches);
    if (skew.maxSkewDeg >= 15) {
      constraints.push({
        code: 'visibility-skew',
        severity: skew.maxSkewDeg >= 30 ? 'critical' : 'warning',
        title: 'Angles d’approche obliques',
        description: `Déviation maximale ${skew.maxSkewDeg.toFixed(0)}° vs axe cardinal. Visibilité inter-approches réduite — implantation des feux à valider sur supports déportés.`,
        recommendedMitigation: [
          'Supports en potence pour visibilité complémentaire',
          'Rappel de feu côté trottoir opposé',
          'Vert min véhicule augmenté de 2 s',
        ],
      });
    }

    // Multiple turning conflicts
    if (conflicts.totalWeight >= 25) {
      constraints.push({
        code: 'multiple-turning-conflicts',
        severity: 'warning',
        title: 'Conflits de mouvement multiples',
        description: `Poids total de conflit ${conflicts.totalWeight.toFixed(1)} — phasage protégé des tourne-à-gauche fortement recommandé.`,
        recommendedMitigation: [
          'Tourne-à-gauche protégés sur axe principal',
          'Vérifier matrice de conflit complète',
          'Détecteurs présence + appel sur chaque voie gauche',
        ],
      });
    }

    // Asymmetric demand (lane count imbalance between opposite approaches)
    const laneImbalance = this.detectLaneImbalance(geometry.approaches);
    if (laneImbalance.imbalanced) {
      constraints.push({
        code: 'asymmetric-demand',
        severity: 'info',
        title: 'Géométrie asymétrique',
        description: `${laneImbalance.detail} — comptages directionnels à conduire pour valider l’allocation de vert.`,
        recommendedMitigation: [
          'Campagne de comptages HPM + HPS',
          'Splits initiaux pondérés par voies entrantes',
        ],
      });
    }

    // Pedestrian exposure
    if (
      pedestrianExposure.level === 'high' ||
      pedestrianExposure.level === 'critical'
    ) {
      constraints.push({
        code: 'high-pedestrian-exposure',
        severity:
          pedestrianExposure.level === 'critical' ? 'critical' : 'warning',
        title: 'Exposition piétonne élevée',
        description: `Score d’exposition ${pedestrianExposure.score}/10 (${pedestrianExposure.level}). Drivers : ${pedestrianExposure.drivers.join(', ')}.`,
        recommendedMitigation: [
          'Vert piéton à chaque cycle (pas d’appel BP)',
          'Phase tout-piéton (Barnes Dance) à envisager',
          'BP illuminés + retour visuel "appel enregistré"',
        ],
      });
    }

    // Boulevard crossing → spillback risk
    const hasBoulevard = geometry.approaches.some(
      (a) => a.highwayClass === 'primary' || a.highwayClass === 'trunk',
    );
    if (hasBoulevard) {
      constraints.push({
        code: 'queue-spillback-risk',
        severity: 'info',
        title: 'Risque de remontée de file sur axe principal',
        description:
          'Boulevard primaire identifié. Les coupures longues peuvent générer des remontées de file > 100 m bloquant les carrefours amont.',
        recommendedMitigation: [
          'Coordination corridor (offset HPM)',
          'Vert max axe principal ≥ 35 s',
          'Surveillance file via détecteurs avancés',
        ],
      });
    }

    // Corridor coordination
    if (
      geometry.nearestSignalDistanceMeters !== undefined &&
      geometry.nearestSignalDistanceMeters < 200
    ) {
      constraints.push({
        code: 'corridor-coordination',
        severity: 'warning',
        title: 'Coordination corridor obligatoire',
        description: `Signal aval à ${Math.round(
          geometry.nearestSignalDistanceMeters,
        )} m. Cycle commun + offset calé sur vitesse 50 km/h.`,
        recommendedMitigation: [
          'Cycle commun avec les carrefours amont/aval',
          'Offset = distance / vitesse_référence',
          'Agent CityTrafficManager pour ajustement IA',
        ],
      });
    }

    // Plaza / multi-leg
    if (
      classification.kind === 'plaza' ||
      classification.kind === 'multi-leg-junction'
    ) {
      constraints.push({
        code: 'multiple-turning-conflicts',
        severity: 'warning',
        title: 'Géométrie multi-branches',
        description:
          'Place urbaine ou jonction à 5+ branches — chaque mouvement doit être protégé indépendamment.',
        recommendedMitigation: [
          'Split phasing — chaque branche en phase dédiée',
          'Pas de mouvements permissifs',
        ],
      });
    }

    return constraints;
  }

  private detectLaneImbalance(approaches: ObservedApproach[]): {
    imbalanced: boolean;
    detail: string;
  } {
    const oppositeMap: Record<ApproachBearing, ApproachBearing> = {
      N: 'S',
      S: 'N',
      E: 'W',
      W: 'E',
      NE: 'SW',
      SW: 'NE',
      NW: 'SE',
      SE: 'NW',
    };
    for (const approach of approaches) {
      const opp = approaches.find(
        (entry) => entry.bearing === oppositeMap[approach.bearing],
      );
      if (!opp) continue;
      if (Math.abs(approach.laneCount - opp.laneCount) >= 1) {
        return {
          imbalanced: true,
          detail: `Approches ${approach.bearing}/${opp.bearing} : ${approach.laneCount} vs ${opp.laneCount} voies`,
        };
      }
    }
    return { imbalanced: false, detail: '' };
  }

  // =================================================================
  // Complexity scoring
  // =================================================================

  private scoreComplexity(
    input: ProposalGenerationInput,
    geometry: ObservedGeometry,
    classification: { kind: IntersectionClassification },
    constraints: StudyConstraint[],
    pedestrian: PedestrianExposure,
  ): {
    score: number;
    band: 'low' | 'moderate' | 'high' | 'critical';
    drivers: string[];
  } {
    let score = 2;
    const drivers: string[] = [];

    // Approach count
    if (geometry.approaches.length >= 5) {
      score += 2.5;
      drivers.push(`${geometry.approaches.length} branches`);
    } else if (geometry.approaches.length === 3) {
      score += 0.5;
    } else {
      drivers.push(`${geometry.approaches.length} branches`);
    }

    // Skew
    const skew = this.computeSkewSeverity(geometry.approaches);
    if (skew.maxSkewDeg >= 30) {
      score += 2;
      drivers.push(`Skew sévère ${skew.maxSkewDeg.toFixed(0)}°`);
    } else if (skew.maxSkewDeg >= 15) {
      score += 1;
      drivers.push(`Skew modéré ${skew.maxSkewDeg.toFixed(0)}°`);
    }

    // Tram
    if (geometry.tramLines.length > 0 || input.scope === 'tram') {
      score += 1.5;
      drivers.push('Tramway intégré');
    }

    // Boulevard
    if (
      geometry.approaches.some(
        (a) => a.highwayClass === 'primary' || a.highwayClass === 'trunk',
      )
    ) {
      score += 1;
      drivers.push('Axe principal de classe primary');
    }

    // Pedestrian exposure
    if (pedestrian.level === 'critical') {
      score += 1.5;
      drivers.push('Exposition piétonne critique');
    } else if (pedestrian.level === 'high') {
      score += 1;
      drivers.push('Exposition piétonne élevée');
    }

    // Constraint count
    const criticalConstraints = constraints.filter(
      (c) => c.severity === 'critical',
    ).length;
    if (criticalConstraints > 0) {
      score += criticalConstraints * 0.5;
      drivers.push(`${criticalConstraints} contrainte(s) critique(s)`);
    }

    // Lane imbalance
    if (this.detectLaneImbalance(geometry.approaches).imbalanced) {
      score += 0.5;
      drivers.push('Géométrie asymétrique');
    }

    // Multi-leg fallback
    if (classification.kind === 'plaza') {
      score += 0.5;
    }

    const clamped = Math.max(0, Math.min(10, score));
    const band =
      clamped >= 8
        ? 'critical'
        : clamped >= 6
          ? 'high'
          : clamped >= 4
            ? 'moderate'
            : 'low';
    return { score: clamped, band, drivers };
  }

  // =================================================================
  // Strategy recommendation
  // =================================================================

  private recommendVariants(
    input: ProposalGenerationInput,
    classification: { kind: IntersectionClassification },
    constraints: StudyConstraint[],
    complexity: number,
  ): string[] {
    const scores = new Map<string, number>([
      ['compact-2-phase', 0],
      ['standard-3-phase', 0],
      ['protected-4-phase', 0],
      ['adaptive-smart', 0],
      ['tram-priority', 0],
      ['pedestrian-priority', 0],
      // Roundabout family
      ['unsignalized-mini-roundabout', 0],
      ['signalized-roundabout', 0],
      ['metered-roundabout', 0],
      ['pedestrian-controlled-entries', 0],
    ]);
    const bump = (variant: string, delta: number) =>
      scores.set(variant, (scores.get(variant) ?? 0) + delta);

    // Classification-driven defaults
    switch (classification.kind) {
      case 'compact-crossroad':
        bump('compact-2-phase', 6);
        bump('standard-3-phase', 7);
        bump('adaptive-smart', 8);
        break;
      case 'skewed-crossroad':
        bump('protected-4-phase', 9);
        bump('adaptive-smart', 8);
        bump('standard-3-phase', 5);
        break;
      case 'boulevard-crossing':
        bump('protected-4-phase', 9);
        bump('adaptive-smart', 9);
        bump('standard-3-phase', 7);
        break;
      case 't-junction':
        bump('compact-2-phase', 9);
        bump('adaptive-smart', 7);
        bump('standard-3-phase', 6);
        break;
      case 'y-junction':
        bump('protected-4-phase', 8);
        bump('adaptive-smart', 7);
        bump('compact-2-phase', 4);
        break;
      case 'multi-leg-junction':
      case 'plaza':
        bump('protected-4-phase', 9);
        bump('adaptive-smart', 8);
        break;
      case 'tramway-intersection':
        bump('tram-priority', 10);
        bump('adaptive-smart', 8);
        bump('protected-4-phase', 7);
        break;
      case 'pedestrian-heavy-node':
        bump('pedestrian-priority', 10);
        bump('adaptive-smart', 7);
        bump('compact-2-phase', 6);
        break;
      case 'corridor-node':
        bump('adaptive-smart', 9);
        bump('standard-3-phase', 8);
        bump('protected-4-phase', 7);
        break;
      case 'offset-intersection':
        bump('protected-4-phase', 8);
        bump('adaptive-smart', 8);
        break;
      case 'mini-roundabout':
        // Roundabout family — signalised templates are NOT appropriate.
        // The engineering choice is between status quo vs progressive
        // signalisation depending on capacity + pedestrian exposure.
        bump('unsignalized-mini-roundabout', 9);
        bump('metered-roundabout', 7);
        bump('signalized-roundabout', 6);
        bump('pedestrian-controlled-entries', 6);
        // Forbid pure signalised templates for roundabouts.
        bump('compact-2-phase', -20);
        bump('standard-3-phase', -20);
        bump('protected-4-phase', -20);
        break;
    }

    // Constraint-driven adjustments
    for (const constraint of constraints) {
      if (constraint.code === 'tram-priority-required')
        bump('tram-priority', 5);
      if (constraint.code === 'high-pedestrian-exposure') {
        bump('pedestrian-priority', 4);
        bump('pedestrian-controlled-entries', 4); // roundabout-family equivalent
      }
      if (constraint.code === 'multiple-turning-conflicts')
        bump('protected-4-phase', 3);
      if (constraint.code === 'corridor-coordination')
        bump('adaptive-smart', 3);
      if (constraint.code === 'queue-spillback-risk') bump('adaptive-smart', 2);
      if (constraint.code === 'roundabout-capacity-exceeded') {
        bump('signalized-roundabout', 4);
        bump('metered-roundabout', 3);
        bump('unsignalized-mini-roundabout', -3);
      }
      if (constraint.code === 'insufficient-deflection') {
        bump('signalized-roundabout', 2);
      }
    }

    // High complexity → bias against bi-phase
    if (complexity >= 6) {
      bump('compact-2-phase', -3);
      bump('protected-4-phase', 2);
      bump('adaptive-smart', 2);
    }

    // Scope guard
    if (input.scope !== 'tram') {
      scores.set('tram-priority', -10);
    }

    return [...scores.entries()]
      .filter(([, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([variant]) => variant);
  }

  // =================================================================
  // Helpers
  // =================================================================

  private bearingToDegrees(bearing: ApproachBearing): number {
    return {
      N: 0,
      NE: 45,
      E: 90,
      SE: 135,
      S: 180,
      SW: 225,
      W: 270,
      NW: 315,
    }[bearing];
  }
}
